"""
OCR pipeline for Panini sticker back scanning.
Extracts sticker codes (e.g. 'ARG 17') from photos of sticker backs.

Primary: Claude vision API (fast, accurate)
Fallback: Tesseract (when ANTHROPIC_API_KEY is not set)
"""

import base64
import re
import urllib.parse
from io import BytesIO

import psycopg2
import psycopg2.extras
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

import os as _os
_DATABASE_URL = _os.getenv("DATABASE_URL", "")
_ANTHROPIC_KEY = _os.getenv("ANTHROPIC_API_KEY", "")


def _pg_connect():
    r = urllib.parse.urlparse(_DATABASE_URL)
    return psycopg2.connect(
        host=r.hostname, port=r.port or 5432,
        dbname=r.path.lstrip("/"), user=r.username, password=r.password,
        sslmode="require",
    )

_CODE_SET: set[str] = set()
_CODE_LIST: list[str] = []

# Letters that Tesseract commonly reads instead of digits (bold fonts)
_LETTER_AS_DIGIT = {"G": "6", "O": "0", "I": "1", "B": "8", "Z": "2"}


def _load_codes():
    global _CODE_SET, _CODE_LIST
    if _CODE_SET:
        return
    conn = _pg_connect()
    cur = conn.cursor()
    cur.execute("SELECT sticker_code FROM stickers")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    _CODE_SET = {r[0] for r in rows}
    _CODE_LIST = sorted(_CODE_SET)


# ─── Claude vision OCR ───────────────────────────────────────────────────────

def _ocr_claude(image: Image.Image) -> list[str]:
    """
    Use Claude vision to extract the sticker code from the badge.
    Returns a list of candidate code strings (usually just one).
    """
    import anthropic

    # Resize to max 1000px on longest side before sending — Claude reads it fine at this size
    w, h = image.size
    max_dim = max(w, h)
    if max_dim > 1000:
        scale = 1000 / max_dim
        image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    buf = BytesIO()
    image.save(buf, format="JPEG", quality=80)
    b64 = base64.standard_b64encode(buf.getvalue()).decode()
    print(f"[SCAN] sending {image.size}, {len(buf.getvalue())} bytes → Claude")

    client = anthropic.Anthropic(api_key=_ANTHROPIC_KEY)
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=64,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/jpeg", "data": b64},
                },
                {
                    "type": "text",
                    "text": (
                        "This is the back of a Panini FIFA World Cup 2026 sticker. "
                        "There is a dark rounded badge in the top-right corner containing "
                        "the sticker code: 2-3 capital letters (country code) then a space then 1-2 digits (1-20), "
                        "e.g. 'ARG 17', 'RSA 6', 'CZE 6', 'IRQ 15', 'FWC 1'. "
                        "Important: the country code is always letters, never digits — "
                        "if you see what looks like a 1 at the start, it is the letter I (as in IRQ for Iraq). "
                        "In the dark badge, 6 can look like G, 0 like O, 1 like I, 8 like B — "
                        "always output a digit for the number part and a letter for the country code. "
                        "Reply with ONLY the sticker code, nothing else. "
                        "If you genuinely cannot read it, reply with UNKNOWN."
                    ),
                },
            ],
        }],
    )

    raw = msg.content[0].text.strip().upper()
    if raw == "UNKNOWN" or not raw:
        return []

    # Parse whatever Claude returned
    return _parse_candidates(raw) or ([raw] if re.match(r'^[A-Z]{2,3} \d{1,2}$', raw) else [])


# ─── Tesseract fallback OCR ───────────────────────────────────────────────────

def _otsu_threshold(img: Image.Image) -> int:
    hist = img.histogram()
    total = img.width * img.height
    sum_total = sum(i * hist[i] for i in range(256))
    sum_b, w_b, max_var, threshold = 0, 0, 0, 128
    for t in range(256):
        w_b += hist[t]
        if not w_b:
            continue
        w_f = total - w_b
        if not w_f:
            break
        sum_b += t * hist[t]
        mb = sum_b / w_b
        mf = (sum_total - sum_b) / w_f
        var = w_b * w_f * (mb - mf) ** 2
        if var > max_var:
            max_var = var
            threshold = t
    return threshold


def _crop_badge(image: Image.Image) -> Image.Image:
    """Crop to the sticker code badge in the top-right corner."""
    w, h = image.size
    if h >= w:  # portrait
        return image.crop((int(w * 0.60), int(h * 0.10), w, int(h * 0.26)))
    else:  # landscape
        return image.crop((int(w * 0.65), 0, w, int(h * 0.35)))


def _ocr_badge_tesseract(image: Image.Image) -> str:
    badge = _crop_badge(image)
    bw, bh = badge.size
    scale = max(1.0, 1200 / bw)
    badge = badge.resize((int(bw * scale), int(bh * scale)), Image.LANCZOS)

    gray = badge.convert("L")
    threshold = _otsu_threshold(gray)
    binary = gray.point(lambda x: 255 if x >= threshold else 0)
    inverted = ImageOps.invert(binary)

    whitelist = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '
    parts = []
    for img_var in (gray, inverted):
        cfg = f'--psm 11 -c tessedit_char_whitelist="{whitelist}"'
        parts.append(pytesseract.image_to_string(img_var, config=cfg))
    cfg7 = f'--psm 7 -c tessedit_char_whitelist="{whitelist}"'
    parts.append(pytesseract.image_to_string(inverted, config=cfg7))
    return '\n'.join(parts)


def _ocr_full_tesseract(image: Image.Image) -> str:
    img = image.convert("L")
    w, h = img.size
    if w < 2400:
        scale = 2400 / w
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    img = ImageEnhance.Sharpness(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)
    threshold = _otsu_threshold(img)
    binary = img.point(lambda x: 255 if x >= threshold else 0)
    inverted = ImageOps.invert(binary)

    parts = []
    for psm in (11, 6, 7):
        cfg = f'--psm {psm} -c tessedit_char_whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 "'
        parts.append(pytesseract.image_to_string(binary, config=cfg))
        parts.append(pytesseract.image_to_string(inverted, config=cfg))
    return '\n'.join(parts)


# ─── Candidate parsing ────────────────────────────────────────────────────────

def _parse_candidates(raw: str) -> list[str]:
    normalized = raw
    prev = None
    while prev != normalized:
        prev = normalized
        normalized = re.sub(r'(\d) (\d)', r'\1\2', normalized)

    seen: set[str] = set()
    codes: list[str] = []

    def _add(code: str) -> None:
        if code not in seen:
            seen.add(code)
            codes.append(code)

    for c, n in re.findall(r'\b([A-Z]{2,3})\s*(\d{1,2})\b', normalized):
        _add(f"{c} {n}")

    # Catch digit-as-letter in the country prefix (e.g. "1RQ 15" → "IRQ 15" when I is read as 1)
    _DIGIT_AS_LETTER = {"1": "I", "0": "O", "8": "B"}
    for c, n in re.findall(r'\b([A-Z0-9]{2,3})\s*(\d{1,2})\b', normalized):
        if not c.isalpha() and any(ch in _DIGIT_AS_LETTER for ch in c):
            corrected = ''.join(_DIGIT_AS_LETTER.get(ch, ch) for ch in c)
            _add(f"{corrected} {n}")

    # Catch letter-as-single-digit (e.g. "RSAG" → "RSA 6" when bold font confuses Tesseract)
    for c, letter in re.findall(r'\b([A-Z]{2,3})\s*([GOBIZ])\b', normalized):
        if letter in _LETTER_AS_DIGIT:
            _add(f"{c} {_LETTER_AS_DIGIT[letter]}")

    return codes


# ─── Fuzzy correction ─────────────────────────────────────────────────────────

def _fuzzy_correct(code: str) -> str | None:
    _load_codes()

    if code in _CODE_SET:
        return code

    # Character confusions in the country-code prefix (maps to list of alternatives)
    PREFIX_CONFUSIONS = {
        "0": ["O"],
        "O": ["0", "Q"],  # O and Q look identical when Q's tail is hidden by the badge shape
        "Q": ["O"],
        "1": ["I"],
        "I": ["1"],
        "5": ["S"],
        "S": ["5"],
        "8": ["B"],
        "B": ["8"],
    }
    # Visually similar digits that Tesseract/Claude confuse in the number field
    NUM_ALTERNATIVES = {
        "2": ["6", "7"],
        "6": ["2", "8"],
        "0": ["8", "6"],
        "8": ["0", "6"],
        "1": ["7"],
        "7": ["1"],
        "9": ["4"],
        "4": ["9"],
    }

    parts = code.split(" ", 1)
    if len(parts) != 2:
        return None
    prefix, num = parts

    # Strip accidental leading zero (e.g. Claude returns "RSA 06" for "RSA 6")
    stripped_num = num.lstrip("0") or "0"
    if stripped_num != num:
        alt = f"{prefix} {stripped_num}"
        if alt in _CODE_SET:
            return alt

    def _try(p, n):
        alt = f"{p} {n}"
        if alt in _CODE_SET:
            return alt
        stripped = n.lstrip("0") or "0"
        if stripped != n:
            alt2 = f"{p} {stripped}"
            if alt2 in _CODE_SET:
                return alt2
        return None

    # 1. Correct prefix only
    for i, ch in enumerate(prefix):
        for alt_ch in PREFIX_CONFUSIONS.get(ch, []):
            alt_prefix = prefix[:i] + alt_ch + prefix[i+1:]
            result = _try(alt_prefix, num)
            if result:
                return result

    # 2. Correct number only
    for i, ch in enumerate(num):
        for alt_digit in NUM_ALTERNATIVES.get(ch, []):
            alt_num = num[:i] + alt_digit + num[i+1:]
            result = _try(prefix, alt_num)
            if result:
                return result

    # 3. Correct both prefix and number (covers double-error cases like RAS 2 → RSA 6)
    for i, ch in enumerate(prefix):
        for alt_ch in PREFIX_CONFUSIONS.get(ch, []):
            alt_prefix = prefix[:i] + alt_ch + prefix[i+1:]
            for j, dch in enumerate(num):
                for alt_digit in NUM_ALTERNATIVES.get(dch, []):
                    alt_num = num[:j] + alt_digit + num[j+1:]
                    result = _try(alt_prefix, alt_num)
                    if result:
                        return result

    if prefix in {"FWC", "FW", "WC"}:
        alt = f"FWC {num}"
        if alt in _CODE_SET:
            return alt

    return None


def lookup_sticker(code: str) -> dict | None:
    conn = _pg_connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT id, sticker_code, team_name, player_name, sticker_type, club "
        "FROM stickers WHERE sticker_code = %s",
        (code,)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return dict(row) if row else None


# ─── Main entry point ─────────────────────────────────────────────────────────

def scan_image(image_bytes: bytes) -> dict:
    _load_codes()
    image = Image.open(BytesIO(image_bytes))

    detected: list[str] = []

    if _ANTHROPIC_KEY:
        # Primary: Claude vision — fast and accurate
        try:
            detected = _ocr_claude(image)
        except Exception as e:
            print(f"[SCAN] Claude vision error: {e}, falling back to Tesseract")

    if not detected:
        # Fallback: Tesseract with badge crop
        print("[SCAN] path=tesseract (Claude unavailable or returned UNKNOWN)")
        badge_raw = _ocr_badge_tesseract(image)
        badge_candidates = _parse_candidates(badge_raw)
        full_raw = _ocr_full_tesseract(image)
        full_candidates = _parse_candidates(full_raw)
        seen: set[str] = set()
        for code in badge_candidates + full_candidates:
            if code not in seen:
                seen.add(code)
                detected.append(code)

    matches = []
    for code in detected:
        corrected = _fuzzy_correct(code)
        if corrected:
            sticker = lookup_sticker(corrected)
            if sticker and sticker not in matches:
                matches.append(sticker)

    if len(matches) == 1:
        return {"status": "match", "detected_codes": detected, "match": matches[0], "candidates": matches}
    elif len(matches) > 1:
        return {"status": "candidates", "detected_codes": detected, "match": None, "candidates": matches}
    else:
        return {"status": "no_match", "detected_codes": detected, "match": None, "candidates": []}
