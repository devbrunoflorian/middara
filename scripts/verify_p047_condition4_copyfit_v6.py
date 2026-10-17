#!/usr/bin/env python3
"""Verify the p.47 example's updated exaustar wording stays in its source frame."""
import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber

pdf_path = Path(sys.argv[1])
snapshot_path = Path(sys.argv[2])
snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
span_key = "page_47_block_19__pt-BR"
record = next(item for item in snapshot["translations"] if item["spanKey"] == span_key)
target = "".join(segment.get("text", "") for segment in record["data"]["segments"])
normalize = lambda text: re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip().casefold()
expected = normalize(target)
frame = (427.4786071777344, 312.3727111816406, 711.3160400390625, 382.8706970214844)
tolerance_pt = 0.05

with pdfplumber.open(pdf_path) as document:
    if len(document.pages) != 1:
        raise SystemExit("Expected the official isolated export to contain one page.")
    page = document.pages[0]
    crop = page.crop(frame, strict=False)
    extracted = crop.extract_text(x_tolerance=1, y_tolerance=3) or ""
    normalized = normalize(extracted)
    # Measure the original page chars; crop.chars clips glyph boxes at the crop edge.
    region_chars = [
        char for char in page.chars
        if char.get("text", "").strip()
        and frame[0] - 0.5 <= char["x0"] <= frame[2] + 20
        and frame[1] - 1 <= char["top"] <= frame[3] + 1
    ]
    rightmost = max((char["x1"] for char in region_chars), default=None)
    topmost = min((char["top"] for char in region_chars), default=None)
    bottommost = max((char["bottom"] for char in region_chars), default=None)

result = {
    "page": 47,
    "spanKey": span_key,
    "targetTextPresent": expected in normalized,
    "framePt": list(frame),
    "rightmostTextPt": rightmost,
    "rightClearancePt": round(frame[2] - rightmost, 4) if rightmost is not None else None,
    "measurementTolerancePt": tolerance_pt,
    "withinMeasurementTolerance": rightmost is not None and rightmost <= frame[2] + tolerance_pt,
    "measurementMethod": "unclipped original PDF character boxes; text content also checked against exact translated target",
    "verticalTextBoundsPt": [topmost, bottommost],
    "verticalClearancePt": [round(topmost - frame[1], 4), round(frame[3] - bottommost, 4)] if topmost is not None and bottommost is not None else None,
    "extractedText": extracted,
}
print(json.dumps(result, ensure_ascii=False, indent=2))
if not result["targetTextPresent"] or rightmost is None or rightmost > frame[2] + tolerance_pt or topmost is None or topmost < frame[1] - tolerance_pt or bottommost is None or bottommost > frame[3] + tolerance_pt:
    raise SystemExit(1)
