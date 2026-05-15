"""
OCR pipeline for Panini sticker back scanning.
Extracts sticker codes (e.g. 'ARG 17') from photos of sticker backs.

Primary: Claude vision API (fast, accurate)
Fallback: Tesseract (when ANTHROPIC_API_KEY is not set)
"""

import base64
import re
import sqlite3
from io import BytesIO

import pytesseract
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

import os as _os
DB_PATH = _os.getenv("DB_PATH", "stickers.db")
_ANTHROPIC_KEY = _os.getenv("ANTHROPIC_API_KEY", "")

_CODE_SET: set[str] = set()
_CODE_LIST: list[str] = []

# Letters that Tesseract commonly reads instead of digits (bold fonts)
_LETTER_AS_DIGIT = {"G": "6", "O": "0", "I": "1", "B": "8", "Z": "2"}


def _load_codes():
    global _CODE_SET, _CODE_LIST
    if _CODE_SET:
        return
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT sticker_code FROM stickers").fetchall()
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

    # Crop to just the badge area — far less data to send
    badge = _crop_badge(image)
    # Resize badge to at most 600px wide — plenty for Claude to read text
    bw, bh = badge.size
    if bw > 600:
        badge = badge.resize((600, int(bh * 600 / bw)), Image.LANCZOS)

    buf = BytesIO()
    badge.save(buf, format="JPEG", quality=80)
    b64 = base64.standard_b64encode(buf.getvalue()).decode()
    print(f"[SCAN] badge crop {badge.size}, {len(buf.getvalue())} bytes → Claude")

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
                        "the sticker code (country letters + number, e.g. 'ARG 17' or 'RSA 6'). "
                        "Reply with ONLY the sticker code, nothing else. "
                        "If you cannot read it clearly, reply with UNKNOWN."
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

    CONFUSIONS = {
        "0": "O", "O": "0",
        "1": "I", "I": "1",
        "5": "S", "S": "5",
        "8": "B", "B": "8",
    }
    parts = code.split(" ", 1)
    if len(parts) != 2:
        return None
    prefix, num = parts

    for i, ch in enumerate(prefix):
        if ch in CONFUSIONS:
            alt_prefix = prefix[:i] + CONFUSIONS[ch] + prefix[i+1:]
            alt_code = f"{alt_prefix} {num}"
            if alt_code in _CODE_SET:
                return alt_code

    if prefix in {"FWC", "FW", "WC"}:
        alt = f"FWC {num}"
        if alt in _CODE_SET:
            return alt

    return None


def lookup_sticker(code: str) -> dict | None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT id, sticker_code, team_name, player_name, sticker_type, club "
        "FROM stickers WHERE sticker_code = ?",
        (code,)
    ).fetchone()
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
