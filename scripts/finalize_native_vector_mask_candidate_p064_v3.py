#!/usr/bin/env python3
"""Validate and index the final candidate-scope p.64 proof package."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF = ROOT.parent / "Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p064-proof-v3"
TARGET_ID = "p064-v201-204-n4"
TARGET_DIR = PROOF_ROOT / TARGET_ID
FINAL_REVIEW_DIR = PROOF_ROOT / "visual-review"
OUTPUT_REVIEW = PROOF_ROOT / "visual-review.json"
FINAL_REVIEW = FINAL_REVIEW_DIR / "final-review.json"
SOURCE_PDF_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def union_rect(rects: list[pymupdf.Rect]) -> pymupdf.Rect:
    result = pymupdf.Rect(rects[0])
    for rect in rects[1:]:
        result |= rect
    return result


def find_word(words, expected: str, bbox, *, right: bool = False):
    x0, y0, x1, y1 = bbox
    candidates = [word for word in words if word[4].strip(".,;:()") == expected]
    candidates = [word for word in candidates if (word[0] >= x1 - 1 if right else word[2] <= x0 + 1)]
    if not candidates:
        return None
    anchor_y = (y0 + y1) / 2
    return min(candidates, key=lambda word: abs((word[1] + word[3]) / 2 - anchor_y))


def main() -> None:
    if OUTPUT_REVIEW.exists() or FINAL_REVIEW.exists():
        raise SystemExit("Refusing to overwrite a prior final p.64 review")
    candidate = json.loads((TARGET_DIR / "candidate-input.json").read_text(encoding="utf-8"))
    proof = json.loads((PROOF_ROOT / "proof-report.json").read_text(encoding="utf-8"))
    experiment = json.loads((ROOT / "output/proofs/symbol-activation-2026-10-13/batch-95/mask-reconstruction-lab/native-vector-crops-p064-v1-2026-10-14/experiment-report.json").read_text(encoding="utf-8"))
    overlay = json.loads((PROOF_ROOT / "activation-overlay/overlay-manifest.json").read_text(encoding="utf-8"))
    dry_run = json.loads((PROOF_ROOT / "activation-overlay/dry-run/dry-run-receipt.json").read_text(encoding="utf-8"))
    movement = json.loads((TARGET_DIR / "movement.json").read_text(encoding="utf-8"))
    cancel = json.loads((TARGET_DIR / "cancel-check.json").read_text(encoding="utf-8"))
    snapshot = json.loads((TARGET_DIR / "snapshot/original-position-snapshot.json").read_text(encoding="utf-8"))
    slot = json.loads((TARGET_DIR / "source-slot.json").read_text(encoding="utf-8"))
    metrics = json.loads((TARGET_DIR / "capture/export-metrics.json").read_text(encoding="utf-8"))

    assert candidate["candidateId"] == TARGET_ID
    assert candidate["sourcePdfSha256"] == SOURCE_PDF_SHA256 == sha(SOURCE_PDF)
    assert proof["canonicalWrites"] == proof["payloadWrites"] == proof["translationWrites"] == proof["apiRequests"] == 0
    assert len(proof["candidates"]) == 1 and proof["candidates"][0]["candidateId"] == TARGET_ID
    target = proof["candidates"][0]
    assert target["collateralChangedPixelsOutsideMask"] == 0
    assert target["imageXrefsPreserved"] is True
    assert movement["undoRestored"] and movement["redoRestored"]
    assert movement["targetSourceAppearanceKey"] == candidate["metrics"]["sourceAppearanceKey"]
    assert cancel["recordsAfterCancel"] == 0 and cancel["sourceAppearanceRestored"] is True
    assert cancel["apiRequestsAtCheckpoint"] == 0
    assert snapshot["verifyRenderedSnapshot"] is True
    assert all(not translation["spanKey"].endswith("__en") for translation in snapshot["translations"])
    assert target["replacementMaskSha256"] == sha(TARGET_DIR / "native-vector-clean-mask.png")
    assert overlay["candidateId"] == TARGET_ID and overlay["sidecarMetadataChanged"] is False
    assert overlay["changedFilesWithinPageOverlay"] == ["audit-mask-p064-v201-204-n4.png"]
    assert dry_run["firstApplicationChangedOnlyTargetAsset"] is True
    assert dry_run["secondApplicationIdempotent"] is True
    assert dry_run["rollbackRestoredExactBaseTree"] is True
    assert dry_run["canonicalSidecarsModified"] is False
    assert dry_run["payloadWritten"] is False and dry_run["humanTranslationWritten"] is False

    source_doc = pymupdf.open(SOURCE_PDF)
    output_pdf = Path(target["pdfPath"])
    output_doc = pymupdf.open(output_pdf)
    try:
        source_page = source_doc[63]
        export_page = output_doc[0]
        assert output_doc.page_count == 1
        assert source_page.rect == export_page.rect
        source_drawings = source_page.get_drawings()
        source_rect = union_rect([source_drawings[index]["rect"] for index in candidate["experiment"]["drawingIndices"]])
        expected = pymupdf.Rect(candidate["bbox"])
        nearby = [drawing["rect"] for drawing in export_page.get_drawings()
                  if drawing["rect"].intersects(expected + (-1, -1, 1, 1))
                  and 0 < drawing["rect"].width <= expected.width + 2
                  and 0 < drawing["rect"].height <= expected.height + 2]
        export_rect = union_rect(nearby)
        geometry_delta = max(abs(float(a) - float(b)) for a, b in zip(source_rect, export_rect))
        source_words = source_page.get_text("words")
        export_words = export_page.get_text("words")
        source_black = find_word(source_words, "BLACK", candidate["bbox"])
        export_black = find_word(export_words, "BLACK", candidate["bbox"])
        source_to = find_word(source_words, "to", candidate["bbox"], right=True)
        export_to = find_word(export_words, "to", candidate["bbox"], right=True)
        assert source_black and export_black and source_to and export_to
        left_context_top_delta = abs(float(source_black[1]) - float(export_black[1]))
        right_context_top_delta = abs(float(source_to[1]) - float(export_to[1]))
        assert geometry_delta <= 0.75
        assert left_context_top_delta <= 1.5 and right_context_top_delta <= 1.5
        assert slot["expectedLeftContext"] in source_page.get_text("text")
        assert slot["expectedRightContext"] in source_page.get_text("text")
    finally:
        source_doc.close()
        output_doc.close()

    checks = {
        "sourcePdfHashMatchesFrozen": True,
        "outsideMaskChangedPixels": 0,
        "imageXrefsPreserved": True,
        "sourceVectorsMatchExportedSymbolGeometryWithinPt": round(geometry_delta, 4),
        "leftTextContextTopDeltaPt": round(left_context_top_delta, 4),
        "rightTextContextTopDeltaPt": round(right_context_top_delta, 4),
        "emptyViewerHasNoSourceOccurrence": True,
        "moveUndoRedoPassed": True,
        "cancelRestoredSourceAndLeftNoRecord": True,
        "snapshotConsumedWithoutEnFallback": True,
        "isolatedPdfPageCount": 1,
        "normalZoomComparison": "target occupies its source slot; no visible rectangle or text collision",
        "highZoomNote": "A thin tonal edge at the cleanup boundary can be seen only in the 10x crop; it is not visible in the 100% crop or full-page export.",
        "neighboringContentCovered": False,
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "humanTranslationWrites": 0,
        "pageLevelPassAsserted": False,
    }
    review_target = {
        "candidateId": TARGET_ID,
        "status": "technical-ready; candidate scope only; page-level pass withheld",
        "isolatedPdf": "Source/export text and symbol positions match within 1.5 pt; 100% comparison has no visible patch edge or collision.",
        "checks": checks,
        "patchOverlay": str((PROOF_ROOT / "activation-overlay/overlay-manifest.json").relative_to(ROOT)).replace("\\", "/"),
        "overlayDryRun": str((PROOF_ROOT / "activation-overlay/dry-run/dry-run-receipt.json").relative_to(ROOT)).replace("\\", "/"),
        "limitation": checks["highZoomNote"],
    }
    visual_review = {
        "schemaVersion": 1,
        "status": "technical-ready; placement scope only; p.64 remains without a structural PASS",
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
        "targets": [review_target],
    }
    final_review = {
        "candidateId": TARGET_ID,
        "checks": checks,
        "sourcePdfSha256": SOURCE_PDF_SHA256,
        "originalMaskSha256": candidate["originalMaskSha256"],
        "replacementMaskSha256": target["replacementMaskSha256"],
        "pdfSha256": sha(output_pdf),
        "comparisonNormalZoom": str((FINAL_REVIEW_DIR / "p064-v201-normal-zoom-source-vs-export.png").relative_to(ROOT)).replace("\\", "/"),
        "comparisonDetailed": str((FINAL_REVIEW_DIR / "p064-v201-source-viewer-empty-and-isolated-pdf.png").relative_to(ROOT)).replace("\\", "/"),
        "comparisonHighZoom": str((FINAL_REVIEW_DIR / "p064-v201-10x-source-vs-export.png").relative_to(ROOT)).replace("\\", "/"),
        "overlayManifestSha256": sha(PROOF_ROOT / "activation-overlay/overlay-manifest.json"),
        "dryRunReceiptSha256": sha(PROOF_ROOT / "activation-overlay/dry-run/dry-run-receipt.json"),
    }
    FINAL_REVIEW.write_text(json.dumps(final_review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUTPUT_REVIEW.write_text(json.dumps(visual_review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"visualReview": str(OUTPUT_REVIEW.relative_to(ROOT)), "finalReview": str(FINAL_REVIEW.relative_to(ROOT)), "sourceVectorExportGeometryDeltaPt": round(geometry_delta, 4), "leftTextTopDeltaPt": round(left_context_top_delta, 4), "rightTextTopDeltaPt": round(right_context_top_delta, 4), "canonicalWrites": 0}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
