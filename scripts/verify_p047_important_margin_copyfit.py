#!/usr/bin/env python3
"""Verify the exact p.47 IMPORTANT bullet lines and clearance in an exported PDF."""

import json
import sys
import unicodedata

import pymupdf

pdf_path = sys.argv[1]
frame_right = float(sys.argv[2])
expected = [
    "Salvo indicação em contrário, não há limite de usos para Habilidades",
    "que exigem Símbolos, desde que a figura tenha Símbolos para gastar.",
]


def normalize(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).split())


document = pymupdf.open(pdf_path)
if len(document) != 1:
    raise SystemExit(f"Expected one exported page, received {len(document)}.")
page = document[0]
text = page.get_text()
target_spans = []
for block in page.get_text("dict")["blocks"]:
    for line in block.get("lines", []):
        for span in line["spans"]:
            normalized = normalize(span["text"])
            if normalized.startswith("Salvo indicação") or normalized.startswith("que exigem Símbolos"):
                target_spans.append({
                    "text": normalized,
                    "bboxPt": [round(value, 3) for value in span["bbox"]],
                })

if [item["text"] for item in target_spans] != expected:
    raise SystemExit(f"Target text did not render as the two expected lines: {target_spans!r}")
if "Unless otherwise stated" in text:
    raise SystemExit("The old English override is still visible in the exported PDF.")

clearances = [round(frame_right - item["bboxPt"][2], 3) for item in target_spans]
if any(clearance <= 0 for clearance in clearances):
    raise SystemExit(f"Target line crosses the frame: {clearances!r} pt clearance.")

print(json.dumps({
    "verified": True,
    "pdfPages": len(document),
    "sourceEnglishFallbackPresent": False,
    "targetLineCount": len(target_spans),
    "frameRightPt": round(frame_right, 3),
    "lines": target_spans,
    "rightClearancePt": clearances,
}, ensure_ascii=True, sort_keys=True))
