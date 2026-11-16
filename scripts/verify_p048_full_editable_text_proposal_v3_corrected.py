from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pymupdf
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-15/p048-full-editable-text-v3-corrected"
PROPOSAL = ROOT / "docs/translations/proposals/page-048-full-editable-text-proposal-2026-10-15-v3-corrected.json"
SOURCE_PDF = Path("C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
SNAPSHOT = PROOF / "snapshot/snapshot.json"
EXPORT_PDF = PROOF / "page-048-pt-BR-full-editable-v3-corrected.pdf"
VIEWER_PNG = PROOF / "viewer-pt-BR-v3-corrected.png"
PDF_RASTER = PROOF / "pdf-raster-v3-corrected.png"
RECEIPT = PROOF / "independent-pdf-verification-v3-corrected.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def normalize(value: str) -> str:
    value = " ".join(value.replace("\uFFFC", " ").split())
    # PDF text extraction can insert a line-wrap space after a visible hyphen.
    return re.sub(r"-(?=\s*\w)\s+", "-", value)


proposal = json.loads(PROPOSAL.read_text(encoding="utf-8"))
snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
assert proposal["status"] == "isolated-proposal-awaiting-visual-and-editor-verification"
assert len(proposal["units"]) == 15
assert len(snapshot["translations"]) == 15
assert SOURCE_PDF.exists()

with pymupdf.open(SOURCE_PDF) as source_doc, pymupdf.open(EXPORT_PDF) as export_doc:
    assert len(source_doc) == 102
    assert len(export_doc) == 1
    source_page = source_doc[47]
    page = export_doc[0]
    assert tuple(round(value, 3) for value in source_page.mediabox) == tuple(round(value, 3) for value in page.mediabox)
    pdf_text = normalize(page.get_text("text"))
    media_box = list(page.mediabox)
    replacement_count = pdf_text.count("\uFFFD")
    private_use_count = sum(1 for char in pdf_text if 0xE000 <= ord(char) <= 0xF8FF)
    scale = 1.5700691988102569
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    PDF_RASTER.write_bytes(pixmap.tobytes("png"))

viewer = Image.open(VIEWER_PNG).convert("RGB")
pdf_image = Image.open(PDF_RASTER).convert("RGB")
assert viewer.size == pdf_image.size, f"Raster dimensions differ: viewer={viewer.size}, pdf={pdf_image.size}"
raster_delta = np.abs(np.asarray(viewer, dtype=np.int16) - np.asarray(pdf_image, dtype=np.int16))
pixel_max_delta = raster_delta.max(axis=2)
raster_comparison = {
    "meanAbsoluteChannelDifference": [round(float(value), 4) for value in raster_delta.mean(axis=(0, 1))],
    "pixelsOver5Of255Percent": round(float((pixel_max_delta > 5).mean() * 100), 4),
    "pixelsOver32Of255Percent": round(float((pixel_max_delta > 32).mean() * 100), 4),
    "pixelsOver64Of255Percent": round(float((pixel_max_delta > 64).mean() * 100), 4),
    "interpretation": "Diagnostic raster comparison only; PDF and browser rasterizers differ. The two full-page images were also visually inspected for layout and clipping.",
}

unit_results = []
for unit in proposal["units"]:
    target = normalize(unit["targetText"])
    source = normalize(unit.get("sourceText", ""))
    target_present = target in pdf_text
    target_occurrences = pdf_text.count(target)
    source_present = bool(source) and source in pdf_text
    unit_results.append({
        "spanKey": unit["spanKey"],
        "sourceBlockId": unit["sourceBlockId"],
        "targetTextPresent": target_present,
        "targetTextOccurrences": target_occurrences,
        "sourceFallbackPresent": source_present,
        "targetChars": len(target),
        "sourceChars": len(source),
        "sourceSymbols": unit.get("sourceSymbolSequence", []),
    })

missing_targets = [item["spanKey"] for item in unit_results if not item["targetTextPresent"]]
source_fallbacks = [item["spanKey"] for item in unit_results if item["sourceFallbackPresent"]]
duplicate_targets = [item["spanKey"] for item in unit_results if item["targetTextOccurrences"] != 1]
assert not missing_targets, f"Target text missing from exported PDF: {missing_targets}"
assert not duplicate_targets, f"Target text must occur exactly once in exported PDF: {duplicate_targets}"
assert not source_fallbacks, f"Source fallback remains in translated units: {source_fallbacks}"
assert replacement_count == 0
assert private_use_count == 0

metrics = json.loads((PROOF / "page-048-pt-BR-full-editable-v3-corrected-metrics.json").read_text(encoding="utf-8"))
assert len(metrics["viewer"]["symbols"]) == 6
assert len(metrics["print"]["symbols"]) == 6

receipt = {
    "page": 48,
    "proposalId": proposal["proposalId"],
    "sourcePdfSha256": sha256(SOURCE_PDF),
    "exportPdfSha256": sha256(EXPORT_PDF),
    "snapshotSha256": sha256(SNAPSHOT),
    "viewerScreenshotSha256": sha256(VIEWER_PNG),
    "pdfRasterSha256": sha256(PDF_RASTER),
    "unitCount": len(unit_results),
    "verifiedTargetUnitCount": sum(item["targetTextPresent"] for item in unit_results),
    "sourceFallbackUnitCount": len(source_fallbacks),
    "replacementCharacterCount": replacement_count,
    "privateUseCharacterCount": private_use_count,
    "viewerAndPdfRasterSize": list(viewer.size),
    "viewerVsPdfRasterComparison": raster_comparison,
    "pageBox": media_box,
    "viewerSemanticSymbolCount": len(metrics["viewer"]["symbols"]),
    "printSemanticSymbolCount": len(metrics["print"]["symbols"]),
    "normalAppViewerScreenshotSha256": sha256(PROOF / "normal-viewer-p048-pt-BR-v3-corrected-fit.png"),
    "normalAppEditorScreenshotSha256": sha256(PROOF / "normal-editor-p048-readonly-v3-corrected-fit.png"),
    "normalAppEditorReceiptSha256": sha256(PROOF / "normal-editor-readonly-receipt-v3-corrected-fit.json"),
    "units": unit_results,
    "limitations": [
        "The four card images remain source artwork and are not included as editable prose.",
        "Viewer/PDF copyfit is technical evidence only; terminology and wording remain pending human review.",
        "The four prepared symbol patches are present only in the immutable proof snapshot, not the canonical page sidecar.",
        "The browser/PDF raster comparison is not a pixel-equivalence certification; each full-page rendering was visually inspected.",
    ],
}
RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(receipt, ensure_ascii=False, indent=2))
