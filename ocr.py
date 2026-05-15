"""
OCR pipeline for Panini sticker back scanning.
Extracts sticker codes (e.g. 'ARG 17') from photos of sticker backs.
"""

import re
import sqlite3
from io import BytesIO

import pytesseract
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

import os as _os
DB_PATH = _os.getenv("DB_PATH", "stickers.db")

_CODE_SET: set[str] = set()
_CODE_LIST: list[str] = []


def _load_codes():
    global _CODE_SET, _CODE_LIST
    if _CODE_SET:
        return
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT sticker_code FROM stickers").fetchall()
    conn.close()
    _CODE_SET = {r[0] for r in rows}
    _CODE_LIST = sorted(_CODE_SET)


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


def _preprocess(image: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Return (normal, inverted) binarized images ready for Tesseract."""
    img = image.convert("L")
    w, h = img.size

    # Upscale to at least 2400px wide — Tesseract needs ~300 DPI equivalent
    if w < 2400:
        scale = 2400 / w
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Sharpen before binarizing
    img = ImageEnhance.Sharpness(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)

    # Otsu binarization — pure black and white, best for Tesseract
    threshold = _otsu_threshold(img)
    binary = img.point(lambda x: 255 if x >= threshold else 0)
    inverted = ImageOps.invert(binary)

    return binary, inverted


def _ocr_raw(image: Image.Image) -> str:
    binary, inverted = _preprocess(image)
    parts = []
    # PSM 11 = sparse text (finds text anywhere, no layout assumption) — best for sticker backs
    # PSM 6  = uniform block — fallback
    # PSM 7  = single text line — good when code is isolated
    for psm in (11, 6, 7):
        cfg = f'--psm {psm} -c tessedit_char_whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 "'
        parts.append(pytesseract.image_to_string(binary, config=cfg))
        parts.append(pytesseract.image_to_string(inverted, config=cfg))
    return '\n'.join(parts)


def _parse_candidates(raw: str) -> list[str]:
    # Collapse spaces between consecutive digits ("1 7" → "17")
    normalized = raw
    prev = None
    while prev != normalized:
        prev = normalized
        normalized = re.sub(r'(\d) (\d)', r'\1\2', normalized)

    tokens = re.findall(r'\b([A-Z]{2,3})\s*(\d{1,2})\b', normalized)
    seen = set()
    codes = []
    for c, n in tokens:
        code = f"{c} {n}"
        if code not in seen:
            seen.add(code)
            codes.append(code)
    return codes


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


def scan_image(image_bytes: bytes) -> dict:
    _load_codes()
    image = Image.open(BytesIO(image_bytes))
    raw = _ocr_raw(image)
    detected = _parse_candidates(raw)

    matches = []
    for code in detected:
        corrected = _fuzzy_correct(code)
        if corrected:
            sticker = lookup_sticker(corrected)
            if sticker and sticker not in matches:
                matches.append(sticker)

    if len(matches) == 1:
        return {"status": "match", "raw_ocr": raw.strip(), "detected_codes": detected, "match": matches[0], "candidates": matches}
    elif len(matches) > 1:
        return {"status": "candidates", "raw_ocr": raw.strip(), "detected_codes": detected, "match": None, "candidates": matches}
    else:
        return {"status": "no_match", "raw_ocr": raw.strip(), "detected_codes": detected, "match": None, "candidates": []}
