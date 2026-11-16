#!/usr/bin/env python3
"""Reconcile the frozen 111-placement inventory with candidate-specific proofs."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIVATION = ROOT / "output/proofs/symbol-activation-2026-10-13"
V2_CSV = ACTIVATION / "activation-v2/placement-status.csv"
FAMILY_JSON = ACTIVATION / "batch-95/family-closeout-2026-10-14.json"
REPORT_MD = ACTIVATION / "activation-report.md"
PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-v10"
PROOF_REPORT = PROOF_ROOT / "proof-report.json"
VISUAL_REVIEW = PROOF_ROOT / "visual-review.json"
P55_PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p055-proof-v3"
P55_PROOF_REPORT = P55_PROOF_ROOT / "proof-report.json"
P55_VISUAL_REVIEW = P55_PROOF_ROOT / "visual-review.json"
P55_V2_PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p055-proof-v4"
P55_V2_PROOF_REPORT = P55_V2_PROOF_ROOT / "proof-report.json"
P55_V2_VISUAL_REVIEW = P55_V2_PROOF_ROOT / "visual-review.json"
P65_PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p065-proof-v6"
P65_PROOF_REPORT = P65_PROOF_ROOT / "proof-report.json"
P65_VISUAL_REVIEW = P65_PROOF_ROOT / "visual-review.json"
P65_G_OUTLIER = P65_PROOF_ROOT / "p065-g-marker-outlier.json"
P68_PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p068-proof-v5"
P68_PROOF_REPORT = P68_PROOF_ROOT / "proof-report.json"
P68_VISUAL_REVIEW = P68_PROOF_ROOT / "visual-review.json"
P68_BLACK_DIE_OUTLIER = P68_PROOF_ROOT / "p068-black-die-outlier.json"
P45_V142_PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p045-v142-proof-v3"
P45_V142_PROOF_REPORT = P45_V142_PROOF_ROOT / "proof-report.json"
P45_V142_VISUAL_REVIEW = P45_V142_PROOF_ROOT / "visual-review.json"
P64_V201_PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p064-proof-v3"
P64_V201_PROOF_REPORT = P64_V201_PROOF_ROOT / "proof-report.json"
P64_V201_VISUAL_REVIEW = P64_V201_PROOF_ROOT / "visual-review.json"
OUTPUT_DIR = ROOT / "output/proofs/translation-readiness-2026-10-14"
SOURCE_POSITION_REPROOF_REPORT = OUTPUT_DIR / "source-position-reproof-v1/source-position-reproof-report-v1.json"
P102_REPROOF_ROOT = OUTPUT_DIR / "source-position-reproof-p102-v1"
P102_REPROOF_REPORT = P102_REPROOF_ROOT / "p102-family-reproof-report-v1.json"
P102_VISUAL_REVIEW = P102_REPROOF_ROOT / "visual-review.json"
P102_READY = {"p102-v418-421-n4", "p102-v422-425-n4", "p102-v426-429-n4"}
SPECIAL_CASES = [
    "p028-v134-136-n3",
    "p028-v137",
    "p030-v116-117-n2",
    "p072-v605",
    "p072-v609",
    "p085-v277-278-n2",
]
PROMOTIONS = {
    "p045-v134-137-n4",
    "p054-v185-188-n4",
    "p084-v185",
    "p055-v94-96-n3",
    "p055-v97",
    "p055-v89-91-n3",
    "p055-v92-93-n2",
    "p065-v110-112-n3",
    "p065-v115",
    "p068-v113-114-n2",
    "p045-v142-145-n4",
    "p064-v201-204-n4",
}
DISPOSABLE_XREF_LIMITATIONS = {"p084-v185", "p055-v94-96-n3", "p055-v97", "p055-v89-91-n3", "p055-v92-93-n2"}
PROOF_GROUPS = {
    "v10": {
        "root": PROOF_ROOT,
        "report": PROOF_REPORT,
        "review": VISUAL_REVIEW,
        "candidateIds": {"p045-v134-137-n4", "p054-v185-188-n4", "p084-v185"},
    },
    "p055-v3": {
        "root": P55_PROOF_ROOT,
        "report": P55_PROOF_REPORT,
        "review": P55_VISUAL_REVIEW,
        "candidateIds": {"p055-v94-96-n3", "p055-v97"},
    },
    "p055-v4": {
        "root": P55_V2_PROOF_ROOT,
        "report": P55_V2_PROOF_REPORT,
        "review": P55_V2_VISUAL_REVIEW,
        "candidateIds": {"p055-v89-91-n3", "p055-v92-93-n2"},
    },
    "p065-v6": {
        "root": P65_PROOF_ROOT,
        "report": P65_PROOF_REPORT,
        "review": P65_VISUAL_REVIEW,
        "candidateIds": {"p065-v110-112-n3", "p065-v115"},
    },
    "p068-v5": {
        "root": P68_PROOF_ROOT,
        "report": P68_PROOF_REPORT,
        "review": P68_VISUAL_REVIEW,
        "candidateIds": {"p068-v113-114-n2"},
    },
    "p045-v142-v3": {
        "root": P45_V142_PROOF_ROOT,
        "report": P45_V142_PROOF_REPORT,
        "review": P45_V142_VISUAL_REVIEW,
        "candidateIds": {"p045-v142-145-n4"},
    },
    "p064-v201-v3": {
        "root": P64_V201_PROOF_ROOT,
        "report": P64_V201_PROOF_REPORT,
        "review": P64_V201_VISUAL_REVIEW,
        "candidateIds": {"p064-v201-204-n4"},
    },
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def source_position_proof(
    candidate_id: str,
    candidate_report: dict,
    proof_root: Path,
    proof_report_path: Path,
    visual_review_path: Path,
    reviewed: dict,
) -> dict:
    folder = proof_root / candidate_id
    input_data = read_json(folder / "candidate-input.json")
    source_slot = read_json(folder / "source-slot.json")
    movement = read_json(folder / "movement.json")
    cancel = read_json(folder / "cancel-check.json")
    snapshot = read_json(folder / "snapshot/snapshot.json")
    pdf_path = Path(candidate_report["pdfPath"])
    page_dir = ROOT / "output/proofs/full-symbol-integrity-2026-10-13/patches/pages" / f"page_{int(input_data['page']):03d}"
    original_mask_path = page_dir / Path(input_data["mask"]["url"]).name

    assert candidate_report["apiRequests"] == 0
    assert candidate_report["collateralChangedPixelsOutsideMask"] == 0
    if candidate_report["imageXrefsPreserved"] is False:
        assert candidate_id in DISPOSABLE_XREF_LIMITATIONS
        assert candidate_report["collateralChangedPixelsOutsideMask"] == 0
        assert reviewed["checks"]["sourcePdfWrittenOrModified"] is False
        assert reviewed["checks"]["imageXrefsPreservedInDisposableExperiment"] is False
        assert reviewed["checks"]["neighboringContentUncovered"] is True
        if candidate_id.startswith("p055-"):
            assert reviewed["checks"]["targetMaskDisjointFromChangedXrefBounds"] is True
    else:
        assert candidate_report["imageXrefsPreserved"] is True
    assert candidate_report["sourcePdfSha256"] == read_json(proof_report_path)["sourcePdfSha256"]
    assert candidate_report["replacementMaskSha256"] == sha256(folder / "native-vector-clean-mask.png")
    assert candidate_report["originalMaskSha256"] == input_data["originalMaskSha256"]
    assert candidate_report["originalMaskSha256"] == sha256(original_mask_path)
    assert cancel["recordsAfterCancel"] == 0
    assert cancel["sourceAppearanceRestored"] is True
    assert cancel["apiRequestsAtCheckpoint"] == 0
    if candidate_id == "p068-v113-114-n2":
        assert cancel["originalEnPageTextRestoredExactly"] is True
        assert cancel["englishSentenceIntact"] is True
    assert movement["undoRestored"] is True and movement["redoRestored"] is True
    assert movement["sourceAliasCount"] >= 1
    assert Counter(movement["originalSymbolKeys"]) == Counter(movement["movedSymbolKeys"])
    assert movement["targetSourceAppearanceKey"] == input_data["metrics"]["sourceAppearanceKey"]
    assert source_slot["expectedLeftContext"] in source_slot["precedingText"]
    assert source_slot["expectedRightContext"] in source_slot["followingText"]
    assert reviewed["status"].startswith("technical-ready")
    assert snapshot["verifyRenderedSnapshot"] is True
    assert all(not x["spanKey"].endswith("__en") for x in snapshot["translations"])
    target_segments = [
        segment
        for translation in snapshot["translations"]
        for segment in translation["data"]["segments"]
        if segment.get("symbolId") == input_data["symbolId"]
        and segment.get("symbolMetrics", {}).get("sourceAppearanceKey") == input_data["metrics"]["sourceAppearanceKey"]
    ]
    assert len(target_segments) == 1
    assert pdf_path.exists() and pdf_path.stat().st_size > 0
    return {
        "proofReport": str(proof_report_path.relative_to(ROOT)).replace("\\", "/"),
        "visualReview": str(visual_review_path.relative_to(ROOT)).replace("\\", "/"),
        "candidateInput": str((folder / "candidate-input.json").relative_to(ROOT)).replace("\\", "/"),
        "sourceSlot": str((folder / "source-slot.json").relative_to(ROOT)).replace("\\", "/"),
        "emptyViewer": str(Path(candidate_report["emptyCapture"]).relative_to(ROOT)).replace("\\", "/"),
        "movedViewer": str(Path(candidate_report["movedCapture"]).relative_to(ROOT)).replace("\\", "/"),
        "isolatedPdf": str(pdf_path.relative_to(ROOT)).replace("\\", "/"),
        "pdfSha256": sha256(pdf_path),
        "cancelCheck": str(Path(candidate_report["cancelCheck"]).relative_to(ROOT)).replace("\\", "/"),
        "imageXrefsPreserved": candidate_report["imageXrefsPreserved"],
        "collateralChangedPixelsOutsideMask": 0,
        "reviewStatus": reviewed["status"],
        "reviewNote": reviewed["isolatedPdf"],
        "patchOverlay": reviewed.get("patchOverlay"),
        "overlayDryRun": reviewed.get("overlayDryRun"),
        "experimentLimitation": reviewed.get("limitation", ""),
    }


def main() -> None:
    v2 = list(csv.DictReader(V2_CSV.open(encoding="utf-8-sig", newline="")))
    family = read_json(FAMILY_JSON)
    source_position_reproof = read_json(SOURCE_POSITION_REPROOF_REPORT)
    assert source_position_reproof["status"] == "passed"
    assert source_position_reproof["candidateCount"] == 13
    assert source_position_reproof["statusChanges"] == 0
    source_position_by_id = {x["candidateId"]: x for x in source_position_reproof["placements"]}
    assert len(source_position_by_id) == 13
    p102_reproof = read_json(P102_REPROOF_REPORT)
    p102_visual_review = read_json(P102_VISUAL_REVIEW)
    assert p102_reproof["status"] == "candidate-level-visual-review-passed"
    assert p102_reproof["candidateCount"] == 3 and p102_reproof["statusPromotions"] == sorted(P102_READY)
    assert p102_reproof["manualVisualReviewRequired"] is False
    assert p102_reproof["visualReviewSha256"] == sha256(P102_VISUAL_REVIEW)
    assert p102_reproof["canonicalPayloadOrHumanTranslationWrites"] == 0
    assert p102_reproof["apiRequests"] == 0 and p102_reproof["sourceFallbackDetected"] is False
    assert p102_visual_review["pageLevelPassAsserted"] is False
    assert p102_visual_review["canonicalWrites"] == p102_visual_review["payloadWrites"] == p102_visual_review["translationWrites"] == p102_visual_review["apiRequests"] == 0
    p102_report_by_id = {x["candidateId"]: x for x in p102_reproof["placements"]}
    p102_review_by_id = {x["candidateId"]: x for x in p102_visual_review["targets"]}
    assert set(p102_report_by_id) == set(p102_review_by_id) == P102_READY
    assert all(x["priorLedgerStatus"] == "PENDING" and x["statusPromotion"] is True and x["finalLedgerStatus"] == "READY" for x in p102_report_by_id.values())
    assert all(x["sourceFallbackDetected"] is False and x["exporterPdfVerification"] is True and x["targetAppearanceCountInSnapshot"] == 1 for x in p102_report_by_id.values())
    assert all(x["checks"]["targetAppearsOnceInOriginalSlot"] is True and x["checks"]["emptyStateNoTargetGhost"] is True and x["checks"]["neighboringContentCovered"] is False and x["checks"]["visibleCollisionOrPageDisplacement"] is False for x in p102_review_by_id.values())
    proof_by_id = {}
    review_by_id = {}
    group_by_id = {}
    source_hashes = {}
    for group_name, group in PROOF_GROUPS.items():
        proof = read_json(group["report"])
        review = read_json(group["review"])
        assert proof["canonicalWrites"] == proof["payloadWrites"] == proof["translationWrites"] == proof["apiRequests"] == 0
        assert review["canonicalWrites"] == review["payloadWrites"] == review["translationWrites"] == review["apiRequests"] == 0
        proof_candidates = {x["candidateId"]: x for x in proof["candidates"]}
        review_targets = {x["candidateId"]: x for x in review["targets"]}
        assert set(proof_candidates) == set(review_targets) == group["candidateIds"]
        for candidate_id in group["candidateIds"]:
            proof_by_id[candidate_id] = proof_candidates[candidate_id]
            review_by_id[candidate_id] = review_targets[candidate_id]
            group_by_id[candidate_id] = group
        source_hashes[f"{group_name}ProofReportSha256"] = sha256(group["report"])
        source_hashes[f"{group_name}VisualReviewSha256"] = sha256(group["review"])
    assert len(v2) == 111 and len({x["candidateId"] for x in v2}) == 111
    assert len(family["placements"]) == 95
    assert len({x["candidateId"] for x in family["placements"]}) == 95
    assert family["separateSpecialCompositionBlocked"] == 6
    assert set(proof_by_id) == set(review_by_id) == set(group_by_id) == PROMOTIONS
    p68_outlier = read_json(P68_BLACK_DIE_OUTLIER)
    assert p68_outlier["classification"] == "confirmed export collision outside frozen 111 placement IDs"
    assert p68_outlier["notPartOfPrepared111"] is True
    assert p68_outlier["remediated"] is False
    assert p68_outlier["blocksPageLevelStructuralPass"] is True
    assert p68_outlier["sourcePdfWrittenOrModified"] is False

    by_family = {x["candidateId"]: x for x in family["placements"]}
    pending_csv_ids = {x["candidateId"] for x in v2 if x["applicationState"] == "PENDING_EVIDENCE"}
    assert pending_csv_ids == set(by_family)

    # The prior activation report names the six composition-only candidates outside the 111 patches.
    report_text = REPORT_MD.read_text(encoding="utf-8")
    assert all(candidate_id in report_text for candidate_id in SPECIAL_CASES)

    rows = []
    for row in v2:
        candidate_id = row["candidateId"]
        source = by_family.get(candidate_id)
        if candidate_id in P102_READY:
            proof = p102_report_by_id[candidate_id]
            reviewed = p102_review_by_id[candidate_id]
            state = "READY"
            reason = (
                f"Independent candidate-level visual review confirmed {proof['symbolId']} in its original p.102 slot; "
                "the empty state has no target ghost, the target appears once, neighboring rows remain visible, Cancel restores the source, "
                "and the immutable EN PDF export passed verification without source fallback. This is not a page-level structural PASS."
            )
            status_origin = "source-position-reproof-p102-v1 plus independent candidate-level visual review"
            proof_refs = {
                "proofReport": str(P102_REPROOF_REPORT.relative_to(ROOT)).replace("\\", "/"),
                "visualReview": str(P102_VISUAL_REVIEW.relative_to(ROOT)).replace("\\", "/"),
                "isolatedPdf": reviewed["isolatedPdf"],
                "isolatedPdfSha256": reviewed["isolatedPdfSha256"],
                "comparisonImage": p102_reproof["comparisonImage"],
                "fullPageComparison": p102_reproof["fullPageComparison"],
                "uiStateComparison": p102_reproof["uiStateComparison"],
            }
        elif candidate_id in PROMOTIONS:
            group = group_by_id[candidate_id]
            proof_refs = source_position_proof(
                candidate_id,
                proof_by_id[candidate_id],
                group["root"],
                group["report"],
                group["review"],
                review_by_id[candidate_id],
            )
            state = "READY"
            reason = "Source-vector cleanup has zero rendered collateral outside the mask; the original semantic slot, empty/moved Viewer states and source-position isolated PDF were reviewed."
            if candidate_id == "p084-v185":
                reason += " The disposable in-memory experiment changed two unrelated image XObject identifiers but rendered zero collateral pixels; the source PDF was never written, and this limitation is recorded."
            if candidate_id in {"p055-v94-96-n3", "p055-v97"}:
                reason += " The disposable in-memory experiment converted nine unrelated image XObjects to inline images; their bboxes are disjoint from this target and rendered zero collateral pixels. The source PDF was never written."
            if candidate_id in {"p055-v89-91-n3", "p055-v92-93-n2"}:
                reason += " The v2 disposable experiment reported an xref-identity change, while an independent read-only replay preserved xrefs; both runs used the pinned source PDF and the rendered diff outside the target mask is zero. The prior p.55 xref bounds are disjoint from these masks. This metadata discrepancy is recorded; the source PDF was never written and the isolated exports use only target cleanup crops."
            if candidate_id in {"p065-v110-112-n3", "p065-v115"}:
                reason += " Candidate-specific checks pass, but this is not a page-level p.65 pass: the separate boxed G marker is misaligned in export and is recorded as an outlier outside the frozen 111 IDs."
            if candidate_id == "p068-v113-114-n2":
                reason += " The candidate-specific p.68 proof used an exact native-vector cleanup crop: 310 changed pixels were confined to the registered mask, zero changed outside it, and image xrefs were preserved. Empty/moved states, undo/redo, Cancel with exact EN text restoration, the normalized EN span key, and the one-page source-position PDF were checked. A serialized empty EN override then exposed the separate static black-die collision recorded outside the frozen 111 IDs; this placement remains READY in its own scope, while p.68 has no page-level structural PASS."
            if candidate_id == "p045-v142-145-n4":
                reason += " The target-only crop was rebuilt from the four registered source vectors; zero rendered pixels changed outside its mask and image xrefs were preserved. The source slot WHITE → dice.white → '. She adds the numbers', Viewer empty/moved states, undo/redo, Cancel with zero residual records, and the one-page source-position PDF were verified. A versioned page overlay changes only the target mask asset; its candidate dry-run is idempotent and rollback restores the base tree. The original full 111 package remains unchanged. This promotes only this placement; no page-level p.45 PASS is asserted."
            if candidate_id == "p064-v201-204-n4":
                reason += " The mask crop was rebuilt from only source vectors 201–204; zero raster pixels changed outside the registered mask and image xrefs were preserved. The source slot BLACK → dice.black → 'to its Combat Dice Pool' was verified in the Viewer and one-page isolated PDF. The proof serializes the source-derived 1.2 line height (the earlier p.64 trials used 1.0 and are superseded); the exported symbol geometry differs from the source by at most 0.377 pt and adjacent text baselines by at most 1.421 pt. Empty/moved, undo/redo, Cancel, normalized EN snapshot key, and zero API/canonical writes passed. No patch edge is visible at 100%; a thin tonal boundary is visible only in the 10x crop. A candidate overlay changes only this mask asset; its dry-run is idempotent and rollback restores the base tree. The other p.64 placements remain unreviewed, so no page-level PASS is asserted."
            status_origin = f"{group['root'].name} candidate-specific proof plus visual review"
        elif row["applicationState"] in {"READY", "READY_FOR_APPLICATION"}:
            proof_refs = {}
            state = "READY"
            reason = row.get("blockReason", "")
            status_origin = "activation-v2 record"
        elif row["applicationState"] == "PENDING_AESTHETIC_APPROVAL":
            proof_refs = {}
            state = "AESTHETIC_APPROVAL_PENDING"
            reason = row.get("blockReason", "Human aesthetic approval required.")
            status_origin = "activation-v2 record"
        else:
            assert source is not None
            proof_refs = {}
            state = source["status"].upper()
            reason = source.get("reason", "")
            status_origin = "batch-95 family closeout"
        if source:
            evidence = source.get("evidence", {})
            if not reason:
                reason = source.get("reason", "")
        else:
            evidence = {}

        source_position_reproof_row = source_position_by_id.get(candidate_id)
        if source_position_reproof_row:
            assert state == "READY", candidate_id
            reason += (
                " Source-position PDF evidence was regenerated after the harness began saving the original snapshot before movement; "
                "the movement-test snapshot is now separate. The normalized EN key, source appearance, immutable snapshot consumption, "
                "export verification, and original-position PDF were checked. This is revalidation of an existing READY placement, not a new promotion."
            )
            status_origin = "existing READY record revalidated by source-position-reproof-v1"

        rows.append({
            "candidateId": candidate_id,
            "page": int(row["page"]),
            "symbolId": row["symbolId"],
            "status": state,
            "identityAndSlotConfirmed": state in {"READY", "AESTHETIC_APPROVAL_PENDING"},
            "isolatedPatchPrepared": True,
            "appliedInDryRunSimulation": True,
            "canonicalApplied": False,
            "visualStatus": "candidate-scope-technical-validation-passed-page-outlier-present"
            if candidate_id in {"p065-v110-112-n3", "p065-v115", "p068-v113-114-n2"} and state == "READY"
            else "candidate-scope-technical-validation-passed-page-level-not-asserted"
            if candidate_id in {"p045-v142-145-n4", *P102_READY} and state == "READY"
            else {
                "READY": "technical-visual-validation-passed",
                "AESTHETIC_APPROVAL_PENDING": "technical-render-proof-present-aesthetic-approval-pending",
                "PENDING": "evidence-incomplete",
                "BLOCKED": "blocked-pending-safe-resolution",
            }[state],
            "statusOrigin": status_origin,
            "reason": reason,
            "priorApplicationState": row["applicationState"],
            "evidence": evidence,
            "newProof": proof_refs,
            "sourcePositionReproof": source_position_reproof_row,
            "p102FamilyReproof": p102_report_by_id.get(candidate_id),
            "candidateVisualReview": p102_review_by_id.get(candidate_id),
        })

    counts = Counter(row["status"] for row in rows)
    expected = {"READY": 72, "AESTHETIC_APPROVAL_PENDING": 3, "PENDING": 18, "BLOCKED": 18}
    assert dict(counts) == expected, dict(counts)
    assert sum(counts.values()) == 111

    csv_bytes = V2_CSV.read_bytes()
    family_bytes = FAMILY_JSON.read_bytes()
    activation_report = read_json(ACTIVATION / "activation-v2/final-checklist.json")
    summary = {
        "unmatchedSourceGlyphCandidatesDetected": 116,
        "initialPlacementCandidates": 80,
        "reconciledPlacementCandidates": 37,
        "potentialPlacementsAfterReconciliation": 117,
        "specialCompositionCasesExcluded": 6,
        "isolatedPatchPlacementsPrepared": 111,
        "isolatedDryRunPlacementsAppliedThenRolledBack": 111,
        "candidateOverlayDryRuns": 2,
        "canonicalPlacementsApplied": 0,
        "sourceIdentityAndSlotConfirmed": sum(1 for x in rows if x["identityAndSlotConfirmed"]),
        "technicallyReadyAndVisuallyValidated": counts["READY"],
        "aestheticApprovalPending": counts["AESTHETIC_APPROVAL_PENDING"],
        "technicallyPending": counts["PENDING"],
        "evidenceBlockedWithin111": counts["BLOCKED"],
        "totalPreparedPlacements": len(rows),
        "candidateScopePlacementPromotionsThisLedger": sorted(P102_READY),
        "candidateScopePlacementPromotionsInV8": ["p045-v142-145-n4", "p064-v201-204-n4", "p068-v113-114-n2"],
        "candidateScopePlacementPromotionsInV9": sorted(P102_READY),
        "sourcePositionReproofCount": len(source_position_by_id),
        "sourcePositionReproofCandidateIds": sorted(source_position_by_id),
        "sourcePositionReproofsAreNewDiscoveriesOrPromotions": False,
        "p102PendingFamilyProofCount": len(p102_report_by_id),
        "p102PendingFamilyProofCandidateIds": sorted(p102_report_by_id),
        "p102CandidateLevelVisualReviewPassed": True,
        "p102PageLevelStructuralPassAsserted": False,
        "sourcePositionPdfExportFallbacksDetected": 0,
        "confirmedOutliersOutside111": 2,
        "pageLevelStructuralPassWithheld": [45, 64, 65, 68, 102],
        "pageLevelStructuralFindings": [
            {
                "page": 45,
                "classification": "confirmed visual overlap in isolated source-text export; ownership not assigned automatically",
                "finding": "The p045-v142 proof keeps its target white die after WHITE, while two other red Defense Value symbols in the same reflowed paragraph visibly overlap adjacent wording.",
                "blocksPageLevelPass": True,
                "evidence": "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p045-v142-proof-v3/p045-v142-source-vs-isolated-pdf-zoom.png",
            },
            {
                "page": 64,
                "classification": "candidate-scope evidence only; one sibling placement remains pending and page-wide PASS is withheld",
                "finding": "p064-v201-204-n4, p064-v215-217-n3, and p064-v221-223-n3 have candidate-level READY evidence; p064-v205-208-n4 remains pending for a visible mask and text collisions, so the page remains structurally open.",
                "blocksPageLevelPass": True,
                "evidence": "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p064-proof-v3/visual-review.json",
            },
            {
                "page": 65,
                "classification": "confirmed outlier outside frozen 111 placements",
                "finding": "The boxed G marker remains visibly separated from its source vector box in the corrected isolated exports.",
                "blocksPageLevelPass": True,
                "evidence": str(P65_G_OUTLIER.relative_to(ROOT)).replace("\\", "/"),
            },
            {
                "page": 68,
                "classification": "confirmed outlier outside frozen 111 placements",
                "finding": f"The static black die overlaps the reflowed word 'than' by {p68_outlier['emptyOverrideCollision']['intersectionAreaPt2']} pt² in the serialized empty-override PDF.",
                "blocksPageLevelPass": True,
                "evidence": str(P68_BLACK_DIE_OUTLIER.relative_to(ROOT)).replace("\\", "/"),
            },
            {
                "page": 102,
                "classification": "three individual dice placements reviewed; no page-level structural audit asserted",
                "finding": "The three p.102 dice placements are individually READY after source-position PDF and independent visual review. This does not establish that the entire page or its other placements pass structural review.",
                "blocksPageLevelPass": True,
                "evidence": str(P102_REPROOF_REPORT.relative_to(ROOT)).replace("\\", "/"),
            },
        ],
        "idempotentDryRunPreviouslyReported": True,
        "historicalV2FirstActivationDryRunCount": activation_report.get("selectedCount", 13),
    }
    sources = {
        "placementStatusCsvSha256": hashlib.sha256(csv_bytes).hexdigest(),
        "familyCloseoutJsonSha256": hashlib.sha256(family_bytes).hexdigest(),
        "activationReportSha256": sha256(REPORT_MD),
        "p065GMarkerOutlierSha256": sha256(P65_G_OUTLIER),
        "p068BlackDieOutlierSha256": sha256(P68_BLACK_DIE_OUTLIER),
        "p045-v142-v3ProofReportSha256": sha256(P45_V142_PROOF_REPORT),
        "p045-v142-v3VisualReviewSha256": sha256(P45_V142_VISUAL_REVIEW),
        "p068ProofReportSha256": sha256(P68_PROOF_REPORT),
        "p068VisualReviewSha256": sha256(P68_VISUAL_REVIEW),
        "sourcePositionReproofReportSha256": sha256(SOURCE_POSITION_REPROOF_REPORT),
        "p102FamilyReproofReportSha256": sha256(P102_REPROOF_REPORT),
        "p102FamilyVisualReviewSha256": sha256(P102_VISUAL_REVIEW),
        **source_hashes,
        "builderSha256": sha256(Path(__file__)),
    }
    ledger = {
        "schemaVersion": 1,
        "generatedAt": date.today().isoformat(),
        "scope": "Current reconciled status for the existing 111 prepared placement patches; no canonical activation.",
        "summary": summary,
        "verification": {
            "web": {
                "status": "passed_with_skips",
                "command": "node node_modules/vitest/vitest.mjs run --config vitest.config.mts --maxWorkers 1",
                "testFilesPassed": 33,
                "testFilesSkipped": 1,
                "testFilesTotal": 34,
                "testsPassed": 202,
                "testsSkipped": 2,
                "testsFailed": 0,
                "page41Regression": "passed in the serial run after the source-symbol-width regression fix; the historical failure was not reproduced",
                "resourceContentionAttempt": {
                    "passed": 199,
                    "timedOut": 2,
                    "cases": ["FAQ collapse/search", "p.78 source inline geometry"],
                    "resolution": "Both passed in the serial full-suite rerun; the serial run is the recorded result.",
                },
            },
            "adminIntegration": {
                "status": "passed",
                "command": "node node_modules/vitest/vitest.mjs run --config ./vitest.config.mts",
                "testFilesPassed": 3,
                "testsPassed": 18,
                "testsFailed": 0,
                "rerunAfterSourceInlineRendererFix": False,
            },
            "adminE2E": {
                "status": "passed",
                "command": "node node_modules/@playwright/test/cli.js test --config=playwright.config.ts",
                "testsPassed": 4,
                "testsFailed": 0,
                "browser": "Playwright Chromium 1208 installed for the run",
                "temporaryTestUserCountAfterRun": 0,
                "translationRowsWrittenByTests": False,
                "rerunAfterSourceInlineRendererFix": False,
            },
            "typescript": {"status": "passed", "command": "node node_modules/typescript/bin/tsc -b"},
            "webBuild": {
                "status": "passed",
                "command": "node node_modules/vite/bin/vite.js build",
                "modulesTransformed": 2109,
                "warnings": ["/texture.png remains for runtime resolution", "main bundle 1.33 MB", "prepare-out-dir renderStart callback 33.2 s"],
            },
            "webLint": {
                "status": "latest_rerun_pending_cli_unavailable",
                "command": "node_modules/.bin/oxlint.CMD .",
                "errors": 0,
                "warnings": 54,
                "latestRecordedLog": "output/proofs/translation-readiness-2026-10-14/oxlint-after-fix.log",
                "latestRecordedLogScope": "The checked-in working-tree log records 0 errors and 54 warnings, but the oxlint executable is no longer present for a fresh standalone rerun after the source-inline renderer fix.",
                "cliAvailableAtLedgerGeneration": False,
            },
            "adminLint": {
                "status": "tooling_error",
                "command": "node node_modules/eslint/bin/eslint.js .",
                "error": "ESLint 9 config validation threw TypeError: Converting circular structure to JSON while formatting the React plugin configuration.",
            },
            "pnpmTestWrapper": {
                "status": "preflight_blocked",
                "error": "ERR_PNPM_IGNORED_BUILDS for better-sqlite3, esbuild, and unrs-resolver; tests were run through installed local binaries without changing pnpm policy.",
            },
        },
        "reconciliation": {
            "detectorCountIsNotPlacementCount": True,
            "detectorNote": "116 is the number of unmatched source glyph candidates emitted by the detector. It is a different stage and is not a one-to-one count of reconciled placements.",
            "placementArithmetic": "80 initial candidates + 37 reconciled placements = 117 potential placements; 6 composition-only cases are kept separate, leaving 111 isolated patch placements.",
            "confirmationNote": "A source identity/slot is counted confirmed only for READY placements or the three placements awaiting human aesthetic approval. Technical visual readiness excludes those three aesthetic holds.",
            "dryRunNote": "The 111 were applied only to an isolated simulation, which was idempotent and then rolled back. No Payload, canonical sidecar, or human translation write occurred.",
        },
        "specialCompositionBlocked": SPECIAL_CASES,
        "pageLevelOutliersOutside111": [
            {
                "id": "p065-g-boxed-letter",
                "classification": "confirmed export misalignment; outlier outside frozen 111 IDs",
                "report": str(P65_G_OUTLIER.relative_to(ROOT)).replace("\\", "/"),
                "sourceBoxBboxPt": [223.0208, 776.7821, 233.0168, 786.7781],
                "sourceGlyphBboxPt": [224.7628, 777.3441, 230.9868, 786.8801],
                "exportGlyphBboxPt": [222.9727, 770.7168, 231.4154, 778.7118],
                "remediated": False,
                "blocksPageLevelPass": True,
            },
            {
                "id": p68_outlier["id"],
                "classification": p68_outlier["classification"],
                "report": str(P68_BLACK_DIE_OUTLIER.relative_to(ROOT)).replace("\\", "/"),
                "sourceDieBboxPt": p68_outlier["sourceBlackDie"]["bboxPt"],
                "emptyOverrideTextBboxPt": p68_outlier["emptyOverrideCollision"]["textBboxPt"],
                "collisionIntersectionBboxPt": p68_outlier["emptyOverrideCollision"]["intersectionBboxPt"],
                "visualEvidence": p68_outlier["visualEvidence"],
                "remediated": p68_outlier["remediated"],
                "blocksPageLevelPass": p68_outlier["blocksPageLevelStructuralPass"],
            },
        ],
        "sources": sources,
        "placements": rows,
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = OUTPUT_DIR / "readiness-ledger-v10.json"
    csv_path = OUTPUT_DIR / "readiness-ledger-v10.csv"
    md_path = OUTPUT_DIR / "readiness-ledger-v10.md"
    json_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    columns = ["candidateId", "page", "symbolId", "status", "identityAndSlotConfirmed", "isolatedPatchPrepared", "appliedInDryRunSimulation", "canonicalApplied", "visualStatus", "statusOrigin", "reason"]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row[k] for k in columns})

    md = [
        "# MIDDARA — Ledger de prontidão para tradução (v10)",
        "",
        f"Atualizado em {ledger['generatedAt']}. Este ledger reusa os 111 placements existentes e não grava no canônico.",
        "",
        "## Reconciliação das etapas",
        "",
        "| Etapa | Contagem | Significado |",
        "|---|---:|---|",
        "| Candidatos de glifo não correspondidos detectados | 116 | Saída do detector; não equivale a placements. |",
        "| Candidatos iniciais | 80 | Lote de entrada da etapa de reconciliação. |",
        "| Recuperados/reconciliados | 37 | Placements encontrados na reconciliação. |",
        "| Oportunidades potenciais após reconciliação | 117 | 80 + 37. |",
        "| Composição especial separada | 6 | Mantidos fora do pacote inline. |",
        "| Patches isolados preparados | 111 | 117 − 6; reutilizados, sem novas descobertas nesta atualização. |",
        "| Aplicados em simulação isolada e revertidos | 111 | Dry-run anterior; não representa ativação canônica. |",
        "| Aplicados ao Payload/sidecar canônico/tradução | 0 | Nenhuma escrita canônica. |",
        "| Provas de posição original refeitas | 13 | Revalidações de READY já existentes; não são descobertas nem promoções. |",
        "| PENDING da família p.102 revisados visualmente | 3 | Promoções individuais para READY após PDF isolado, Cancel e revisão visual independente; sem PASS da página. |",
        "",
        "## Estado dos 111 placements",
        "",
        f"- **{counts['READY']} READY técnico em escopo de placement** (inclui três promoções individuais da p.102; 13 READY anteriores foram apenas revalidados).",
        f"- **{counts['AESTHETIC_APPROVAL_PENDING']} aguardando aceite estético humano** (p.92; textura sintética aproximada, não recuperação exata).",
        f"- **{counts['PENDING']} pendentes de evidência própria.**",
        f"- **{counts['BLOCKED']} bloqueados por evidência/artefato.**",
        f"- **{summary['sourceIdentityAndSlotConfirmed']}** têm identidade/posição individualmente confirmadas (READY + aceite estético pendente).",
        "- Os 13 READY revalidados têm snapshot original separado do snapshot movido; os PDFs EN isolados passaram a verificação do snapshot imutável, sem fallback para a fonte e sem chave `__en`.",
        "",
        "Os seis casos de composição especial permanecem separados: " + ", ".join(SPECIAL_CASES) + ".",
        "",
        "## Revalidação de posição original — 13 READY existentes",
        "",
        "- O harness agora salva o snapshot na posição original antes do ensaio de movimento; o estado movido fica em `moved-test-snapshot.json`. Também normaliza as chaves EN e deriva a entrelinha da fonte.",
        "- Uma falha real na p.102 veio da largura de texto extraído terminar antes do bbox medido do dado-fonte ancorado após o rótulo. O fluxo traduzido agora inclui somente a largura até a borda direita desse bbox; a regressão focada cobre o contrato.",
        "- Os 13 PDFs EN isolados consumiram snapshots imutáveis, passaram a verificação do exportador e preservaram `sourceAppearanceKey`; não foi detectado fallback para a fonte. Os casos p.45 e p.78 com aparências repetidas registram a ordem das ocorrências no bloco.",
        "- Relatório e evidência visual renderizada diretamente dos PDFs: `source-position-reproof-v1/source-position-reproof-report-v1.json`, `source-position-reproof-v1/review/source-pdf-vs-isolated-pdf-13-direct.png` e `source-position-reproof-v1/review/p102-source-vs-fixed-pdf-final.png`. São revalidações dos READY existentes; não alteram a contagem nem liberam PASS de página.",
        "",
        "## p.102 — três placements individuais promovidos após revisão própria",
        "",
        "- `p102-v418-421-n4` (`dice.white`): slot `2 - WHITE`; `p102-v422-425-n4` (`dice.orange`): slot `3 - ORANGE`; `p102-v426-429-n4` (`dice.teal`): slot `4 - TEAL`.",
        "- Para cada candidato, a fonte sem o alvo não deixa ghost, a reinserção mostra uma ocorrência no slot, o Cancel limpa os registros EN e restaura o texto fonte, e o PDF de uma página consome snapshot imutável com chave EN normalizada e sem fallback. A comparação integral não mostra conteúdo vizinho encoberto, colisão ou deslocamento perceptível.",
        "- A revisão visual independente recomenda READY para esses três IDs individualmente. Isto não aprova a p.102 inteira nem outros placements. Relatório, recibo visual e comparações: `source-position-reproof-p102-v1/p102-family-reproof-report-v1.json`, `source-position-reproof-p102-v1/visual-review.json` e `source-position-reproof-p102-v1/review/`.",
        "",
        "## p.64 — um dado preto pronto; página ainda sem fechamento estrutural",
        "",
        "- `p064-v201-204-n4` (`dice.black`) ocupa o slot `BLACK → dado preto → to its Combat Dice Pool`. A limpeza do PDF nativo remove apenas os vetores 201–204; a rasterização mudou zero pixels fora da máscara e preservou os image xrefs.",
        "- A prova usa entrelinha 1.2 derivada das baselines da fonte. As tentativas p.64 v1/v2 com entrelinha fixa 1.0 foram substituídas porque comprimiam as linhas e criavam colisões de ensaio. O símbolo exportado difere da geometria fonte em até 0.377 pt; os contextos de texto diferem em até 1.421 pt.",
        "- Viewer vazio/movido, uma única ocorrência, undo/redo, Cancel sem registro residual, snapshot EN normalizado e PDF isolado de uma página foram verificados. Não há ghost nem retângulo visível a 100%; um limite tonal fino aparece somente no recorte 10x.",
        "- O overlay isolado difere em um único asset de máscara; o dry-run mudou apenas esse asset, a segunda aplicação foi idempotente e o rollback restaurou a árvore exata. Isto promove somente o placement `p064-v201-204-n4`; os outros placements da p.64 seguem sem revisão própria e a página não recebe PASS estrutural.",
        "",
        "## p.65 — dois placements prontos; página ainda tem um outlier",
        "",
        "- `p065-v110-112-n3` (combat.shield): após `2` e antes de `and 2`. `p065-v115` (combat.damage-star): após `spends its 1` e antes de `to add +2 PHYSICAL DMG`.",
        "- Cada placement passou sua própria prova de máscara, estado vazio, movimento único, undo/redo, Cancel e PDF isolado na posição original; xrefs preservados e zero pixels alterados fora da máscara.",
        "- **Não é PASS estrutural da p.65.** A inspeção identificou o outlier `p065-g-boxed-letter`: o PDF-fonte tem um quadrado vetorial branco envolvendo o G. A comparação foi regenerada contra os PDFs com entrelinha medida; o G reflowado continua visualmente separado da caixa na fonte. O outlier não pertence aos IDs congelados dos 111, não foi corrigido e bloqueia o aceite estrutural da página. Evidência: `native-vector-mask-p065-proof-v6/p065-g-marker-source-vs-export-zoom.png` e `p065-g-marker-outlier.json`.",
        "",
        "## p.68 — placement do crânio pronto; página com colisão separada",
        "",
        "- `p068-v113-114-n2` (`combat.skull`) fica entre `Any roll other than the` e `is considered to pass the Check.`. A referência local anterior foi marcada inválida; a experiência nativa reproduzível substituiu esse diagnóstico sem tocar no PDF fonte.",
        "- A máscara limpa remove somente os vetores 113/114: 310 pixels renderizados mudam dentro da máscara, zero fora; os xrefs de imagem permanecem iguais. O recorte corresponde exatamente aos 41×53 px do asset isolado.",
        "- Viewer vazio/movido, uma única ocorrência semântica, undo/redo, Cancel, restauração exata do texto EN e exportação PDF de uma página foram verificados. A chave `page_68_block_5` não contém `__en`; o PDF de override vazio prova que o exportador consumiu o snapshot em vez de recorrer à fonte.",
        "- **Colisão separada descoberta pelo override vazio:** o dado preto é um vetor na fonte (`[384.4956, 452.7324, 395.9836, 465.9914] pt`) preservado no fundo do PDF isolado; o texto reflowado `than` ocupa `[381.0291, 454.7179, 399.4744, 464.9754] pt`, com interseção de 117.8373 pt² após regenerar a exportação com entrelinha 1.1 medida no PDF. O relatório está fora dos 111 IDs, não recebeu ID inventado nem remediação, e bloqueia o PASS estrutural da p.68. Evidência: `native-vector-mask-p068-proof-v5/p068-black-die-source-vs-empty-override.png` e `p068-black-die-outlier.json`.",
        "- O crânio continua READY somente em escopo individual; a colisão não invalida automaticamente o patch isolado nem autoriza inferir o comportamento de outros placements. Provas e PDF: `native-vector-mask-p068-proof-v5/p068-v113-114-n2/`; revisão: `native-vector-mask-p068-proof-v5/visual-review.json`.",
        "",
        "## p.45 — segundo dado branco com máscara nativa reconstruída",
        "",
        "- `p045-v142-145-n4` (`dice.white`) fica depois de `WHITE` e antes de `. She adds the numbers`. A remoção dos vetores-fonte 142–145 gerou crop de 27×31 px; zero pixels renderizados mudaram fora da máscara e os image xrefs foram preservados.",
        "- Viewer no slot original e vazio, movimento com o mesmo `sourceAppearanceKey`, undo/redo, Cancel sem registros restantes e PDF isolado de uma página foram verificados. O estado vazio não deixa símbolo fantasma nem retângulo de textura; a comparação ampliada fonte/export mantém o dado no slot previsto.",
        "- O overlay versionado da p.45 fica em `native-vector-mask-p045-v142-proof-v3/activation-overlay/`: os 26 assets da página foram copiados e somente a máscara do alvo difere. O dry-run alterou esse único asset, a segunda aplicação foi idempotente e o rollback restaurou a árvore-base exata. O ZIP completo dos 111 continua sem alteração.",
        "- Só `p045-v142-145-n4` foi promovido. A regeneração confirma o dado branco no slot `WHITE` → dado → ponto. A comparação da mesma unidade também mostra duas outras ocorrências vermelhas de Defense Value sobrepostas à redação após reflow; são um risco de página/unidade, sem atribuição automática a este ID. **A p.45 permanece sem PASS estrutural** até essa composição ser corrigida e validada. Evidência: `native-vector-mask-p045-v142-proof-v3/p045-v142-source-vs-isolated-pdf-zoom.png` e `native-vector-mask-p045-v142-proof-v3/line-height-review/p045-v142-145-n4-source-old-corrected.png`.",
        "",
        "## Provas v10 de p.45, p.54 e p.84",
        "",
        "- p.45 `p045-v134-137-n4`: a ordem original ficou BLACK → dado preto → ‘to her’. A exportação reflowa BLACK para o fim da linha anterior e o dado para o começo da seguinte; é uma nota de copyfit, não uma validação de layout da página.",
        "- p.54 `p054-v185-188-n4`: a ordem original ficou PURPLE → dado roxo → ‘printed on Zeke’s Adventurer Card’.",
        "- Nas três páginas, os estados vazio/movido, PDF isolado e Cancel foram verificados. Os snapshots novos serializam entrelinha medida por baselines; p.84 usa fallback pelas caixas de linha porque o bloco não fornece origens de texto. Todas tiveram zero pixels renderizados alterados fora da máscara. p.45 e p.54 preservaram os image xrefs na experiência descartável.",
        "- p.84 `p084-v185`: a remoção nativa alterou dois identificadores de image XObject não relacionados para imagens inline somente no documento PyMuPDF em memória usado pelo experimento; fora da máscara, a comparação raster foi zero. O PDF original nunca foi salvo, e o PDF isolado usa o crop de limpeza, não o documento redigido. A comparação fonte/export não mostra emenda no zoom normal, conteúdo vizinho encoberto nem marcador duplicado; a limitação fica explícita no recibo. Isso não é alegação de preservação desses xrefs no documento experimental.",
        "- A prova v5 de p.45/p.54 é histórica: seu PDF exportou propositalmente o estado movido e não demonstra a posição original. As versões novas preservam snapshots separados para a posição original e o teste de movimento.",
        "",
        "## Provas v3 da família de dano p.55",
        "",
        "- `p055-v94-96-n3`: shield mantido entre `spends 6` e `and`; `p055-v97`: damage star entre `1` e `to add +7 PHYSICAL DMG`. Cada alvo tem export isolado próprio; ambos preservam o símbolo vizinho no mesmo parágrafo.",
        "- Os estados vazio/movido, undo/redo e Cancel foram verificados individualmente. No PDF fonte e nos dois PDFs isolados, a frase permanece legível e os símbolos aparecem uma vez em cada slot semântico.",
        "- A experiência descartável em memória converteu nove image XObjects não relacionados a imagens inline. Os respectivos bboxes ficam longe das máscaras e a diferença raster fora da área-alvo é zero. O PDF fonte não foi salvo; a exportação usa somente os crops de limpeza.",
        "",
        "## Provas v4 dos símbolos da linha de rolagem p.55",
        "",
        "- `p055-v89-91-n3`: shield após `she rolls 6`; `p055-v92-93-n2`: page após `and 4` e antes do ponto. Os dois slots foram verificados individualmente no PDF-fonte, Viewer vazio/movido, undo/redo, Cancel e PDFs isolados. Comparações fonte/anterior/corrigido: `native-vector-mask-p055-proof-v4/line-height-review/`.",
        "- Não há ghost na posição de origem quando o alias é removido; a movimentação mostra uma ocorrência; Cancel restaura o inglês. As exportações têm uma página e não encobrem conteúdo vizinho. A diferença raster fora da máscara é zero. Snapshots novos usam entrelinha 1.1 derivada das baselines do PDF.",
        "- Limite: o relatório do experimento v2 marca `imageXrefsPreserved=false`, enquanto a repetição independente read-only marca `true`. A p.55 v1 já registrara nove XObjects não relacionados em y=436.641–445.507 pt; ambas as máscaras v2 ficam em y=471.75–484.5 pt. O PDF fonte permaneceu com o mesmo hash e nunca foi salvo. A divergência de metadado está preservada, sem afirmar que os xrefs do documento descartável foram preservados.",
        "",
        "## Testes do aplicativo e limites",
        "",
        "- Vitest web serial após a correção da largura até o bbox do símbolo fonte: 33 arquivos passaram, 1 arquivo foi ignorado; 202 testes passaram, 2 foram ignorados e 0 falharam. A regressão p.41 passou; a falha histórica da p.41 não se reproduziu. Uma tentativa concorrente com build/lint ativos teve timeout no FAQ e no teste de geometria inline da p.78; ambos passaram no rerun serial completo.",
        "- Admin Vitest: 3 arquivos e 18 testes passaram. Playwright E2E: 4/4 passaram após instalar Chromium; o usuário temporário de teste foi removido (contagem final zero). Esses dois resultados são do checkpoint anterior ao hotfix do renderer e não foram repetidos nesta validação web; os testes não gravaram registros de tradução.",
        "- `tsc -b` e build Vite passaram (2.109 módulos). O build avisou que `/texture.png` será resolvido em runtime, que o bundle principal tem 1,33 MB e que `prepare-out-dir/renderStart` consumiu 33,2 s.",
        "- O log Oxlint disponível registra 0 erros e 54 avisos, mas o executável não está instalado para um rerun após o hotfix do renderer; o lint atual fica pendente. ESLint do admin não iniciou a análise: ESLint 9 lançou TypeError circular ao validar o plugin React.",
        "- O wrapper pnpm continua barrado no preflight `ERR_PNPM_IGNORED_BUILDS`; as suítes foram executadas pelos bins locais instalados sem alterar a política pnpm. Testes e build não substituem a revisão visual por página/família nem promovem placements automaticamente.",
        "",
        "## Integridade e fontes",
        "",
        "O JSON guarda os hashes SHA-256 das fontes e as referências de evidência por placement. Os CSV/JSON históricos v2 e o fechamento do lote não foram sobrescritos.",
        "",
        f"- JSON: `{json_path.relative_to(ROOT).as_posix()}`",
        f"- CSV: `{csv_path.relative_to(ROOT).as_posix()}`",
        f"- SHA-256 do CSV v2: `{sources['placementStatusCsvSha256']}`",
        f"- SHA-256 do fechamento batch-95: `{sources['familyCloseoutJsonSha256']}`",
        f"- SHA-256 do relatório de prova v10: `{sources['v10ProofReportSha256']}`",
        f"- SHA-256 dos relatórios p.55 v3/v4: `{sources['p055-v3ProofReportSha256']}` / `{sources['p055-v4ProofReportSha256']}`",
        f"- SHA-256 da prova p.65 v6: `{sources['p065-v6ProofReportSha256']}`; outlier G: `{sources['p065GMarkerOutlierSha256']}`",
        f"- SHA-256 da prova/revisão p.68 v5: `{sources['p068ProofReportSha256']}` / `{sources['p068VisualReviewSha256']}`",
        f"- SHA-256 do recibo de colisão p.68: `{sources['p068BlackDieOutlierSha256']}`",
        f"- SHA-256 da prova/revisão p.45 v142 v3: `{sources['p045-v142-v3ProofReportSha256']}` / `{sources['p045-v142-v3VisualReviewSha256']}`",
        f"- SHA-256 do recibo source-position reproof v1: `{sources['sourcePositionReproofReportSha256']}`",
        f"- SHA-256 dos recibos/revisão da família p.102: `{sources['p102FamilyReproofReportSha256']}` / `{sources['p102FamilyVisualReviewSha256']}`",
        "",
    ]
    md_path.write_text("\n".join(md), encoding="utf-8")
    print(json.dumps({"json": str(json_path), "csv": str(csv_path), "markdown": str(md_path), "counts": dict(counts), "summary": summary, "sourceHashes": sources}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
