#!/usr/bin/env python3
"""Close out the existing p.64 dice.white candidate without canonical writes.

Validates the original-position EN snapshot, isolated one-page export, movement,
Cancel, exact mask hashes, and independent visual review before promoting only
the candidate row in a new v12 ledger. The source PDF, Payload, canonical
sidecars, and human translations are never written.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from collections import Counter
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/proofs/translation-readiness-2026-10-14"
PROOF_ROOT = OUTPUT / "native-vector-mask-p064-pending-proof-v1"
SOURCE_PDF = Path(r"C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
SOURCE_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
CANDIDATE_ID = "p064-v205-208-n4"
TARGET_SYMBOL = "dice.white"
EXPECTED_MASK_SHA256 = "d654d6a783ae49c111398fa27574717d6f7c7f5c4a66337681def9097afcc4e5"
VISUAL_REVIEWER = "/root/review_combat_families"
TEST_SUMMARY_PATH = OUTPUT / "native-vector-mask-p065-pending-proof-v2/final-review/test-summary-v1.json"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(path: Path) -> str:
    return path.resolve().relative_to(ROOT.resolve()).as_posix()


def json_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_immutable(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != content:
            raise SystemExit(f"Refusing to overwrite different evidence: {rel(path)}")
        return
    path.write_bytes(content)


def write_v12(path: Path, content: bytes) -> None:
    if path.exists():
        if path.name == "readiness-ledger-v12.json":
            prior = read_json(path)
            if not prior.get("scope", "").startswith("v12:"):
                raise SystemExit(f"Refusing to replace a non-v12 ledger: {rel(path)}")
        elif path.name == "readiness-ledger-v12.md":
            if not path.read_text(encoding="utf-8").startswith("# MIDDARA — Ledger de prontidão para tradução (v12)"):
                raise SystemExit(f"Refusing to replace an unexpected ledger document: {rel(path)}")
        elif path.name == "readiness-ledger-v12.csv":
            if not path.read_text(encoding="utf-8").startswith("candidateId,page,symbolId,status,"):
                raise SystemExit(f"Refusing to replace an unexpected ledger CSV: {rel(path)}")
        elif path.name == "p064-family-closeout-v1.json":
            prior = read_json(path)
            if not prior.get("status", "").startswith("one existing p.64 candidate"):
                raise SystemExit(f"Refusing to replace an unexpected closeout: {rel(path)}")
        elif path.name == "visual-review.json":
            prior = read_json(path)
            if prior.get("sourcePdfSha256") != SOURCE_SHA256 or prior.get("reviewer") != VISUAL_REVIEWER:
                raise SystemExit(f"Refusing to replace an unexpected visual review: {rel(path)}")
        else:
            raise SystemExit(f"Refresh is restricted to generated v12 outputs: {rel(path)}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def render_region(page: pymupdf.Page) -> Image.Image:
    # This includes the complete source sentence and neighboring die symbols.
    clip = pymupdf.Rect(390, 530, 805, 595)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(2.6, 2.6), clip=clip, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def make_pdf_comparison(source_doc: pymupdf.Document, export_pdf: Path) -> bytes:
    export_doc = pymupdf.open(export_pdf)
    try:
        assert len(export_doc) == 1
        source_crop = render_region(source_doc[63])
        export_crop = render_region(export_doc[0])
        assert source_crop.size == export_crop.size
        margin, title_h, gap = 10, 34, 16
        width = margin * 2 + source_crop.width * 2 + gap
        height = margin * 2 + title_h * 2 + source_crop.height
        sheet = Image.new("RGB", (width, height), "#202124")
        draw = ImageDraw.Draw(sheet)
        try:
            font = ImageFont.truetype(r"C:/Windows/Fonts/arial.ttf", 18)
        except OSError:
            font = ImageFont.load_default()
        draw.text((margin, margin), "PDF FONTE · p.64", fill="white", font=font)
        export_x = margin + source_crop.width + gap
        draw.text((export_x, margin), "PDF ISOLADO · snapshot EN", fill="white", font=font)
        image_y = margin + title_h
        sheet.paste(source_crop, (margin, image_y))
        sheet.paste(export_crop, (export_x, image_y))
        buffer = io.BytesIO()
        sheet.save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()
    finally:
        export_doc.close()


def box_intersection(first: list[float], second: list[float]) -> list[float] | None:
    x0, y0 = max(first[0], second[0]), max(first[1], second[1])
    x1, y1 = min(first[2], second[2]), min(first[3], second[3])
    return [x0, y0, x1, y1] if x1 > x0 and y1 > y0 else None


def make_outlier_zoom(source_page: pymupdf.Page, export_pdf: Path) -> tuple[bytes, dict]:
    export_doc = pymupdf.open(export_pdf)
    try:
        export_page = export_doc[0]
        clip = pymupdf.Rect(410, 548, 442, 580)
        crops = []
        for page in (source_page, export_page):
            pix = page.get_pixmap(matrix=pymupdf.Matrix(8, 8), clip=clip, alpha=False)
            crops.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))

        drawings = source_page.get_drawings()
        symbol_bbox = [
            min(drawings[i]["rect"].x0 for i in range(209, 213)),
            min(drawings[i]["rect"].y0 for i in range(209, 213)),
            max(drawings[i]["rect"].x1 for i in range(209, 213)),
            max(drawings[i]["rect"].y1 for i in range(209, 213)),
        ]
        source_rook = list(source_page.search_for("Rook declines")[0])
        source_three = list(source_page.search_for("3 for a total")[0])
        export_rook = list(export_page.search_for("Rook declines")[0])
        export_three = list(export_page.search_for("3 for a total")[0])
        intersections = []
        for label, bbox in (("Rook declines", export_rook), ("3", export_three)):
            overlap = box_intersection(symbol_bbox, bbox)
            if overlap:
                intersections.append({"text": label, "bboxPt": overlap, "areaPt2": (overlap[2] - overlap[0]) * (overlap[3] - overlap[1])})
        assert len(intersections) == 2, "The fixed purple die must overlap both reflowed text fragments."

        margin, label_h, gap = 12, 34, 14
        sheet = Image.new("RGB", (crops[0].width * 2 + gap + margin * 2, crops[0].height + label_h + margin * 2), "#202124")
        draw = ImageDraw.Draw(sheet)
        font = ImageFont.truetype(r"C:/Windows/Fonts/arial.ttf", 18)
        export_x = margin + crops[0].width + gap
        draw.text((margin, margin), "SOURCE PDF", fill="white", font=font)
        draw.text((export_x, margin), "ISOLATED PDF EN", fill="white", font=font)
        image_y = margin + label_h
        sheet.paste(crops[0], (margin, image_y))
        sheet.paste(crops[1], (export_x, image_y))
        output = io.BytesIO()
        sheet.save(output, format="PNG", optimize=True)
        return output.getvalue(), {
            "id": "p064-static-purple-die-text-reflow-collision",
            "classification": "confirmed export collision outside frozen 111 placement IDs",
            "page": 64,
            "sourceDrawingIndices": [209, 210, 211, 212],
            "sourceDieBboxPt": symbol_bbox,
            "sourceTextBboxesPt": {"Rook declines": source_rook, "3 for a total": source_three},
            "isolatedPdfTextBboxesPt": {"Rook declines": export_rook, "3 for a total": export_three},
            "intersectionWithFixedDie": intersections,
            "remediated": False,
            "blocksPageLevelPass": True,
            "note": "Descriptive outlier reference only; not a candidate ID and no patch or correction is proposed.",
        }
    finally:
        export_doc.close()


def target_symbol_segments(segments: list[dict], source_key: str) -> list[dict]:
    return [
        segment for segment in segments
        if segment.get("symbolId") == TARGET_SYMBOL
        and segment.get("symbolMetrics", {}).get("sourceAppearanceKey") == source_key
    ]


def main() -> None:
    assert sha256(SOURCE_PDF) == SOURCE_SHA256, "Source PDF changed; stop before accepting this proof."
    prior_path = OUTPUT / "readiness-ledger-v11.json"
    prior = read_json(prior_path)
    assert len(prior["placements"]) == 111
    rows = {row["candidateId"]: row for row in prior["placements"]}
    row = rows[CANDIDATE_ID]
    assert row["status"] == "PENDING" and row["canonicalApplied"] is False

    proof_report_path = PROOF_ROOT / "proof-report.json"
    proof_report = read_json(proof_report_path)
    proof = next(item for item in proof_report["candidates"] if item["candidateId"] == CANDIDATE_ID)
    candidate_dir = PROOF_ROOT / CANDIDATE_ID
    candidate = read_json(candidate_dir / "candidate-input.json")
    source_slot = read_json(candidate_dir / "source-slot.json")
    movement = read_json(candidate_dir / "movement.json")
    cancel = read_json(candidate_dir / "cancel-check.json")
    empty = read_json(candidate_dir / "empty-state.json")
    original_snapshot_path = candidate_dir / "snapshot/original-position-snapshot.json"
    moved_snapshot_path = candidate_dir / "snapshot/moved-test-snapshot.json"
    snapshot = read_json(original_snapshot_path)
    moved_snapshot = read_json(moved_snapshot_path)
    pdf_path = candidate_dir / "p064-en-mask-v1.pdf"
    metrics_path = candidate_dir / "capture/export-metrics.json"
    metrics = read_json(metrics_path)
    export_log_path = candidate_dir / "export.log"
    export_log = export_log_path.read_text(encoding="utf-8")
    clean_mask_path = candidate_dir / "native-vector-clean-mask.png"
    sidecar_path = candidate_dir / "prepared-inline-elements.json"

    assert proof_report["sourcePdfSha256"] == SOURCE_SHA256
    assert proof_report["canonicalWrites"] == 0
    assert proof_report["payloadWrites"] == 0
    assert proof_report["translationWrites"] == 0
    assert proof_report["apiRequests"] == 0
    assert candidate["page"] == 64 and candidate["symbolId"] == TARGET_SYMBOL
    assert candidate["sourcePdfSha256"] == SOURCE_SHA256
    assert candidate["exactCleanMaskSha256"] == EXPECTED_MASK_SHA256
    assert sha256(clean_mask_path) == EXPECTED_MASK_SHA256
    assert proof["replacementMaskSha256"] == EXPECTED_MASK_SHA256
    assert proof["collateralChangedPixelsOutsideMask"] == 0
    assert proof["imageXrefsPreserved"] is True
    staged_page_dir = OUTPUT.parent / "full-symbol-integrity-2026-10-13/patches/pages/page_064"
    staged_sidecar_path = staged_page_dir / "inline_elements.json"
    assert sha256(staged_sidecar_path) == candidate["sourcePatchSha256"]
    assert read_json(sidecar_path) == read_json(staged_sidecar_path)
    staged_mask_path = staged_page_dir / Path(candidate["mask"]["url"]).name
    assert sha256(staged_mask_path) == candidate["originalMaskSha256"]

    assert source_slot["expectedLeftContext"] == "WHITE"
    assert source_slot["expectedRightContext"] == "6"
    assert "WHITE" in source_slot["precedingText"]
    assert "6" in source_slot["followingText"]
    source_key = candidate["metrics"]["sourceAppearanceKey"]
    assert source_key == "f922eb3ea21fad7fb0736645fa6fad858c9972cd0530707d62d2efe71fd392e1"

    assert snapshot["patched"] is True and snapshot["verifyRenderedSnapshot"] is True
    translations = snapshot["translations"]
    assert len(translations) == 1
    translation = translations[0]
    assert translation["language"] == "en"
    assert translation["spanKey"] == "page_64_block_5"
    assert not translation["spanKey"].endswith("__en")
    assert translation["data"]["managedSourceSymbols"] == ["dice.white", "combat.shield"]
    target_segments = target_symbol_segments(translation["data"]["segments"], source_key)
    assert len(target_segments) == 1
    assert sum(segment.get("symbolId") == TARGET_SYMBOL for segment in translation["data"]["segments"]) == 1
    segments = translation["data"]["segments"]
    target_index = next(i for i, segment in enumerate(segments) if segment is target_segments[0])
    left_text = "".join(segment.get("text", "") for segment in segments[:target_index])
    right_text = "".join(segment.get("text", "") for segment in segments[target_index + 1 :])
    assert left_text.rstrip().endswith("WHITE")
    assert right_text.lstrip().startswith("6")
    assert moved_snapshot["verifyRenderedSnapshot"] is True
    moved_translations = moved_snapshot["translations"]
    assert len(moved_translations) == 1 and moved_translations[0]["language"] == "en"
    assert sha256(original_snapshot_path) != sha256(moved_snapshot_path)

    empty_target_count = sum(
        segment.get("symbolId") == TARGET_SYMBOL
        for record in empty["records"]
        for segment in record.get("segments", [])
    )
    assert empty_target_count == 0
    assert cancel["recordsAfterCancel"] == 0
    assert cancel["sourceAppearanceRestored"] is True
    assert cancel["apiRequestsAtCheckpoint"] == 0
    assert movement["undoRestored"] is True and movement["redoRestored"] is True
    assert Counter(movement["originalSymbolKeys"]) == Counter(movement["movedSymbolKeys"])
    assert movement["targetSourceAppearanceKey"] == source_key
    assert sum(source_key in key for key in movement["originalSymbolKeys"]) == 1
    assert sum(source_key in key for key in movement["movedSymbolKeys"]) == 1
    assert movement["originalBboxPt"] != movement["movedBboxPt"]

    assert '"immutableSnapshot": true' in export_log
    assert "edited snapshot text/symbol order verified 1" in export_log
    assert '"pdfVerification": true' in export_log
    exporter_source = (ROOT / "scripts/export_page_pdf.mjs").read_text(encoding="utf-8")
    assert "docs = immutableSnapshot.translations ?? []" in exporter_source
    assert "refusing source fallback" in exporter_source
    assert metrics["page"] == 64 and metrics["language"] == "en"
    assert metrics["print"]["pageWidthPt"] > 0 and metrics["print"]["pageHeightPt"] > 0
    export_doc = pymupdf.open(pdf_path)
    try:
        assert len(export_doc) == 1
        pdf_text = export_doc[0].get_text()
        assert "Rook declines to Dodge" in pdf_text
        assert "WHITE" in pdf_text and "6 and PURPLE" in pdf_text
    finally:
        export_doc.close()

    reviewer_note = (
        "Independent read-only review recommends candidate-level READY for p064-v205-208-n4. The source-slot crop and "
        "isolated PDF show WHITE | dice.white | 6; the clean empty state has no target ghost or visible mask rectangle at "
        "normal reading scale, and the mask changes no pixels outside its region. A separate fixed purple die at "
        "[415.573, 555.266, 427.061, 568.525] pt overlaps the reflowed words Rook/3 in this page export; it is not this "
        "candidate, has no row among the frozen 111, and keeps p.64 without page-level PASS. At 6x, the white-die cleanup "
        "patch is smoother than the source grain; exact texture recovery is not claimed."
    )
    visual_evidence = {
        "sourcePositionViewer": candidate_dir / "capture/viewer-source-with-clean-vector-mask.png",
        "emptyViewer": candidate_dir / "capture/viewer-empty-clean-mask.png",
        "movedViewer": candidate_dir / "capture/viewer-moved-clean-mask.png",
        "exportViewer": candidate_dir / "capture/export-viewer.png",
        "exportPrint": candidate_dir / "capture/export-print.png",
        "isolatedPdfZoom": candidate_dir / "capture/isolated-pdf-target-zoom.png",
        "sourceVsPdfZoom": candidate_dir / "capture/p064-target-source-vs-pdf-zoom.png",
        "sourceVsPdfRegion": candidate_dir / "capture/p064-before-after-target-region.png",
        "pageLevelOutlierZoom": candidate_dir / "capture/p064-purple-die-reflow-collision-v2.png",
        "snapshot": original_snapshot_path,
        "movedSnapshot": moved_snapshot_path,
        "isolatedPdf": pdf_path,
        "exportLog": export_log_path,
        "candidateInput": candidate_dir / "candidate-input.json",
        "sourceSlot": candidate_dir / "source-slot.json",
        "movement": candidate_dir / "movement.json",
        "cancel": candidate_dir / "cancel-check.json",
        "emptyState": candidate_dir / "empty-state.json",
    }
    source_doc = pymupdf.open(SOURCE_PDF)
    outlier_capture = visual_evidence["pageLevelOutlierZoom"]
    outlier_capture_bytes, p064_outlier = make_outlier_zoom(source_doc[63], pdf_path)
    write_immutable(outlier_capture, outlier_capture_bytes)
    p064_outlier["visualEvidence"] = rel(outlier_capture)
    outlier_report_path = PROOF_ROOT / "final-review/p064-static-purple-die-outlier.json"
    outlier_report = {
        "schemaVersion": 1,
        "generatedAt": "2026-10-14",
        **p064_outlier,
        "sourcePdfSha256": SOURCE_SHA256,
        "isolatedPdf": rel(pdf_path),
        "isolatedPdfSha256": sha256(pdf_path),
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
    }
    write_immutable(outlier_report_path, json_bytes(outlier_report))
    for path in visual_evidence.values():
        assert path.exists() and path.stat().st_size > 0, f"Missing evidence: {path}"
    comparison_path = PROOF_ROOT / "final-review/p064-source-vs-isolated-pdf-v1.png"
    comparison_bytes = make_pdf_comparison(source_doc, pdf_path)
    source_doc.close()
    write_immutable(comparison_path, comparison_bytes)

    record = {
        "candidateId": CANDIDATE_ID,
        "page": 64,
        "symbolId": TARGET_SYMBOL,
        "priorLedgerStatus": "PENDING",
        "finalLedgerStatus": "READY",
        "statusPromotion": True,
        "newDiscovery": False,
        "sourcePdfSha256": SOURCE_SHA256,
        "originalMaskSha256": candidate["originalMaskSha256"],
        "replacementMaskSha256": sha256(clean_mask_path),
        "collateralChangedPixelsOutsideMask": 0,
        "imageXrefsPreserved": True,
        "sourceAppearanceKey": source_key,
        "sourceBBoxPt": candidate["bbox"],
        "sourceSlot": {"left": "WHITE", "symbol": TARGET_SYMBOL, "right": "6"},
        "snapshot": rel(original_snapshot_path),
        "snapshotSha256": sha256(original_snapshot_path),
        "snapshotLanguage": translation["language"],
        "snapshotSpanKey": translation["spanKey"],
        "normalizedEnKey": True,
        "verifyRenderedSnapshot": True,
        "targetAppearanceCountInSnapshot": 1,
        "emptyStateTargetAppearanceCount": 0,
        "movementUndoRedo": "passed",
        "cancelRecordsAfter": 0,
        "cancelSourceAppearanceRestored": True,
        "apiRequests": 0,
        "pdf": rel(pdf_path),
        "pdfSha256": sha256(pdf_path),
        "pdfPageCount": 1,
        "exportLog": rel(export_log_path),
        "exportMetrics": rel(metrics_path),
        "immutableSnapshotConsumed": True,
        "sourceFallbackAssessment": "none indicated; export fed the immutable normalized EN snapshot and rejected mismatched rendered order",
        "exporterPdfVerification": True,
        "normalScaleReview": "target is legible in its source slot; no reliable mask rectangle or ghost; neighboring symbols and text remain visible",
        "zoomReview": "cleanup is visibly smoother than the original grain at 6x; exact source texture recovery is not claimed",
        "visualReviewer": VISUAL_REVIEWER,
        "independentReview": reviewer_note,
        "evidence": {key: {"path": rel(path), "sha256": sha256(path)} for key, path in visual_evidence.items()},
    }

    visual_review = {
        "schemaVersion": 1,
        "reviewedAt": "2026-10-14",
        "reviewer": VISUAL_REVIEWER,
        "reviewType": "independent read-only candidate visual review",
        "status": "candidate-level READY; page-level structural pass withheld",
        "sourcePdfSha256": SOURCE_SHA256,
        "pageLevelPassAsserted": False,
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
        "summary": reviewer_note,
        "targets": [{
            "candidateId": CANDIDATE_ID,
            "status": "READY",
            "sourceSlot": "WHITE | dice.white | 6",
            "normalScale": record["normalScaleReview"],
            "enlargedScale": record["zoomReview"],
            "targetInSourceSlot": True,
            "duplicateAfterReinsert": False,
            "neighborContentCovered": False,
            "emptyStateTargetAbsent": True,
            "cancelRestoresSource": True,
            "pdfOnePageAndVerified": True,
            "evidence": record["evidence"],
        }],
        "evidence": {
            "sourceVsIsolatedPdf": {"path": rel(comparison_path), "sha256": sha256(comparison_path)},
            "isolatedPdfTargetZoom": {"path": rel(visual_evidence["isolatedPdfZoom"]), "sha256": sha256(visual_evidence["isolatedPdfZoom"])},
            "sourceVsPdfTargetZoom": {"path": rel(visual_evidence["sourceVsPdfZoom"]), "sha256": sha256(visual_evidence["sourceVsPdfZoom"])},
        },
        "pageLevelBlocker": {
            "status": "open",
            "outlier": p064_outlier,
            "effect": "A fixed purple die overlaps reflowed prose; no whole-page structural PASS is asserted.",
            "report": rel(outlier_report_path),
        },
    }
    visual_review_path = PROOF_ROOT / "final-review/visual-review.json"
    write_v12(visual_review_path, json_bytes(visual_review))

    closeout = {
        "schemaVersion": 1,
        "generatedAt": "2026-10-14",
        "status": "one existing p.64 candidate promoted to candidate-level READY; no canonical activation",
        "priorLedger": rel(prior_path),
        "priorLedgerSha256": sha256(prior_path),
        "sourcePdf": str(SOURCE_PDF),
        "sourcePdfSha256": SOURCE_SHA256,
        "discoveryCount": 0,
        "priorPreparedPlacementCount": 111,
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
        "promotion": record,
        "independentVisualReview": rel(visual_review_path),
        "sourceVsIsolatedPdfComparison": {"path": rel(comparison_path), "sha256": sha256(comparison_path)},
        "pageLevelOutlier": rel(outlier_report_path),
        "applicationValidation": {
            "path": rel(TEST_SUMMARY_PATH),
            "sha256": sha256(TEST_SUMMARY_PATH),
            "web": "203 passed, 2 skipped, 0 failed in the prior serial full run",
            "webBuild": "passed with warnings in the prior checkpoint",
            "adminIntegration": "18 passed in the prior checkpoint",
            "adminE2E": "not verified in the latest run; runner/preflight errors are recorded in test-summary-v1.json",
            "suiteApprovedInFull": False,
            "testsRerunForThisProofOnlyChange": False,
        },
        "pageLevelPassAsserted": False,
        "pageLevelBlocker": "An unremediated static purple die overlaps reflowed prose; no whole-page structural PASS is asserted.",
    }

    updated = json.loads(json.dumps(prior))
    updated_rows = {item["candidateId"]: item for item in updated["placements"]}
    updated["generatedAt"] = "2026-10-14"
    updated["scope"] = "v12: the existing frozen 111 placements only; one existing p.64 placement gained candidate-specific evidence; no canonical activation."
    updated["summary"]["technicallyReadyAndVisuallyValidated"] += 1
    updated["summary"]["sourceIdentityAndSlotConfirmed"] += 1
    updated["summary"]["technicallyPending"] -= 1
    updated["summary"]["candidateScopePlacementPromotionsThisLedger"] = [CANDIDATE_ID]
    updated["summary"]["candidateScopePlacementPromotionsInV12"] = [CANDIDATE_ID]
    updated["summary"]["p064PendingFamilyProofCount"] = 1
    updated["summary"]["p064PendingFamilyProofCandidateIds"] = [CANDIDATE_ID]
    updated["summary"]["p064CandidateLevelVisualReviewPassed"] = True
    updated["summary"]["p064PageLevelStructuralPassAsserted"] = False

    finding = next(item for item in updated["summary"]["pageLevelStructuralFindings"] if item["page"] == 64)
    finding["classification"] = "four individual candidate placements now have READY evidence; page-wide PASS remains withheld"
    finding["finding"] = (
        "p064-v201-204-n4, p064-v205-208-n4, p064-v215-217-n3, and p064-v221-223-n3 have candidate-level READY evidence. "
        "A separate static purple die at [415.573, 555.266, 427.061, 568.525] pt remains fixed in the background and overlaps "
        "the reflowed words Rook/3 in the isolated EN PDF. It is outside the 111 and unremediated; p.64 remains structurally open."
    )
    finding["evidence"] = rel(visual_review_path)
    outliers = [item for item in updated.get("pageLevelOutliersOutside111", []) if item.get("id") != p064_outlier["id"]]
    outliers.append({
        "id": p064_outlier["id"],
        "classification": p064_outlier["classification"],
        "report": rel(outlier_report_path),
        "sourceDieBboxPt": p064_outlier["sourceDieBboxPt"],
        "isolatedPdfTextBboxesPt": p064_outlier["isolatedPdfTextBboxesPt"],
        "visualEvidence": rel(outlier_capture),
        "remediated": False,
        "blocksPageLevelPass": True,
    })
    updated["pageLevelOutliersOutside111"] = outliers
    updated["summary"]["confirmedOutliersOutside111"] = len(outliers)

    target_row = updated_rows[CANDIDATE_ID]
    target_row["status"] = "READY"
    target_row["identityAndSlotConfirmed"] = True
    target_row["visualStatus"] = "technical-visual-validation-passed-with-zoom-texture-caveat"
    target_row["statusOrigin"] = "candidate-specific p.64 original-position proof plus independent visual review; v12 promotion"
    target_row["reason"] = (
        "Promoted from PENDING after the normalized EN snapshot retained exactly one dice.white with its sourceAppearanceKey "
        "in the source slot WHITE | dice.white | 6; the immutable one-page PDF passed export verification, movement undo/redo "
        "and Cancel passed, and the independent review found no reliable mask rectangle or ghost at normal reading scale. "
        "The cleanup patch is visibly smoother than the source grain at 6x, so exact texture recovery is not claimed. "
        "A separate static purple die overlaps reflowed Rook/3 text; it is not this candidate and remains an unremediated page-level outlier. "
        "Candidate-level READY only; the p.64 page-level structural PASS remains withheld."
    )
    target_row["p064FamilyProof"] = record
    target_row["candidateVisualReview"] = {
        "reviewer": VISUAL_REVIEWER,
        "status": "candidate-ready-normal-reading-scale-with-zoom-texture-caveat",
        "evidence": record["evidence"],
        "pageLevelPassAsserted": False,
    }

    assert Counter(item["status"] for item in updated["placements"]) == Counter({"READY": 75, "AESTHETIC_APPROVAL_PENDING": 3, "PENDING": 15, "BLOCKED": 18})
    assert sum(item["identityAndSlotConfirmed"] for item in updated["placements"]) == 78
    assert len({item["candidateId"] for item in updated["placements"]}) == 111
    assert updated["summary"]["canonicalPlacementsApplied"] == 0
    assert updated["summary"]["specialCompositionCasesExcluded"] == 6
    assert updated["summary"]["pageLevelStructuralPassWithheld"] == [45, 64, 65, 68, 102]

    json_path = OUTPUT / "readiness-ledger-v12.json"
    csv_path = OUTPUT / "readiness-ledger-v12.csv"
    markdown_path = OUTPUT / "readiness-ledger-v12.md"
    write_v12(json_path, json_bytes(updated))
    fields = ["candidateId", "page", "symbolId", "status", "identityAndSlotConfirmed", "isolatedPatchPrepared", "appliedInDryRunSimulation", "canonicalApplied", "visualStatus", "statusOrigin", "reason"]
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for item in updated["placements"]:
        writer.writerow({key: item.get(key, "") for key in fields})
    write_v12(csv_path, buffer.getvalue().encode("utf-8"))

    summary = updated["summary"]
    markdown = f"""# MIDDARA — Ledger de prontidão para tradução (v12)

Atualizado em 2026-10-14. O ledger parte do v11 e mantém os mesmos 111 placements; não grava no canônico.

## Estado dos placements

- **{summary['technicallyReadyAndVisuallyValidated']} READY** no escopo individual dos candidatos, incluindo uma promoção da p.64.
- **{summary['aestheticApprovalPending']} aguardando aceite estético humano**, todos da p.92; textura sintética aproximada, não recuperação exata da arte.
- **{summary['technicallyPending']} pendentes** de evidência própria.
- **{summary['evidenceBlockedWithin111']} bloqueados**.
- **{summary['sourceIdentityAndSlotConfirmed']}** com identidade e slot confirmados.
- Total congelado: **{summary['totalPreparedPlacements']}**. As seis composições especiais continuam separadas e bloqueadas.

## Promoção da p.64

- `{CANDIDATE_ID}` (`{TARGET_SYMBOL}`): `WHITE` → dado → `6`.
- Já era um placement PENDING entre os 111; não é nova descoberta. A exportação anterior usava o estado pós-movimento. Esta prova serializa o estado original em EN com a chave normalizada `page_64_block_5`, uma ocorrência e o `sourceAppearanceKey` fonte. O exportador recebeu snapshot imutável, verificou a ordem de texto/símbolos e validou o PDF isolado de uma página.
- O estado vazio não contém o alvo; movimento com undo/redo, Cancel e restauração da aparência fonte passaram. A revisão independente não viu retângulo de máscara ou ghost confiável em escala normal e confirmou que vizinhos permanecem visíveis.
- Em ampliação 6x, a área reconstruída é mais lisa que a granulação fonte. O resultado não é classificado como recuperação exata da textura original.
- Evidências: [fechamento](native-vector-mask-p064-pending-proof-v1/final-review/p064-family-closeout-v1.json), [revisão visual](native-vector-mask-p064-pending-proof-v1/final-review/visual-review.json), [comparação fonte/PDF](native-vector-mask-p064-pending-proof-v1/final-review/p064-source-vs-isolated-pdf-v1.png), [PDF isolado](native-vector-mask-p064-pending-proof-v1/p064-v205-208-n4/p064-en-mask-v1.pdf).

**A p.64 permanece sem PASS estrutural.** Um dado roxo fixo em `[415.573, 555.266, 427.061, 568.525] pt` fica no fundo enquanto o texto EN refluído se sobrepõe a “Rook” e “3”. Esse símbolo não tem placement nos 111 e permanece sem correção. Veja o [relatório do outlier](native-vector-mask-p064-pending-proof-v1/final-review/p064-static-purple-die-outlier.json) e o [recorte 8x](native-vector-mask-p064-pending-proof-v1/p064-v205-208-n4/capture/p064-purple-die-reflow-collision-v1.png). A READY acima vale só para o patch do dado branco.

## Totais de reconciliação preservados

- Detector: {summary['unmatchedSourceGlyphCandidatesDetected']} candidatos de glifo não correspondidos.
- {summary['initialPlacementCandidates']} candidatos iniciais + {summary['reconciledPlacementCandidates']} reconciliados = {summary['potentialPlacementsAfterReconciliation']} oportunidades potenciais.
- {summary['potentialPlacementsAfterReconciliation']} − {summary['specialCompositionCasesExcluded']} composições especiais = {summary['isolatedPatchPlacementsPrepared']} patches isolados preparados.
- Nenhuma descoberta adicional nesta revisão; zero ativação canônica.

## Testes e integridade

Este passo alterou somente provas, relatório e ledger; não mudou código do app, Payload, sidecars canônicos, PDF fonte ou traduções humanas, portanto não repetiu a suíte. A última execução serial web continua registrada como 203 aprovados, 2 ignorados e 0 falhas; build TypeScript/web e admin integration também passaram no checkpoint anterior. Admin E2E, lint e avisos do build seguem com as limitações registradas; a suíte inteira não está declarada aprovada. Recibo: [test-summary-v1.json](native-vector-mask-p065-pending-proof-v2/final-review/test-summary-v1.json).

O script [`finalize_p064_pending_candidate.py`](../../scripts/finalize_p064_pending_candidate.py) valida hashes, snapshot, export, estados e evidências antes de gerar este ledger. O canônico permanece sem alterações.
"""
    write_v12(markdown_path, markdown.encode("utf-8"))
    write_v12(PROOF_ROOT / "final-review/p064-family-closeout-v1.json", json_bytes(closeout))
    write_v12(visual_review_path, json_bytes(visual_review))

    print(json.dumps({
        "promoted": CANDIDATE_ID,
        "counts": {key: summary[key] for key in ("technicallyReadyAndVisuallyValidated", "aestheticApprovalPending", "technicallyPending", "evidenceBlockedWithin111", "sourceIdentityAndSlotConfirmed", "totalPreparedPlacements")},
        "ledger": rel(json_path),
        "closeout": rel(PROOF_ROOT / "final-review/p064-family-closeout-v1.json"),
        "comparison": rel(comparison_path),
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "page64StructuralPassAsserted": False,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
