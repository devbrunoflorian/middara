#!/usr/bin/env python3
"""Build a readable, reproducible comparison for the isolated p.64 proof."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF = ROOT.parent / "Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p064-proof-v3"
TARGET_DIR = PROOF / "p064-v201-204-n4"
EXPERIMENT = ROOT / "output/proofs/symbol-activation-2026-10-13/batch-95/mask-reconstruction-lab/native-vector-crops-p064-v1-2026-10-14"
OUT = PROOF / "visual-review"
PAGE = 64
CLIP = pymupdf.Rect(528, 444, 622, 478)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render_clip(pdf_path: Path, page_no: int, scale: float) -> Image.Image:
    doc = pymupdf.open(pdf_path)
    try:
        page = doc[page_no - 1]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=CLIP, alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    finally:
        doc.close()


def crop_viewer(path: Path, scale: float, page_width_pt: float) -> Image.Image:
    image = Image.open(path).convert("RGB")
    factor = image.width / page_width_pt
    box = tuple(round(value * factor) for value in (CLIP.x0, CLIP.y0, CLIP.x1, CLIP.y1))
    crop = image.crop(box)
    return crop.resize((crop.width * 2, crop.height * 2), Image.Resampling.LANCZOS)


def main() -> None:
    if OUT.exists():
        raise SystemExit(f"Refusing to overwrite existing visual review: {OUT}")
    OUT.mkdir(parents=True)

    source_viewer = TARGET_DIR / "capture/viewer-source-with-clean-vector-mask.png"
    empty_viewer = TARGET_DIR / "capture/viewer-empty-clean-mask.png"
    source_pdf = SOURCE_PDF
    isolated_pdf = TARGET_DIR / "p064-en-mask-v1.pdf"
    source_pdf_doc = pymupdf.open(source_pdf)
    isolated_doc = pymupdf.open(isolated_pdf)
    try:
        source_page_width = float(source_pdf_doc[PAGE - 1].rect.width)
        export_page_width = float(isolated_doc[0].rect.width)
        page_count = len(isolated_doc)
        page_box_delta_pt = abs(source_page_width - export_page_width)
        source_text = source_pdf_doc[PAGE - 1].get_text("text")
        export_text = isolated_doc[0].get_text("text")
    finally:
        source_pdf_doc.close()
        isolated_doc.close()

    crops = {
        "Viewer · slot original": crop_viewer(source_viewer, 1, source_page_width),
        "Viewer · override vazio": crop_viewer(empty_viewer, 1, source_page_width),
        "PDF-fonte · arte original": render_clip(source_pdf, PAGE, 4.0),
        "PDF isolado · override EN": render_clip(isolated_pdf, 1, 4.0),
    }
    for name, crop in crops.items():
        safe = name.lower().replace(" · ", "-").replace(" ", "-").replace("ã", "a").replace("é", "e")
        crop.save(OUT / f"{safe}.png", optimize=True)

    font_path = Path("C:/Windows/Fonts/arial.ttf")
    font = ImageFont.truetype(str(font_path), 24) if font_path.exists() else ImageFont.load_default()
    padding = 24
    gutter = 28
    label_height = 42
    row_specs = [
        [("Viewer · slot original", crops["Viewer · slot original"]), ("Viewer · override vazio", crops["Viewer · override vazio"])],
        [("PDF-fonte · arte original", crops["PDF-fonte · arte original"]), ("PDF isolado · override EN", crops["PDF isolado · override EN"])],
    ]
    col_width = max(image.width for row in row_specs for _, image in row)
    row_heights = [max(image.height for _, image in row) + label_height for row in row_specs]
    canvas = Image.new("RGB", (padding * 2 + col_width * 2 + gutter, padding * 2 + sum(row_heights) + gutter), "#f2f0ea")
    draw = ImageDraw.Draw(canvas)
    y = padding
    for row_index, row in enumerate(row_specs):
        for col_index, (label, crop) in enumerate(row):
            x = padding + col_index * (col_width + gutter)
            draw.text((x, y), label, fill="#181716", font=font)
            top = y + label_height
            canvas.paste(crop, (x, top))
        y += row_heights[row_index] + gutter
    comparison = OUT / "p064-v201-source-viewer-empty-and-isolated-pdf.png"
    canvas.save(comparison, optimize=True)

    experiment = json.loads((EXPERIMENT / "experiment-report.json").read_text(encoding="utf-8"))
    proof = json.loads((PROOF / "proof-report.json").read_text(encoding="utf-8"))
    movement = json.loads((TARGET_DIR / "movement.json").read_text(encoding="utf-8"))
    cancel = json.loads((TARGET_DIR / "cancel-check.json").read_text(encoding="utf-8"))
    slot = json.loads((TARGET_DIR / "source-slot.json").read_text(encoding="utf-8"))
    candidate = json.loads((TARGET_DIR / "candidate-input.json").read_text(encoding="utf-8"))
    target_experiment = experiment["targets"][0]
    checks = {
        "candidateId": "p064-v201-204-n4",
        "page": PAGE,
        "sourcePdfSha256": sha(source_pdf),
        "frozenSourcePdfSha256": candidate["sourcePdfSha256"],
        "sourcePdfHashMatchesFrozen": sha(source_pdf) == candidate["sourcePdfSha256"],
        "originalMaskSha256": candidate["originalMaskSha256"],
        "replacementMaskSha256": candidate["exactCleanMaskSha256"],
        "outsideMaskChangedPixels": target_experiment["collateralChangedPixelsOutsideMask"],
        "imageXrefsPreserved": target_experiment["imageXrefsPreserved"],
        "viewerSourceCount": 1,
        "viewerEmptySourceCount": 0,
        "movePreservedAppearance": movement["targetSourceAppearanceKey"] == candidate["metrics"]["sourceAppearanceKey"],
        "undoRestored": movement["undoRestored"],
        "redoRestored": movement["redoRestored"],
        "cancelRecordsRemaining": cancel["recordsAfterCancel"],
        "cancelRestoredSourceAppearance": cancel["sourceAppearanceRestored"],
        "apiRequests": proof["apiRequests"],
        "isolatedPdfPageCount": page_count,
        "sourceExportPageWidthDeltaPt": round(page_box_delta_pt, 8),
        "leftContext": slot["expectedLeftContext"],
        "rightContext": slot["expectedRightContext"],
        "sourceContextPresent": slot["expectedLeftContext"] in source_text and slot["expectedRightContext"] in source_text,
        "exportContextPresent": slot["expectedLeftContext"] in export_text and slot["expectedRightContext"] in export_text,
        "comparisonPng": str(comparison.relative_to(ROOT)),
        "comparisonPngSha256": sha(comparison),
        "visualJudgment": "manual review required; image is a readable source/viewer/export comparison",
        "canonicalWrites": proof["canonicalWrites"],
        "payloadWrites": proof["payloadWrites"],
        "translationWrites": proof["translationWrites"],
    }
    report_path = OUT / "visual-review.json"
    report_path.write_text(json.dumps(checks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"comparison": str(comparison.relative_to(ROOT)), "report": str(report_path.relative_to(ROOT)), "sourceHashMatches": checks["sourcePdfHashMatchesFrozen"], "sourceExportWidthDeltaPt": checks["sourceExportPageWidthDeltaPt"], "sourceContextInExport": checks["exportContextPresent"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
