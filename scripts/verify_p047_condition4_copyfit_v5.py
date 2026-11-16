#!/usr/bin/env python3
"""Verify the p.47 Condition 4 v5 PDF lines, frame clearance, and heading gap."""

import hashlib
import json
import sys
from pathlib import Path

import pymupdf

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(sys.argv[1]).resolve()
RASTER = Path(sys.argv[2]).resolve()
DOM_PATH = ROOT / "apps/web/public/pages/page_047/page_047_dom.json"
DOM_SHA256 = "80889c18595d75c60a86f6518f67ea7d13d411b1de212f539b775a18f16d643c"
EXPECTED_LINES = [
    "4. Condições de Símbolos: Símbolos a gastar. Essas Habilidades só podem",
    "ser usadas na etapa “Gastar Símbolos e usar Habilidades que adicionam",
    "Dano” do Ataque (ver Ação de Ataque, pág. 41).",
]

dom_bytes = DOM_PATH.read_bytes()
actual_dom_hash = hashlib.sha256(dom_bytes).hexdigest()
if actual_dom_hash != DOM_SHA256:
    raise SystemExit(f"p.47 DOM changed: {actual_dom_hash}")
dom = json.loads(dom_bytes)
condition_block = next(block for block in dom["blocks"] if block["id"] == "block_19")
frame_right = float(condition_block["bbox"][2])

pdf = pymupdf.open(PDF)
if len(pdf) != 1:
    raise SystemExit(f"Expected one PDF page, got {len(pdf)}")
page = pdf[0]
line_records = []
for block in page.get_text("dict")["blocks"]:
    for line in block.get("lines", []):
        text = " ".join("".join(span["text"] for span in line["spans"]).split())
        if text.startswith(("4. Condições de Símbolos:", "ser usadas na etapa", "Dano” do Ataque")):
            line_records.append({"text": text, "bboxPt": [round(value, 3) for value in line["bbox"]]})

if [record["text"] for record in line_records] != EXPECTED_LINES:
    raise SystemExit(f"Condition 4 did not export as the expected three lines: {line_records!r}")
if "The symbols a player must spend" in page.get_text():
    raise SystemExit("English fallback for Condition 4 is present in the exported PDF.")
if page.get_text().count("pág. 41") != 1:
    raise SystemExit("The page 41 cross-reference is missing or duplicated.")

clearances = [round(frame_right - record["bboxPt"][2], 3) for record in line_records]
if any(clearance <= 0 for clearance in clearances):
    raise SystemExit(f"Condition 4 crosses the source frame: {clearances!r} pt")
important = []
for block in page.get_text("dict")["blocks"]:
    for line in block.get("lines", []):
        text = " ".join("".join(span["text"] for span in line["spans"]).split())
        if text == "IMPORTANT ABILITY RULES:":
            important.append(line["bbox"])
if len(important) != 1:
    raise SystemExit(f"Expected one IMPORTANT heading, got {len(important)}")
vertical_gap = round(float(important[0][1]) - float(line_records[-1]["bboxPt"][3]), 3)
if vertical_gap <= 0:
    raise SystemExit(f"Condition 4 collides with IMPORTANT: {vertical_gap} pt")

pix = page.get_pixmap(matrix=pymupdf.Matrix(1.57, 1.57), alpha=False)
RASTER.parent.mkdir(parents=True, exist_ok=True)
pix.save(RASTER)
result = {
    "verified": True,
    "pdfPages": len(pdf),
    "condition4TargetLineCount": len(line_records),
    "frameRightPt": round(frame_right, 3),
    "lines": line_records,
    "rightClearancesPt": clearances,
    "importantHeadingTopPt": round(float(important[0][1]), 3),
    "verticalGapToImportantHeadingPt": vertical_gap,
    "page41ReferenceCount": 1,
    "pdfRaster": str(RASTER.relative_to(ROOT)),
    "pdfRasterSizePx": [pix.width, pix.height],
}
verification_path = RASTER.with_name("condition4-layout-verification-v5.json")
verification_path.write_text(json.dumps(result, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, ensure_ascii=True, indent=2))
