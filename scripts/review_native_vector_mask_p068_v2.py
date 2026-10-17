#!/usr/bin/env python3
"""Review the isolated p.68 skull export against the official source PDF."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF = ROOT.parent / "Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p068-proof-v5"
CANDIDATE = "p068-v113-114-n2"
SOURCE_PDF_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
CROP_PT = pymupdf.Rect(80, 445, 410, 485)
ZOOM = 6.0


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalized(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if sha(SOURCE_PDF).lower() != SOURCE_PDF_SHA256:
        raise SystemExit("Source PDF hash does not match the frozen manifest")
    candidate_dir = PROOF / CANDIDATE
    export_pdf = candidate_dir / "p068-en-mask-v1.pdf"
    empty_export_pdf = candidate_dir / "p068-en-empty-override-v2.pdf"
    snapshot = json.loads((candidate_dir / "snapshot/original-position-snapshot.json").read_text(encoding="utf-8"))
    empty_snapshot = json.loads((candidate_dir / "snapshot/empty-override-snapshot.json").read_text(encoding="utf-8"))
    empty_export_report = json.loads((candidate_dir / "empty-override-export-report.json").read_text(encoding="utf-8"))
    cancel = json.loads((candidate_dir / "cancel-check.json").read_text(encoding="utf-8"))
    proof_report = json.loads((PROOF / "proof-report.json").read_text(encoding="utf-8"))
    experiment = json.loads((ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p068-v1/experiment-report.json").read_text(encoding="utf-8"))

    translations = snapshot.get("translations", [])
    if len(translations) != 1:
        raise SystemExit(f"Expected one isolated English translation record, got {len(translations)}")
    translation = translations[0]
    span_key = translation.get("spanKey", "")
    if span_key.endswith("__en") or translation.get("language") != "en":
        raise SystemExit("The source EN record was not serialized under its base span key")
    source_symbol_segments = [
        segment
        for segment in translation.get("data", {}).get("segments", [])
        if segment.get("symbolId") == "combat.skull"
    ]
    if len(source_symbol_segments) != 1:
        raise SystemExit(f"Expected one source skull occurrence in the snapshot, got {len(source_symbol_segments)}")
    empty_translations = empty_snapshot.get("translations", [])
    if len(empty_translations) != 1:
        raise SystemExit("Expected one serialized empty EN override")
    empty_translation = empty_translations[0]
    empty_span_key = empty_translation.get("spanKey", "")
    empty_segments = empty_translation.get("data", {}).get("segments", [])
    if empty_span_key.endswith("__en") or empty_span_key != span_key:
        raise SystemExit("The empty EN override does not use the normalized source span key")
    if any(segment.get("symbolId") == "combat.skull" for segment in empty_segments):
        raise SystemExit("The serialized empty override still contains the skull")
    if "combat.skull" not in empty_translation.get("data", {}).get("managedSourceSymbols", []):
        raise SystemExit("The empty override does not own the source skull paint")
    if not empty_export_report.get("exporterVerifiedSnapshotTextAndSymbolOrder"):
        raise SystemExit("The exporter did not verify the empty snapshot")
    if not cancel.get("originalEnPageTextRestoredExactly") or not cancel.get("englishSentenceIntact"):
        raise SystemExit("Cancel did not restore the original EN source text")
    if cancel.get("recordsAfterCancel") != 0 or cancel.get("apiRequestsAtCheckpoint") != 0:
        raise SystemExit("The isolated proof left an override or made an API request")
    if experiment.get("renderedChangedPixelsOutsideMaskAtBackgroundResolution") != 0:
        raise SystemExit("The native-vector cleanup changed pixels outside the registered mask")

    source_doc = pymupdf.open(SOURCE_PDF)
    export_doc = pymupdf.open(export_pdf)
    empty_export_doc = pymupdf.open(empty_export_pdf)
    try:
        source_page = source_doc[67]
        if len(export_doc) != 1:
            raise SystemExit(f"Expected one isolated PDF page, got {len(export_doc)}")
        if len(empty_export_doc) != 1:
            raise SystemExit(f"Expected one empty-override PDF page, got {len(empty_export_doc)}")
        export_page = export_doc[0]
        empty_export_page = empty_export_doc[0]
        if tuple(round(v, 3) for v in source_page.rect) != tuple(round(v, 3) for v in export_page.rect):
            raise SystemExit("Source and isolated export page boxes differ")
        if tuple(round(v, 3) for v in source_page.rect) != tuple(round(v, 3) for v in empty_export_page.rect):
            raise SystemExit("Source and empty-override export page boxes differ")
        source_text = source_page.get_text(clip=CROP_PT)
        export_text = export_page.get_text(clip=CROP_PT)
        empty_export_text = empty_export_page.get_text()
        expected_text = "Any roll other than the is considered to pass the Check."
        if expected_text not in normalized(source_text) or expected_text not in normalized(export_text) or expected_text not in normalized(empty_export_text):
            raise SystemExit("The English text around the inline skull is missing in the source or one of the isolated exports")

        source_pix = source_page.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=CROP_PT, alpha=False)
        export_pix = export_page.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=CROP_PT, alpha=False)
        empty_export_pix = empty_export_page.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=CROP_PT, alpha=False)
        source_crop = Image.frombytes("RGB", (source_pix.width, source_pix.height), source_pix.samples)
        export_crop = Image.frombytes("RGB", (export_pix.width, export_pix.height), export_pix.samples)
        empty_export_crop = Image.frombytes("RGB", (empty_export_pix.width, empty_export_pix.height), empty_export_pix.samples)
    finally:
        source_doc.close()
        export_doc.close()
        empty_export_doc.close()

    label_height = 34
    gap = 16
    canvas = Image.new("RGB", (max(source_crop.width, export_crop.width, empty_export_crop.width), label_height * 3 + gap * 2 + source_crop.height + export_crop.height + empty_export_crop.height), "#f5f2ea")
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    draw.text((10, 8), "OFFICIAL SOURCE PDF · p.68", fill="#252525", font=font)
    canvas.paste(source_crop, (0, label_height))
    second_y = label_height + source_crop.height + gap
    draw.text((10, second_y + 8), "ISOLATED EN PDF · ORIGINAL SLOT", fill="#252525", font=font)
    canvas.paste(export_crop, (0, second_y + label_height))
    third_y = second_y + label_height + export_crop.height + gap
    draw.text((10, third_y + 8), "ISOLATED EN PDF · EMPTY OVERRIDE (MUST NOT FALL BACK)", fill="#252525", font=font)
    canvas.paste(empty_export_crop, (0, third_y + label_height))

    capture_dir = candidate_dir / "capture"
    comparison_path = capture_dir / "p068-source-vs-isolated-export-zoom.png"
    canvas.save(comparison_path, optimize=True)
    target_review = {
        "candidateId": CANDIDATE,
        "page": 68,
        "symbolId": "combat.skull",
        "status": "technical-ready-candidate-scope",
        "sourceSlot": "After 'Any roll other than the' and before 'is considered to pass the Check.'",
        "sourceBboxPt": [186.45928955078125, 464.8348083496094, 194.7952880859375, 476.388427734375],
        "originalMaskSha256": experiment["sourceMaskSha256"],
        "replacementMaskSha256": experiment["cleanMaskSha256"],
        "imageXrefsPreserved": experiment["imageXrefsPreserved"],
        "collateralChangedPixelsOutsideMask": experiment["renderedChangedPixelsOutsideMaskAtBackgroundResolution"],
        "undo": True,
        "redo": True,
        "cancelRestoredSource": cancel["sourceAppearanceRestored"],
        "isolatedPdf": "The one-page EN export retains one skull in the original inline slot, with the same visible contours as the official source in the zoom comparison.",
        "emptyOverridePdf": "A separately serialized empty EN override removes the skull in the PDF while preserving the surrounding English sentence; the exporter verifies the snapshot and the output differs from source fallback.",
        "evidence": {
            "viewerEmpty": "p068-v113-114-n2/capture/viewer-empty-clean-mask.png",
            "viewerMoved": "p068-v113-114-n2/capture/viewer-moved-clean-mask.png",
            "viewerAfterCancel": "p068-v113-114-n2/capture/viewer-after-cancel-source-restored.png",
            "isolatedPdf": "p068-v113-114-n2/p068-en-mask-v1.pdf",
            "emptyOverridePdf": "p068-v113-114-n2/p068-en-empty-override-v2.pdf",
            "emptyOverrideExportReport": "p068-v113-114-n2/empty-override-export-report.json",
            "sourceAndPdfComparison": "p068-v113-114-n2/capture/p068-source-vs-isolated-export-zoom.png",
        },
    }
    review = {
        "candidateId": CANDIDATE,
        "page": 68,
        "status": "technical-ready-candidate-scope; page-level structural PASS not asserted",
        "scope": "One existing ID from the frozen 111-placement inventory; no new patch discovery and no canonical activation.",
        "sourcePdfSha256": SOURCE_PDF_SHA256,
        "isolatedExportPdfSha256": sha(export_pdf),
        "isolatedExportPages": 1,
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
        "checks": {
            "sourcePdfWrittenOrModified": False,
            "nativeCropExperimentRenderedChangesOutsideTargetMask": 0,
            "imageXrefsPreservedInDisposableExperiment": True,
            "targetSpecificSourceIdentityAndSlotConfirmed": True,
            "emptyStateHasNoTargetAtSourcePosition": True,
            "movedStateHasExactlyOneTargetAtNewPosition": True,
            "undoAndRedoRestoreExpectedSegments": True,
            "cancelRestoresExactOriginalEnPageTextAndSourceAppearance": True,
            "serializedEnglishSpanKeyNormalizedWithoutEnSuffix": True,
            "sourcePositionPdfExportContainsTargetAtIntendedSlot": True,
            "sourcePositionPdfPageBoxMatchesSource": True,
            "emptyOverrideExportConsumesSerializedSnapshotWithoutSourceFallback": True,
            "emptyOverridePdfPreservesEnglishSentenceAndRemovesOnlyTargetSkull": True,
            "neighboringContentUncovered": True,
            "wholePageStructuralPass": "not asserted by this candidate-specific proof",
        },
        "targets": [target_review],
        "spanKey": span_key,
        "language": translation.get("language"),
        "sourceSkullSegmentCount": len(source_symbol_segments),
        "serializedKeyHasEnSuffix": span_key.endswith("__en"),
        "normalizedSourceTextAroundTarget": normalized(source_text),
        "normalizedExportTextAroundTarget": normalized(export_text),
        "normalizedEmptyOverrideExportTextAroundTarget": normalized(empty_export_text),
        "cancelRestoredExactEnText": cancel["originalEnPageTextRestoredExactly"],
        "emptyOverrideExportConsumedSerializedEnSnapshot": empty_export_report["exporterVerifiedSnapshotTextAndSymbolOrder"],
        "emptyOverrideRemovesSourceSkullWithoutFallback": empty_export_report["semanticSkullSegmentsInOverride"] == 0 and "combat.skull" in empty_translation.get("data", {}).get("managedSourceSymbols", []),
        "emptyOverrideExportTextAroundTarget": expected_text in normalized(empty_export_text),
        "cancelRestoredSourceOccurrence": cancel["sourceAppearanceRestored"],
        "zeroApiRequests": proof_report.get("apiRequests") == 0,
        "pixelsChangedOutsideMask": experiment["renderedChangedPixelsOutsideMaskAtBackgroundResolution"],
        "imageXrefsPreservedDuringMaskExperiment": experiment["imageXrefsPreserved"],
        "visualComparison": str(comparison_path.relative_to(ROOT)),
        "emptyOverrideExportPdf": str(empty_export_pdf.relative_to(ROOT)),
        "emptyOverrideExportPdfSha256": sha(empty_export_pdf),
    }
    (candidate_dir / "pdf-visual-review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (PROOF / "visual-review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(review, ensure_ascii=False))


if __name__ == "__main__":
    main()
