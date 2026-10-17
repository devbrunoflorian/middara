#!/usr/bin/env python3
"""Close the p.67 white-die candidate in a new immutable readiness ledger."""

from __future__ import annotations

import copy
import csv
import hashlib
import io
import json
from collections import Counter
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/proofs/translation-readiness-2026-10-14"
PROOF_ROOT = OUTPUT / "native-vector-mask-p067-v155-pending-proof-v1"
TARGET_ROOT = PROOF_ROOT / "p067-v155-158-n4"
SOURCE_PDF = Path(r"C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
SOURCE_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
CANDIDATE_ID = "p067-v155-158-n4"
TARGET_SYMBOL = "dice.white"
SOURCE_APPEARANCE_KEY = "f922eb3ea21fad7fb0736645fa6fad858c9972cd0530707d62d2efe71fd392e1"
EXPECTED_CLEAN_MASK_SHA256 = "afaf3845ef50be5efdf2178c09d7f5fb120c6008d35d27df35f2baef2f3395f9"
PURPLE_OUTLIER_ID = "p067-static-purple-die-2-reflow-collision"
PRE_REVIEW_V14_HASHES = {
    "output/proofs/translation-readiness-2026-10-14/readiness-ledger-v14.json": "3559413565e998a709276c0ed32cf70cec95458e93ca11df85c9b3cfa5dbb655",
    "output/proofs/translation-readiness-2026-10-14/readiness-ledger-v14.md": "eefeee0815291212371cb28c9d6e740f77d86b4221c08b3bfee33a9a9dbcd34b",
    "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p067-v155-pending-proof-v1/final-review-v14/visual-review.json": "5a421768d32991c26d0485b9cc022fb40b95686b4082af755c036c888f42cffa",
    "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p067-v155-pending-proof-v1/final-review-v14/p067-v155-family-closeout-v1.json": "094ece63a2a99b45edbb4d67471a70b8b45a98bd9c9ad5c8984fc681cdf11d5c",
    "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p067-v155-pending-proof-v1/final-review-v14/p067-static-purple-die-2-outlier.json": "2f2eca1df52b8ef8443946946b206da0241e76f6c4bd5824ce465950600da1c7",
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def rel(path: Path) -> str:
    return path.resolve().relative_to(ROOT.resolve()).as_posix()


def output_rel(path: Path) -> str:
    return path.resolve().relative_to(OUTPUT.resolve()).as_posix()


def write_immutable(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != content:
            prior_hash = PRE_REVIEW_V14_HASHES.get(rel(path))
            if prior_hash is None or sha256(path) != prior_hash:
                raise SystemExit(f"Refusing to overwrite different evidence: {rel(path)}")
            # Exact one-time correction after independent review. Once updated,
            # later executions require byte-identical output as usual.
            path.write_bytes(content)
        return
    path.write_bytes(content)


def union_rect(rectangles: list[pymupdf.Rect]) -> list[float]:
    return [
        min(rect.x0 for rect in rectangles),
        min(rect.y0 for rect in rectangles),
        max(rect.x1 for rect in rectangles),
        max(rect.y1 for rect in rectangles),
    ]


def intersection(first: list[float], second: list[float]) -> list[float] | None:
    x0, y0 = max(first[0], second[0]), max(first[1], second[1])
    x1, y1 = min(first[2], second[2]), min(first[3], second[3])
    return [x0, y0, x1, y1] if x1 > x0 and y1 > y0 else None


def find_word_bbox(page: pymupdf.Page, predicate, region: pymupdf.Rect) -> tuple[str, list[float]]:
    matches = [
        (item[4], list(item[:4]))
        for item in page.get_text("words")
        if predicate(item[4]) and pymupdf.Rect(item[:4]).intersects(region)
    ]
    if len(matches) != 1:
        raise SystemExit(f"Expected one matching word in {tuple(region)}; found {len(matches)}: {matches}")
    return matches[0]


def count_target_symbols(snapshot: dict) -> list[dict]:
    return [
        segment
        for translation in snapshot.get("translations", [])
        for segment in translation.get("data", {}).get("segments", [])
        if segment.get("symbolId") == TARGET_SYMBOL
        and segment.get("symbolMetrics", {}).get("sourceAppearanceKey") == SOURCE_APPEARANCE_KEY
    ]


def main() -> None:
    assert sha256(SOURCE_PDF) == SOURCE_SHA256, "Expected source PDF changed."
    prior_path = OUTPUT / "readiness-ledger-v13.json"
    prior = read_json(prior_path)
    assert prior["scope"].startswith("v13:")
    assert len(prior["placements"]) == 111
    assert prior["summary"]["canonicalPlacementsApplied"] == 0
    assert prior["summary"]["specialCompositionCasesExcluded"] == 6
    prior_rows = {item["candidateId"]: item for item in prior["placements"]}
    row = prior_rows[CANDIDATE_ID]
    assert row["status"] == "PENDING" and row["identityAndSlotConfirmed"] is False
    assert row["canonicalApplied"] is False

    candidate_input_path = TARGET_ROOT / "candidate-input.json"
    candidate_input = read_json(candidate_input_path)
    assert candidate_input["candidateId"] == CANDIDATE_ID
    assert candidate_input["symbolId"] == TARGET_SYMBOL
    assert candidate_input["sourcePdfSha256"] == SOURCE_SHA256
    assert candidate_input["exactCleanMaskSha256"] == EXPECTED_CLEAN_MASK_SHA256
    assert candidate_input["experiment"]["drawingIndices"] == [155, 156, 157, 158]
    assert candidate_input["experiment"]["collateralChangedPixelsOutsideMask"] == 0
    assert candidate_input["experiment"]["imageXrefsPreserved"] is True
    mask_path = TARGET_ROOT / "native-vector-clean-mask.png"
    assert sha256(mask_path) == EXPECTED_CLEAN_MASK_SHA256
    assert abs(candidate_input["sourceLineHeight"] - 1.199786376953125) < 1e-12

    original_snapshot_path = TARGET_ROOT / "snapshot/original-position-snapshot.json"
    original_snapshot = read_json(original_snapshot_path)
    assert original_snapshot["page"] == 67
    assert len(original_snapshot["translations"]) == 1
    translation = original_snapshot["translations"][0]
    assert translation["spanKey"] == "page_67_block_13"
    assert translation["language"] == "en"
    assert not translation["spanKey"].endswith("__en")
    assert abs(translation["data"]["lineHeight"] - candidate_input["sourceLineHeight"]) < 1e-12
    source_symbols = count_target_symbols(original_snapshot)
    assert len(source_symbols) == 1
    assert source_symbols[0]["symbolMetrics"]["sourceAppearanceKey"] == SOURCE_APPEARANCE_KEY

    source_slot = read_json(TARGET_ROOT / "source-slot.json")
    assert source_slot["expectedLeftContext"] == "WHITE"
    assert source_slot["expectedRightContext"] == "6"
    assert "WHITE" in source_slot["precedingText"] and "6" in source_slot["followingText"]

    empty_snapshot_path = TARGET_ROOT / "snapshot/empty-position-snapshot.json"
    empty_snapshot = read_json(empty_snapshot_path)
    assert empty_snapshot["page"] == 67
    assert empty_snapshot["translations"][0]["spanKey"] == "page_67_block_13"
    assert not count_target_symbols(empty_snapshot)
    empty_state = read_json(TARGET_ROOT / "empty-state.json")
    empty_state_symbols = [
        segment
        for record in empty_state.get("records", [])
        for segment in record.get("segments", [])
        if segment.get("symbolId") == TARGET_SYMBOL
        and segment.get("symbolMetrics", {}).get("sourceAppearanceKey") == SOURCE_APPEARANCE_KEY
    ]
    assert not empty_state_symbols

    movement = read_json(TARGET_ROOT / "movement.json")
    assert movement["targetSourceAppearanceKey"] == SOURCE_APPEARANCE_KEY
    assert movement["undoRestored"] is True and movement["redoRestored"] is True
    assert movement["originalBboxPt"] != movement["movedBboxPt"]
    assert movement["originalSymbolKeys"][0].startswith(TARGET_SYMBOL + ":")
    assert movement["movedSymbolKeys"][-1].startswith(TARGET_SYMBOL + ":")
    cancel = read_json(TARGET_ROOT / "cancel-check.json")
    assert cancel == {"recordsAfterCancel": 0, "sourceAppearanceRestored": True, "apiRequestsAtCheckpoint": 0}

    proof_report = read_json(PROOF_ROOT / "proof-report.json")
    assert proof_report["sourcePdfSha256"] == SOURCE_SHA256
    assert proof_report["canonicalWrites"] == proof_report["payloadWrites"] == proof_report["translationWrites"] == 0
    assert proof_report["apiRequests"] == 0
    assert proof_report["candidates"][0]["collateralChangedPixelsOutsideMask"] == 0

    expected_captures = [
        "p067-source-vs-reinserted-vs-empty-crop-v1.png",
        "p067-purple-die-source-vs-reflow-v1.png",
        "p067-reinserted-pdf-page-v1.png",
        "p067-empty-pdf-page-v1.png",
        "viewer-empty-clean-mask.png",
        "viewer-moved-clean-mask.png",
        "export-viewer.png",
        "export-print.png",
        "empty-export-viewer.png",
        "empty-export-print.png",
    ]
    for name in expected_captures:
        assert (TARGET_ROOT / "capture" / name).is_file(), f"Missing visual evidence: {name}"

    export_log = (TARGET_ROOT / "export.log").read_text(encoding="utf-8")
    empty_export_log = (TARGET_ROOT / "empty-export.log").read_text(encoding="utf-8")
    for log in (export_log, empty_export_log):
        assert '"immutableSnapshot": true' in log
        assert "edited snapshot text/symbol order verified 1" in log
        assert '"pdfVerification": true' in log
    export_metrics = read_json(TARGET_ROOT / "capture/export-metrics.json")
    empty_metrics = read_json(TARGET_ROOT / "capture/empty-export-metrics.json")
    assert export_metrics["page"] == empty_metrics["page"] == 67
    assert export_metrics["language"] == empty_metrics["language"] == "en"
    assert len(export_metrics["viewer"]["symbols"]) == 14
    assert len(export_metrics["print"]["symbols"]) == 14
    assert len(empty_metrics["viewer"]["symbols"]) == 13
    assert len(empty_metrics["print"]["symbols"]) == 13

    source_doc = pymupdf.open(SOURCE_PDF)
    rein_doc = pymupdf.open(TARGET_ROOT / "p067-en-mask-v1.pdf")
    empty_doc = pymupdf.open(TARGET_ROOT / "empty-position-en-mask-v1.pdf")
    try:
        assert len(source_doc) == 102 and len(rein_doc) == len(empty_doc) == 1
        source_page, rein_page, empty_page = source_doc[66], rein_doc[0], empty_doc[0]
        source_box = tuple(round(v, 4) for v in source_page.rect)
        assert source_box == tuple(round(v, 4) for v in rein_page.rect) == tuple(round(v, 4) for v in empty_page.rect)

        target_rect = pymupdf.Rect(candidate_input["bbox"])
        source_drawings = source_page.get_drawings()
        assert max(candidate_input["experiment"]["drawingIndices"]) < len(source_drawings)
        source_target_rect = union_rect([source_drawings[i]["rect"] for i in candidate_input["experiment"]["drawingIndices"]])
        assert abs(source_target_rect[0] - target_rect.x0) < 0.05
        assert abs(source_target_rect[2] - target_rect.x1) < 0.05
        rein_target_drawings = [
            d for d in rein_page.get_drawings()
            if d["rect"].intersects(target_rect) and d["rect"].get_area() < 500
        ]
        empty_target_drawings = [
            d for d in empty_page.get_drawings()
            if d["rect"].intersects(target_rect) and d["rect"].get_area() < 500
        ]
        assert rein_target_drawings, "The reinsertion must be vector paint in the target slot."
        assert not empty_target_drawings, "The empty PDF must have no target vector paint in the source slot."

        region = pymupdf.Rect(490, 520, 570, 548)
        source_white, source_white_box = find_word_bbox(source_page, lambda w: w == "WHITE", region)
        source_six, source_six_box = find_word_bbox(source_page, lambda w: w == "6", region)
        rein_white, rein_white_box = find_word_bbox(rein_page, lambda w: w == "WHITE", region)
        rein_six, rein_six_box = find_word_bbox(rein_page, lambda w: w == "6", region)
        empty_white, empty_white_box = find_word_bbox(empty_page, lambda w: w == "WHITE", region)
        empty_six, empty_six_box = find_word_bbox(empty_page, lambda w: w == "6", region)
        assert source_white == rein_white == empty_white == "WHITE"
        assert source_six == rein_six == empty_six == "6"
        assert source_white_box[2] < source_target_rect[0] < source_six_box[0]
        rein_target_rect = union_rect([d["rect"] for d in rein_target_drawings])
        assert rein_white_box[2] < rein_target_rect[0] < rein_six_box[0]
        assert empty_white_box[2] < empty_six_box[0]

        # This is a separate purple-die source vector, outside the frozen 111.
        purple_indices = [159, 160, 161, 162]
        assert max(purple_indices) < len(source_drawings)
        purple_rect = union_rect([source_drawings[i]["rect"] for i in purple_indices])
        expected_purple = [618.2517700195312, 529.3421630859375, 629.7398071289062, 542.6011962890625]
        assert all(abs(a - b) < 0.01 for a, b in zip(purple_rect, expected_purple))
        word_region = pymupdf.Rect(600, 525, 655, 548)
        source_word, source_word_box = find_word_bbox(source_page, lambda w: w.startswith("6"), word_region)
        rein_word, rein_word_box = find_word_bbox(rein_page, lambda w: w.startswith("6"), word_region)
        empty_word, empty_word_box = find_word_bbox(empty_page, lambda w: w.startswith("6"), word_region)
        assert source_word.startswith("6") and rein_word.startswith("6") and empty_word.startswith("6")
        assert intersection(purple_rect, source_word_box) is None
        collision = intersection(purple_rect, rein_word_box)
        assert collision is not None
        assert intersection(purple_rect, empty_word_box) is None
        collision_area = (collision[2] - collision[0]) * (collision[3] - collision[1])
        assert collision_area > 70
    finally:
        source_doc.close()
        rein_doc.close()
        empty_doc.close()

    assert not any(item["page"] == 67 and item["symbolId"] == "dice.purple" for item in prior["placements"])
    review_dir = PROOF_ROOT / "final-review-v14"
    purple_evidence = TARGET_ROOT / "capture/p067-purple-die-source-vs-reflow-v1.png"
    purple_outlier_path = review_dir / "p067-static-purple-die-2-outlier.json"
    purple_outlier = {
        "id": PURPLE_OUTLIER_ID,
        "classification": "confirmed isolated-export collision from a preserved source vector; outside the frozen 111 placement IDs; ownership unresolved",
        "report": rel(purple_outlier_path),
        "candidateId": None,
        "page": 67,
        "sourceDrawingIndices": purple_indices,
        "sourceDieBboxPt": purple_rect,
        "sourceText6BboxPt": source_word_box,
        "isolatedReinsertedPdfText6BboxPt": rein_word_box,
        "emptyOverridePdfText6BboxPt": empty_word_box,
        "collisionIntersectionBboxPt": collision,
        "bboxIntersectionAreaPt2": collision_area,
        "collisionMetric": "Area of intersection between the axis-aligned source-vector bbox and extracted text bbox; not an exact glyph-ink overlap measurement.",
        "visualEvidence": rel(purple_evidence),
        "remediated": False,
        "blocksPageLevelPass": True,
        "note": "The p067-v155 white-die patch is candidate-ready, but the separate purple source die remains fixed and overlaps the reflowed numeral 6 in the reinsertion PDF. The empty override moves the text clear; no ownership or repair is inferred here.",
    }
    write_immutable(purple_outlier_path, json_bytes(purple_outlier))

    visual_review = {
        "schemaVersion": 1,
        "candidateId": CANDIDATE_ID,
        "page": 67,
        "status": "READY in candidate scope; page-level PASS withheld",
        "reviewMethod": "Official PDF geometry and drawings, prepared sidecar, normalized immutable EN snapshots, isolated Viewer/PDF exports, aligned same-scale crops, and independent read-only family review.",
        "sourcePdfSha256": SOURCE_SHA256,
        "sourcePositionSnapshotSha256": sha256(original_snapshot_path),
        "emptyPositionSnapshotSha256": sha256(empty_snapshot_path),
        "isolatedReinsertedPdfSha256": sha256(TARGET_ROOT / "p067-en-mask-v1.pdf"),
        "isolatedEmptyPdfSha256": sha256(TARGET_ROOT / "empty-position-en-mask-v1.pdf"),
        "replacementMaskSha256": EXPECTED_CLEAN_MASK_SHA256,
        "originalMaskSha256": candidate_input["originalMaskSha256"],
        "sourceSlot": "WHITE | dice.white | 6",
        "snapshotContract": {
            "normalizedOwnerKey": translation["spanKey"],
            "language": translation["language"],
            "sourceLineHeight": translation["data"]["lineHeight"],
            "sourceTargetOccurrences": len(source_symbols),
            "emptyOverrideTargetOccurrences": len(count_target_symbols(empty_snapshot)),
        },
        "emptyState": {
            "targetSemanticOccurrences": 0,
            "targetVectorPaintAtSourceSlotInPdf": 0,
            "visualEvidence": rel(TARGET_ROOT / "capture/p067-source-vs-reinserted-vs-empty-crop-v1.png"),
            "isolatedPdfPage": rel(TARGET_ROOT / "capture/p067-empty-pdf-page-v1.png"),
            "review": "The aligned source/PDF crop shows the target in the slot; the empty override shows WHITE 6 with no target symbol, no target vector drawing in the PDF slot, and no visible patch rectangle at the reviewed crop scale.",
        },
        "reinsertion": {
            "targetVectorPaintAtSourceSlotInPdf": len(rein_target_drawings),
            "symbolCountViewer": len(export_metrics["viewer"]["symbols"]),
            "emptySymbolCountViewer": len(empty_metrics["viewer"]["symbols"]),
            "pdfVerification": True,
            "review": "The immutable one-page EN PDF shows one white die after WHITE and before 6. No duplicate or orphan target is visible.",
        },
        "movementUndoRedoCancel": "passed; sourceAppearanceKey preserved, movement changed the target bbox, undo/redo restored expected states, Cancel left zero records, restored the source appearance, and issued zero API requests at checkpoint.",
        "nativeMask": {
            "collateralChangedPixelsOutsideMask": 0,
            "imageXrefsPreserved": True,
        },
        "separatePageFinding": {
            "id": PURPLE_OUTLIER_ID,
            "status": "confirmed and unresolved",
            "bboxIntersectionAreaPt2": collision_area,
            "collisionMetric": "Intersection of axis-aligned vector and text bounding boxes; not exact ink area.",
            "evidence": rel(purple_evidence),
            "pageLevelPassAsserted": False,
        },
        "independentReview": {
            "reviewer": "review_dice_families",
            "status": "candidate READY recommended; p.67 PASS withheld",
            "finding": "Target identity, slot, ghost absence, and duplicate absence are supported. Adjacent purple die collides with the reflowed 6.",
        },
        "pageLevelPassAsserted": False,
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
    }
    visual_review_path = review_dir / "visual-review.json"
    write_immutable(visual_review_path, json_bytes(visual_review))

    closeout = {
        "schemaVersion": 1,
        "status": "one existing p.67 dice.white candidate promoted to READY; no page-level PASS",
        "candidateId": CANDIDATE_ID,
        "sourcePdfSha256": SOURCE_SHA256,
        "candidateInputSha256": sha256(candidate_input_path),
        "sourcePositionSnapshotSha256": sha256(original_snapshot_path),
        "emptyPositionSnapshotSha256": sha256(empty_snapshot_path),
        "isolatedReinsertedPdfSha256": sha256(TARGET_ROOT / "p067-en-mask-v1.pdf"),
        "isolatedEmptyPdfSha256": sha256(TARGET_ROOT / "empty-position-en-mask-v1.pdf"),
        "sourceSlot": "WHITE | dice.white | 6",
        "sourceLineHeight": translation["data"]["lineHeight"],
        "normalizedSnapshotKey": translation["spanKey"],
        "sourceTargetOccurrences": len(source_symbols),
        "emptyOverrideTargetOccurrences": len(count_target_symbols(empty_snapshot)),
        "movement": movement,
        "cancel": cancel,
        "mask": {
            "oldSha256": candidate_input["originalMaskSha256"],
            "replacementSha256": EXPECTED_CLEAN_MASK_SHA256,
            "collateralChangedPixelsOutsideMask": 0,
            "imageXrefsPreserved": True,
        },
        "export": {
            "immutableSnapshots": True,
            "editedSnapshotTextSymbolOrderVerified": 1,
            "reinsertionPdfVerification": True,
            "emptyPdfVerification": True,
            "pageCount": 1,
            "language": "en",
            "targetVectorPaintCountReinserted": len(rein_target_drawings),
            "targetVectorPaintCountEmpty": len(empty_target_drawings),
        },
        "separatePageFinding": purple_outlier,
        "evidence": {
            "visualReview": rel(visual_review_path),
            "sameScaleSourceReinsertEmptyCrop": rel(TARGET_ROOT / "capture/p067-source-vs-reinserted-vs-empty-crop-v1.png"),
            "fullReinsertedPdfPage": rel(TARGET_ROOT / "capture/p067-reinserted-pdf-page-v1.png"),
            "fullEmptyPdfPage": rel(TARGET_ROOT / "capture/p067-empty-pdf-page-v1.png"),
            "purpleDieCollision": rel(purple_evidence),
            "reinsertedPdf": rel(TARGET_ROOT / "p067-en-mask-v1.pdf"),
            "emptyPdf": rel(TARGET_ROOT / "empty-position-en-mask-v1.pdf"),
        },
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "pageLevelPassAsserted": False,
    }
    closeout_path = review_dir / "p067-v155-family-closeout-v1.json"
    write_immutable(closeout_path, json_bytes(closeout))

    updated = copy.deepcopy(prior)
    updated["scope"] = "v14: the same frozen 111 placements only; one existing p.67 placement gained candidate-specific proof; a second separate p.67 source-vector collision was quantified; no canonical activation."
    updated["generatedAt"] = "2026-10-14"
    summary = updated["summary"]
    summary["candidateScopePlacementPromotionsThisLedger"] = [CANDIDATE_ID]
    summary["candidateScopePlacementPromotionsInV14"] = [CANDIDATE_ID]
    summary["sourceIdentityAndSlotConfirmed"] += 1
    summary["technicallyReadyAndVisuallyValidated"] += 1
    summary["technicallyPending"] -= 1
    summary["confirmedOutliersOutside111"] += 1
    summary["pageLevelStructuralPassWithheld"] = sorted(set(summary["pageLevelStructuralPassWithheld"]) | {67})
    summary["pageLevelStructuralFindings"].append({
        "page": 67,
        "classification": "second confirmed collision from a preserved purple source vector against reflowed text; outside frozen 111; ownership unresolved",
        "finding": (
            f"The static purple die at {purple_rect} pt overlaps the reflowed token {rein_word!r} at {rein_word_box} pt "
            f"by {collision_area:.4f} pt² of axis-aligned bounding-box intersection in the isolated reinsertion PDF "
            f"(not exact glyph-ink area). In the separate empty override, the token "
            f"moves to {empty_word_box} pt and clears the vector. The white-die candidate {CANDIDATE_ID} is ready only "
            "in candidate scope; this second purple source vector remains unresolved and blocks page-level PASS."
        ),
        "blocksPageLevelPass": True,
        "evidence": rel(purple_evidence),
        "outlierReport": rel(purple_outlier_path),
    })
    summary.pop("p067PendingFamilyProofCount", None)
    summary.pop("p067PendingFamilyProofCandidateIds", None)
    summary["p067CandidateLevelVisualReviewCount"] = 2
    summary["p067CandidateLevelVisualReviewCandidateIds"] = ["p067-v99-102-n4", CANDIDATE_ID]
    summary["p067CandidateLevelVisualReviewPassed"] = True
    summary["p067PageLevelStructuralPassAsserted"] = False
    updated["pageLevelOutliersOutside111"].append(purple_outlier)
    summary["confirmedOutliersOutside111"] = len(updated["pageLevelOutliersOutside111"])

    promoted = next(item for item in updated["placements"] if item["candidateId"] == CANDIDATE_ID)
    promoted["status"] = "READY"
    promoted["identityAndSlotConfirmed"] = True
    promoted["visualStatus"] = "technical-visual-validation-passed-with-neighbor-outlier-open"
    promoted["statusOrigin"] = "candidate-specific source-position, empty-override PDF and movement proof; independent visual review; v14 promotion"
    promoted["reason"] = (
        "Promoted from PENDING after the exact native-vector mask changed zero pixels outside its area and preserved image xrefs; "
        "the normalized immutable EN source-position snapshot retains one dice.white with the expected sourceAppearanceKey in "
        "WHITE | dice.white | 6 and derived source lineHeight 1.199786376953125. The aligned empty-state crop and separate empty PDF "
        "show the slot cleared; the reinserted one-page EN PDF contains vector paint at the source slot and passes PDF verification. "
        "Movement, undo/redo and Cancel passed. A separate fixed purple die overlaps the reflowed numeral 6 in the reinsertion PDF; "
        "it remains outside this white-die patch and blocks p.67 page-level PASS. Candidate-level READY only."
    )
    promoted["newProof"] = {
        "candidateInput": rel(candidate_input_path),
        "sourcePositionSnapshot": rel(original_snapshot_path),
        "emptyPositionSnapshot": rel(empty_snapshot_path),
        "isolatedReinsertedPdf": rel(TARGET_ROOT / "p067-en-mask-v1.pdf"),
        "isolatedEmptyPdf": rel(TARGET_ROOT / "empty-position-en-mask-v1.pdf"),
        "proofReport": rel(PROOF_ROOT / "proof-report.json"),
        "exportLog": rel(TARGET_ROOT / "export.log"),
        "emptyExportLog": rel(TARGET_ROOT / "empty-export.log"),
        "movement": rel(TARGET_ROOT / "movement.json"),
        "cancel": rel(TARGET_ROOT / "cancel-check.json"),
        "visualReview": rel(visual_review_path),
        "familyCloseout": rel(closeout_path),
    }
    promoted["candidateVisualReview"] = {
        "reviewer": "root plus independent read-only review_dice_families",
        "status": "candidate READY; separate p.67 purple-vector collision remains open",
        "evidence": closeout["evidence"],
        "pageLevelPassAsserted": False,
    }

    counts = Counter(item["status"] for item in updated["placements"])
    assert counts == Counter({"READY": 77, "AESTHETIC_APPROVAL_PENDING": 3, "PENDING": 13, "BLOCKED": 18})
    assert sum(item["identityAndSlotConfirmed"] for item in updated["placements"]) == 80
    assert len({item["candidateId"] for item in updated["placements"]}) == 111
    assert summary["canonicalPlacementsApplied"] == 0
    assert summary["specialCompositionCasesExcluded"] == 6
    assert summary["confirmedOutliersOutside111"] == 5
    assert summary["pageLevelStructuralPassWithheld"] == [45, 64, 65, 67, 68, 102]
    updated["verification"]["p067V155CandidateProof"] = {
        "status": "candidate_ready_page_pass_withheld",
        "proofReport": rel(PROOF_ROOT / "proof-report.json"),
        "visualReview": rel(visual_review_path),
        "familyCloseout": rel(closeout_path),
        "purpleOutlierReport": rel(purple_outlier_path),
        "applicationTestsRerun": False,
        "reasonTestsNotRerun": "This proof-only slice changed no application code.",
    }

    json_path = OUTPUT / "readiness-ledger-v14.json"
    csv_path = OUTPUT / "readiness-ledger-v14.csv"
    markdown_path = OUTPUT / "readiness-ledger-v14.md"
    write_immutable(json_path, json_bytes(updated))
    fields = [
        "candidateId", "page", "symbolId", "status", "identityAndSlotConfirmed",
        "isolatedPatchPrepared", "appliedInDryRunSimulation", "canonicalApplied",
        "visualStatus", "statusOrigin", "reason",
    ]
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for item in updated["placements"]:
        writer.writerow({key: item.get(key, "") for key in fields})
    write_immutable(csv_path, buffer.getvalue().encode("utf-8"))

    markdown = f"""# MIDDARA — Ledger de prontidão para tradução (v14)

Atualizado em 2026-10-14. Parte do v13 e preserva os mesmos 111 placements. Não grava no canônico.

## Estado

- **{summary['technicallyReadyAndVisuallyValidated']} READY** no escopo individual dos candidatos.
- **{summary['aestheticApprovalPending']} aguardando aceite estético humano** (p.92; textura sintética aproximada, não recuperação exata da arte).
- **{summary['technicallyPending']} pendentes** de evidência própria.
- **{summary['evidenceBlockedWithin111']} bloqueados** dentro dos 111.
- **{summary['sourceIdentityAndSlotConfirmed']}** com identidade e slot confirmados.
- Total congelado: **{summary['totalPreparedPlacements']}**; seis composições especiais continuam separadas e bloqueadas.
- Outliers confirmados fora dos 111: **{summary['confirmedOutliersOutside111']}**. Nenhum foi incorporado silenciosamente aos placements.

## p.67 — dado branco v155

`{CANDIDATE_ID}` já existia como PENDING dentro dos 111; agora está READY apenas no escopo individual. Identidade `dice.white`, slot `WHITE | dice.white | 6`, chave proprietária normalizada `page_67_block_13`, idioma `en`, uma ocorrência fonte e `lineHeight` derivado **1.199786376953125**.

A máscara limpa `{EXPECTED_CLEAN_MASK_SHA256}` removeu os desenhos-fonte 155–158, alterou zero pixels fora da área e preservou os image xrefs. No PDF de reinserção há pintura vetorial do dado entre WHITE e 6. O snapshot de estado vazio e o PDF separado não têm o alvo semântico nem desenho vetorial no slot. O par de PDFs isolados passou `pdfVerification`; movimento, undo/redo e Cancel também passaram. Cancel deixou zero registros e nenhuma chamada à API.

![Comparação no mesmo recorte: fonte, PDF com reinserção e estado vazio]({output_rel(TARGET_ROOT / 'capture/p067-source-vs-reinserted-vs-empty-crop-v1.png')})

## Pendência estrutural da p.67

O dado roxo fixo dos desenhos 159–162 colide com o token `6,` refluído no PDF de reinserção: a interseção das caixas delimitadoras alinhadas pelos eixos mede **{collision_area:.4f} pt²**; isso não mede a área exata da tinta dos glifos. Na fonte, o token está fora do dado; no PDF vazio ele também fica fora, pois a linha reflowa sem o dado branco. A colisão permanece aberta e impede PASS estrutural da página. Não foi criada solução ou identidade semântica para esse vetor.

![Fonte, reinserção e estado vazio: colisão do dado roxo com o 6 na reinserção]({output_rel(purple_evidence)})

## Histórico e testes

Esta prova não altera o total preparado, não sobrescreve Payload, sidecars canônicos ou traduções humanas, e não muda as seis composições bloqueadas. A suíte não foi repetida porque não houve alteração de aplicação. Último resultado registrado: Web serial **203 aprovados, 2 ignorados e 0 falhas**, incluindo p.41 aprovado nessa execução serial; build web e TypeScript passaram com avisos. Admin integration **18/18**. Admin E2E não executou nesta rodada de tooling; lint e suíte total permanecem sem aprovação completa. Veja [resumo dos testes](native-vector-mask-p065-pending-proof-v2/final-review/test-summary-v1.json).

Arquivos reproduzíveis: [script de fechamento](../../../scripts/finalize_p067_v155_pending_candidate_v14.py), [JSON](readiness-ledger-v14.json), [CSV](readiness-ledger-v14.csv), [revisão visual](native-vector-mask-p067-v155-pending-proof-v1/final-review-v14/visual-review.json), [fechamento](native-vector-mask-p067-v155-pending-proof-v1/final-review-v14/p067-v155-family-closeout-v1.json), [relatório do outlier roxo](native-vector-mask-p067-v155-pending-proof-v1/final-review-v14/p067-static-purple-die-2-outlier.json).
"""
    write_immutable(markdown_path, markdown.encode("utf-8"))

    print(json.dumps({
        "promoted": CANDIDATE_ID,
        "counts": {key: summary[key] for key in (
            "technicallyReadyAndVisuallyValidated", "aestheticApprovalPending", "technicallyPending",
            "evidenceBlockedWithin111", "sourceIdentityAndSlotConfirmed", "totalPreparedPlacements",
            "confirmedOutliersOutside111", "pageLevelStructuralPassWithheld",
        )},
        "purpleBboxIntersectionAreaPt2": collision_area,
        "ledger": rel(json_path),
        "closeout": rel(closeout_path),
        "outlier": rel(purple_outlier_path),
        "canonicalPayloadTranslationWrites": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
