import hashlib
import json
import re
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageDraw


ROOT = Path.cwd()
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-15/p056-full-page-v3-corrected"
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-056-full-page-text-proposal-2026-10-15-v3-corrected.json"
SOURCE_PDF = Path(r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PDF_PATH = PROOF / "page-056-pt-BR-full-text-v3.pdf"
VIEWER_PATH = PROOF / "viewer-page-056-pt-BR-v3.png"
SOURCE_RASTER_PATH = PROOF / "source-page-056-raster.png"
RASTER_PATH = PROOF / "pdf-page-056-pt-BR-v3-raster.png"
COMPARE_PATH = PROOF / "source-viewer-pdf-page-056-v3.png"
HEADING_COMPARE_PATH = PROOF / "source-vs-export-tags-heading-v3.png"
RECEIPT_PATH = PROOF / "independent-pdf-verification-v3.json"
EXPECTED_SOURCE_SHA256 = "A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


for artifact in (SOURCE_RASTER_PATH, RASTER_PATH, COMPARE_PATH, HEADING_COMPARE_PATH, RECEIPT_PATH):
    if artifact.exists():
        raise FileExistsError(f"Refusing to overwrite existing evidence: {artifact}")

proposal = json.loads(PROPOSAL_PATH.read_text(encoding="utf-8"))
assert proposal["page"] == 56 and proposal["candidateCount"] == 23
assert sha256(SOURCE_PDF) == EXPECTED_SOURCE_SHA256

source_doc = fitz.open(SOURCE_PDF)
export_doc = fitz.open(PDF_PATH)
assert len(export_doc) == 1
source_page = source_doc.load_page(55)
export_page = export_doc.load_page(0)
assert tuple(round(value, 3) for value in source_page.mediabox) == tuple(round(value, 3) for value in export_page.mediabox)
assert tuple(round(value, 3) for value in source_page.cropbox) == tuple(round(value, 3) for value in export_page.cropbox)

page_text = normalize(export_page.get_text())
candidate_occurrences = {}
missing = []
for candidate in proposal["candidates"]:
    target = normalize(candidate["proposalText"])
    count = page_text.count(target)
    candidate_occurrences[candidate["spanKey"]] = count
    if count < 1:
        missing.append(candidate["spanKey"])
assert not missing, f"PDF is missing candidate texts: {missing}"
assert "Tags: Combatentes" not in page_text
assert "\ufffd" not in page_text

heading_candidate = next(candidate for candidate in proposal["candidates"] if candidate["blockId"] == "block_104")
assert heading_candidate["proposalText"] == "Tags de Combatente"
heading_boxes = export_page.search_for("Tags de Combatente")
heading_source_bbox = (415.8425, 625.7706, 524.9584, 641.9466)
heading_box = min(heading_boxes, key=lambda rect: abs(rect.y0 - heading_source_bbox[1]))
proposed_right = heading_source_bbox[0] + 136
assert heading_box.x0 >= heading_source_bbox[0] - 1
assert heading_box.x1 < proposed_right
assert heading_box.y0 >= heading_source_bbox[1] - 2 and heading_box.y1 < heading_source_bbox[3]

width = round(source_page.rect.width * 1288 / 820.3460083007812)
zoom = width / source_page.rect.width
matrix = fitz.Matrix(zoom, zoom)
source_pix = source_page.get_pixmap(matrix=matrix, alpha=False)
export_pix = export_page.get_pixmap(matrix=matrix, alpha=False)
source_image = Image.frombytes("RGB", (source_pix.width, source_pix.height), source_pix.samples)
export_image = Image.frombytes("RGB", (export_pix.width, export_pix.height), export_pix.samples)
viewer_image = Image.open(VIEWER_PATH).convert("RGB")
if viewer_image.size != export_image.size:
    viewer_image = viewer_image.resize(export_image.size, Image.Resampling.LANCZOS)
source_image.save(SOURCE_RASTER_PATH)
export_image.save(RASTER_PATH)

label_height = 32
panel_width = export_image.width
comparison = Image.new("RGB", (panel_width * 3, export_image.height + label_height), "white")
draw = ImageDraw.Draw(comparison)
panels = [(source_image, "PDF fonte EN"), (viewer_image, "Viewer PageRenderer PT-BR"), (export_image, "PDF exportado PT-BR")]
for index, (image, label) in enumerate(panels):
    x = index * panel_width
    draw.text((x + 12, 8), label, fill="black")
    comparison.paste(image, (x, label_height))
comparison.save(COMPARE_PATH)

scale = zoom
crop_box = tuple(round(value * scale) for value in (395, 610, 575, 657))
source_crop = source_image.crop(crop_box)
export_crop = export_image.crop(crop_box)
crop = Image.new("RGB", (source_crop.width * 2, source_crop.height + label_height), "white")
crop_draw = ImageDraw.Draw(crop)
crop_draw.text((10, 8), "PDF fonte EN", fill="black")
crop_draw.text((source_crop.width + 10, 8), "PDF exportado PT-BR", fill="black")
crop.paste(source_crop, (0, label_height))
crop.paste(export_crop, (source_crop.width, label_height))
crop.save(HEADING_COMPARE_PATH)

receipt = {
    "schemaVersion": 1,
    "status": "independent PDF text and geometry checks passed; visual inspection recorded separately",
    "page": 56,
    "sourcePdfSha256": EXPECTED_SOURCE_SHA256,
    "exportPdfSha256": sha256(PDF_PATH),
    "exportPageCount": len(export_doc),
    "sourceMediaBoxPt": list(source_page.mediabox),
    "exportMediaBoxPt": list(export_page.mediabox),
    "mediaBoxAndCropBoxMatchSource": True,
    "candidateCount": len(proposal["candidates"]),
    "candidatePdfTextOccurrences": candidate_occurrences,
    "allCandidateTextsFound": len(candidate_occurrences) == 23 and all(count >= 1 for count in candidate_occurrences.values()),
    "oldBlockedHeadingCandidateAbsent": "Tags: Combatentes" not in page_text,
    "replacementCharacters": page_text.count("\ufffd"),
    "heading": {
        "text": "Tags de Combatente",
        "sourceFramePt": heading_source_bbox,
        "isolatedFrameRightPt": proposed_right,
        "actualPdfTextRectPt": list(heading_box),
        "withinFrameAndSourceLineHeight": True,
    },
    "evidence": {
        "viewerScreenshot": str(VIEWER_PATH.relative_to(ROOT)).replace("\\", "/"),
        "pdfRaster": str(RASTER_PATH.relative_to(ROOT)).replace("\\", "/"),
        "sourceViewerPdfComparison": str(COMPARE_PATH.relative_to(ROOT)).replace("\\", "/"),
        "headingSourceExportComparison": str(HEADING_COMPARE_PATH.relative_to(ROOT)).replace("\\", "/"),
    },
}
RECEIPT_PATH.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps(receipt, indent=2, ensure_ascii=False))
