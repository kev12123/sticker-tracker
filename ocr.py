"""
OCR pipeline for Panini sticker back scanning.
Extracts sticker codes (e.g. 'ARG 17') from photos of sticker backs.
"""

import re
import sqlite3
from io import BytesIO

import pytesseract
from PIL import Image, ImageEnhance, ImageFilter

import os as _os
DB_PATH = _os.getenv("DB_PATH", "stickers.db")

# All valid sticker codes pre-loaded at startup for fuzzy matching
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


def _preprocess(image: Image.Image) -> Image.Image:
    img = image.convert("L")  # grayscale
    w, h = img.size
    # Always upscale to at least 1600px wide — the cropped viewfinder region can be
    # small (e.g. 320px) and Tesseract accuracy drops sharply below ~30px font height.
    target_w = max(1600, w)
    if w < target_w:
        scale = target_w / w
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    img = ImageEnhance.Contrast(img).enhance(2.5)
    img = ImageEnhance.Sharpness(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)
    return img


def _ocr_raw(image: Image.Image) -> str:
    from PIL import ImageOps
    processed = _preprocess(image)
    inverted = ImageOps.invert(processed)

    # Run multiple passes: PSM 6 (uniform block) and PSM 11 (sparse text),
    # both on the normal and inverted image to handle light-on-dark sticker backs.
    parts = []
    for psm in (6, 11):
        cfg = f'--psm {psm} -c tessedit_char_whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 "'
        parts.append(pytesseract.image_to_string(processed, config=cfg))
        parts.append(pytesseract.image_to_string(inverted, config=cfg))
    return '\n'.join(parts)


def _parse_candidates(raw: str) -> list[str]:
    """Return all sticker-code shaped tokens found in raw OCR output."""
    # Collapse spaces between consecutive digits — OCR often splits "17" into "1 7"
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
    """
    Apply common OCR confusion corrections and check against known codes.
    Returns the corrected code if found, else None.
    """
    _load_codes()

    # Direct hit
    if code in _CODE_SET:
        return code

    # Common character confusion: 0↔O, 1↔I, 5↔S, 8↔B
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

    # Try swapping confused chars in prefix
    for i, ch in enumerate(prefix):
        if ch in CONFUSIONS:
            alt_prefix = prefix[:i] + CONFUSIONS[ch] + prefix[i+1:]
            alt_code = f"{alt_prefix} {num}"
            if alt_code in _CODE_SET:
                return alt_code

    # Try FWC prefix if number looks like an intro sticker
    if prefix in {"FWC", "FW", "WC"}:
        for p in ["FWC"]:
            alt = f"{p} {num}"
            if alt in _CODE_SET:
                return alt

    # Handle OCR dropping the first character of a 3-letter code (e.g. "EX 17" → "MEX 17")
    if len(prefix) == 2:
        for lead in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
            alt = f"{lead}{prefix} {num}"
            if alt in _CODE_SET:
                return alt

    return None


def lookup_sticker(code: str) -> dict | None:
    """Return the sticker record for a given code, or None."""
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
    """
    Main entry point: given raw image bytes from the camera,
    return a scan result dict with matched sticker(s).

    Returns:
      {
        "status": "match" | "candidates" | "no_match",
        "raw_ocr": str,
        "detected_codes": [str],
        "match": sticker_dict | None,        # best single match
        "candidates": [sticker_dict],        # all plausible matches
      }
    """
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
        return {
            "status": "match",
            "raw_ocr": raw.strip(),
            "detected_codes": detected,
            "match": matches[0],
            "candidates": matches,
        }
    elif len(matches) > 1:
        return {
            "status": "candidates",
            "raw_ocr": raw.strip(),
            "detected_codes": detected,
            "match": None,
            "candidates": matches,
        }
    else:
        return {
            "status": "no_match",
            "raw_ocr": raw.strip(),
            "detected_codes": detected,
            "match": None,
            "candidates": [],
        }
