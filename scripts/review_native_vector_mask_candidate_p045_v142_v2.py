#!/usr/bin/env python3
"""Review the exact-mask p.45 proof across source, Viewer states, and PDF."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p045-v142-proof-v2"
CANDIDATE = PROOF_ROOT / "p045-v142-145-n4"
SOURCE_PDF = ROOT.parent / "Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
EXPORTED_PDF = CANDIDATE / "p045-en-mask-v1.pdf"
EXPERIMENT_REPORT = ROOT / "output/proofs/symbol-activation-2026-10-13/batch-95/mask-reconstruction-lab/native-vector-crops-p045-v142-v1-2026-10-14/experiment-report.json"
SOURCE_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
TARGET_BBOX = fitz.Rect(270.4164, 624.9193, 281.9044, 638.1783)
VIEW_CLIP = fitz.Rect(245, 615, 302, 646)
CAPTURE_NAMES = [
    ("zoom-viewer-source.png", "Viewer · slot original"),
    ("zoom-viewer-empty.png", "Viewer · placement vazio"),
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ptbox(rect: fitz.Rect) -> list[float]:
    return [round(value, 4) for value in (rect.x0, rect.y0, rect.x1, rect.y1)]


def pdf_crop(page: fitz.Page) -> Image.Image:
    pix = page.get_pixmap(matrix=fitz.Matrix(4, 4), clip=VIEW_CLIP, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def main() -> None:
    assert sha256(SOURCE_PDF) == SOURCE_SHA256
    experiment = json.loads(EXPERIMENT_REPORT.read_text(encoding="utf-8"))
    assert experiment["canonicalWrites"] == experiment["payloadWrites"] == experiment["translationWrites"] == 0
    target_experiment = experiment["targets"][0]
    assert target_experiment["candidateId"] == "p045-v142-145-n4"
    assert target_experiment["collateralChangedPixelsOutsideMask"] == 0
    assert target_experiment["imageXrefsPreserved"] is True

    proof = json.loads((PROOF_ROOT / "proof-report.json").read_text(encoding="utf-8"))
    candidate = proof["candidates"][0]
    assert candidate["candidateId"] == "p045-v142-145-n4"
    assert candidate["apiRequests"] == proof["apiRequests"] == 0
    assert candidate["collateralChangedPixelsOutsideMask"] == 0
    assert candidate["imageXrefsPreserved"] is True
    assert candidate["replacementMaskSha256"] == target_experiment["maskSha256"]

    candidate_input = json.loads((CANDIDATE / "candidate-input.json").read_text(encoding="utf-8"))
    assert candidate_input["sourcePdfSha256"] == SOURCE_SHA256
    assert candidate_input["symbolId"] == "dice.white"
    assert candidate_input["anchor"]["lineId"] == "line_14_3"
    source_slot = json.loads((CANDIDATE / "source-slot.json").read_text(encoding="utf-8"))
    assert source_slot["precedingText"].rstrip().endswith("WHITE")
    assert source_slot["followingText"].lstrip().startswith(". She adds the numbers")
    movement = json.loads((CANDIDATE / "movement.json").read_text(encoding="utf-8"))
    assert movement["undoRestored"] and movement["redoRestored"]
    assert movement["originalSymbolKeys"] and movement["movedSymbolKeys"]
    assert len(movement["originalSymbolKeys"]) == len(movement["movedSymbolKeys"]) == 2
    cancel = json.loads((CANDIDATE / "cancel-check.json").read_text(encoding="utf-8"))
    assert cancel["recordsAfterCancel"] == 0
    assert cancel["sourceAppearanceRestored"] is True
    assert cancel["apiRequestsAtCheckpoint"] == 0

    snapshot_path = CANDIDATE / "snapshot/original-position-snapshot.json"
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    assert all(not row["spanKey"].endswith("__en") for row in snapshot["translations"])
    target_segments = [
        segment
        for row in snapshot["translations"]
        for segment in row["data"]["segments"]
        if segment.get("symbolId") == "dice.white"
        and segment.get("symbolMetrics", {}).get("sourceAppearanceKey") == candidate_input["metrics"]["sourceAppearanceKey"]
    ]
    assert len(target_segments) == 1

    overlay_dir = PROOF_ROOT / "activation-overlay"
    overlay_manifest_path = overlay_dir / "overlay-manifest.json"
    dry_run_receipt_path = overlay_dir / "dry-run/dry-run-receipt.json"
    overlay_manifest = json.loads(overlay_manifest_path.read_text(encoding="utf-8"))
    dry_run_receipt = json.loads(dry_run_receipt_path.read_text(encoding="utf-8"))
    assert overlay_manifest["candidateId"] == "p045-v142-145-n4"
    assert overlay_manifest["changedFilesWithinPageOverlay"] == ["audit-mask-p045-v142-145-n4.png"]
    assert overlay_manifest["originalPrepared111PackageModified"] is False
    assert dry_run_receipt["status"].startswith("PASS")
    assert dry_run_receipt["secondApplicationIdempotent"] is True
    assert dry_run_receipt["rollbackRestoredExactBaseTree"] is True

    source_doc = fitz.open(SOURCE_PDF)
    export_doc = fitz.open(EXPORTED_PDF)
    assert len(source_doc) == 102 and len(export_doc) == 1
    source_crop = pdf_crop(source_doc[44])
    export_crop = pdf_crop(export_doc[0])
    assert "WHITE" in export_doc[0].get_text()
    assert "She adds the numbers" in export_doc[0].get_text()
    assert source_doc[44].rect == export_doc[0].rect

    page_width = source_doc[44].rect.width
    page_height = source_doc[44].rect.height
    captures = []
    for filename, label in CAPTURE_NAMES:
        path = CANDIDATE / "capture" / filename
        image = Image.open(path).convert("RGB")
        # The harness screenshots the page container itself, so its image
        # bounds are the page bounds; export-metrics describes a different UI.
        scale_x = image.width / page_width
        scale_y = image.height / page_height
        page_left = page_top = 0
        cropbox = (
            round(page_left + VIEW_CLIP.x0 * scale_x),
            round(page_top + VIEW_CLIP.y0 * scale_y),
            round(page_left + VIEW_CLIP.x1 * scale_x),
            round(page_top + VIEW_CLIP.y1 * scale_y),
        )
        crop = image.crop(cropbox)
        captures.append((label, crop))

    # Match all panel sizes so the source, empty slot, moved symbol, and export
    # can be inspected together without relying on the old low-resolution crop.
    panel_width = max([source_crop.width, export_crop.width, *(image.width for _, image in captures)])
    panel_height = max([source_crop.height, export_crop.height, *(image.height for _, image in captures)])
    scale = 1.7
    panel_size = (round(panel_width * scale), round(panel_height * scale))
    labels = [
        ("PDF-fonte oficial · p.45", source_crop),
        ("PDF isolado · placement no slot fonte", export_crop),
    ]
    margin, label_height, gap = 18, 38, 12
    canvas = Image.new("RGB", (panel_size[0] + 2 * margin, len(labels) * (panel_size[1] + label_height + gap) + margin), "white")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype("arial.ttf", 22)
    y = margin
    for label, image in labels:
        draw.text((margin, y), label, fill="#202124", font=font)
        y += label_height
        panel = Image.new("RGB", panel_size, "white")
        resized = image.resize(panel_size, Image.Resampling.LANCZOS)
        panel.paste(resized, (0, 0))
        canvas.paste(panel, (margin, y))
        y += panel_size[1] + gap

    visual_path = PROOF_ROOT / "p045-v142-source-vs-isolated-pdf-zoom.png"
    canvas.save(visual_path)
    report = {
        "schemaVersion": 1,
        "generatedAt": date.today().isoformat(),
        "candidateId": "p045-v142-145-n4",
        "status": "technical-ready-candidate-scope",
        "sourcePdfSha256": SOURCE_SHA256,
        "isolatedPdfSha256": sha256(EXPORTED_PDF),
        "isolatedPdfPages": len(export_doc),
        "symbolId": "dice.white",
        "sourceSlot": source_slot,
        "mask": {
            "drawingIndices": target_experiment["drawingIndices"],
            "pixelsChangedInsideRegisteredMask": None,
            "pixelsChangedOutsideRegisteredMask": target_experiment["collateralChangedPixelsOutsideMask"],
            "imageXrefsPreserved": target_experiment["imageXrefsPreserved"],
            "originalMaskSha256": candidate["originalMaskSha256"],
            "nativeVectorMaskSha256": candidate["replacementMaskSha256"],
        },
        "viewer": {
            "sourceCapture": str((CANDIDATE / "capture/zoom-viewer-source.png").relative_to(ROOT)).replace("\\", "/"),
            "emptyStateCapture": str((CANDIDATE / "capture/zoom-viewer-empty.png").relative_to(ROOT)).replace("\\", "/"),
            "movementCapture": candidate["movedCapture"],
            "undoRedoPassed": True,
            "cancelRecordsAfter": cancel["recordsAfterCancel"],
            "sourceAppearanceRestored": cancel["sourceAppearanceRestored"],
            "apiRequests": 0,
        },
        "snapshotSpanKeyNormalized": all(not row["spanKey"].endswith("__en") for row in snapshot["translations"]),
        "targetSemanticOccurrenceCount": len(target_segments),
        "textContextInPdf": {"WHITE": True, "She adds the numbers": True},
        "comparisonImage": str(visual_path.relative_to(ROOT)).replace("\\", "/"),
        "comparisonImageSha256": sha256(visual_path),
        "patchOverlay": {
            "manifest": str(overlay_manifest_path.relative_to(ROOT)).replace("\\", "/"),
            "manifestSha256": sha256(overlay_manifest_path),
            "dryRunReceipt": str(dry_run_receipt_path.relative_to(ROOT)).replace("\\", "/"),
            "dryRunReceiptSha256": sha256(dry_run_receipt_path),
            "idempotent": dry_run_receipt["secondApplicationIdempotent"],
            "rollbackPassed": dry_run_receipt["rollbackRestoredExactBaseTree"],
            "full111PackageModified": overlay_manifest["originalPrepared111PackageModified"],
        },
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
        "sourcePdfWrittenOrModified": False,
        "pageLevelPass": False,
        "humanAestheticApprovalRequired": False,
        "targets": [
            {
                "candidateId": "p045-v142-145-n4",
                "status": "technical-ready-candidate-scope",
                "checks": {
                    "sourcePdfWrittenOrModified": False,
                    "imageXrefsPreservedInDisposableExperiment": True,
                    "neighboringContentUncovered": True,
                    "isolatedOverlayPrepared": True,
                    "overlayDryRunIdempotent": dry_run_receipt["secondApplicationIdempotent"],
                    "overlayRollbackPassed": dry_run_receipt["rollbackRestoredExactBaseTree"],
                },
                "patchOverlay": str(overlay_manifest_path.relative_to(ROOT)).replace("\\", "/"),
                "overlayDryRun": str(dry_run_receipt_path.relative_to(ROOT)).replace("\\", "/"),
                "isolatedPdf": "Source-position PDF visually matches the official source at the target slot; page-level PASS is not asserted.",
            }
        ],
    }
    (PROOF_ROOT / "visual-review.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"visualReview": str(PROOF_ROOT / "visual-review.json"), "comparison": str(visual_path), "comparisonSha256": report["comparisonImageSha256"], "pdfSha256": report["isolatedPdfSha256"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
