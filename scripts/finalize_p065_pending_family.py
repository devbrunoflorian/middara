#!/usr/bin/env python3
"""Close out the two existing p.65 dice candidates without canonical writes.

This finalizer reads the frozen v10 ledger and the isolated v2 proof package,
validates their hashes/contracts, records the independent visual review, then
writes a new v11 ledger and comparison evidence. It never edits the source PDF,
Payload, canonical sidecars, or human translations.
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
PROOF_ROOT = OUTPUT / "native-vector-mask-p065-pending-proof-v2"
SOURCE_PDF = Path(r"C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
SOURCE_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
IDS = ["p065-v89-92-n4", "p065-v93-96-n4"]
TEST_SUMMARY_PATH = PROOF_ROOT / "final-review/test-summary-v1.json"
TARGETS = {
    "p065-v89-92-n4": {"symbolId": "dice.black", "left": "BLACK", "right": "to its Combat Dice Pool via"},
    "p065-v93-96-n4": {"symbolId": "dice.white", "left": "WHITE", "right": "7"},
}
EXPECTED_MASKS = {
    "p065-v89-92-n4": "0cdc9297f752861ac8f9509b5e7342a88f011c3abd8db9bc5050980224a91585",
    "p065-v93-96-n4": "2dda68d5bd96d971b81baca9c4c26a55af686729324b35c57513bb2eb7d446bf",
}


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


def write_immutable(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != content:
            raise SystemExit(f"Refusing to overwrite different evidence: {rel(path)}")
        return
    path.write_bytes(content)


def write_current_generated(path: Path, content: bytes) -> None:
    """Refresh only the v11 outputs owned by this finalizer, with identity guards."""
    if path.exists():
        if path.name == "readiness-ledger-v11.json":
            prior = read_json(path)
            if not prior.get("scope", "").startswith("v11:"):
                raise SystemExit(f"Refusing to replace a non-v11 ledger: {rel(path)}")
        elif path.name == "readiness-ledger-v11.md":
            if not path.read_text(encoding="utf-8").startswith("# MIDDARA — Ledger de prontidão para tradução (v11)"):
                raise SystemExit(f"Refusing to replace an unexpected ledger document: {rel(path)}")
        elif path.name == "readiness-ledger-v11.csv":
            if not path.read_text(encoding="utf-8").startswith("candidateId,page,symbolId,status,"):
                raise SystemExit(f"Refusing to replace an unexpected ledger CSV: {rel(path)}")
        elif path.name == "p065-family-closeout-v1.json":
            prior = read_json(path)
            if not prior.get("status", "").startswith("two existing p.65 candidates"):
                raise SystemExit(f"Refusing to replace an unexpected closeout: {rel(path)}")
        else:
            raise SystemExit(f"Refresh is restricted to generated v11 outputs: {rel(path)}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def json_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def render_crop(page: pymupdf.Page, bbox: list[float]) -> Image.Image:
    margin_x, margin_y = 22, 12
    clip = pymupdf.Rect(
        max(0, bbox[0] - margin_x),
        max(0, bbox[1] - margin_y),
        min(page.rect.width, bbox[2] + margin_x),
        min(page.rect.height, bbox[3] + margin_y),
    )
    pix = page.get_pixmap(matrix=pymupdf.Matrix(3, 3), clip=clip, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def make_source_pdf_comparison(source_doc: pymupdf.Document, records: list[dict]) -> bytes:
    tiles: list[tuple[str, Image.Image, Image.Image]] = []
    exports: list[pymupdf.Document] = []
    try:
        for record in records:
            export_doc = pymupdf.open(ROOT / record["pdf"])
            exports.append(export_doc)
            assert len(export_doc) == 1
            bbox = record["sourceBBoxPt"]
            source_crop = render_crop(source_doc[64], bbox)
            export_crop = render_crop(export_doc[0], bbox)
            assert source_crop.size == export_crop.size
            tiles.append((record["candidateId"], source_crop, export_crop))

        gap, title_h, label_h = 12, 26, 22
        crop_w = max(source.width for _, source, _ in tiles)
        crop_h = max(max(source.height, export.height) for _, source, export in tiles)
        font_path = Path(r"C:/Windows/Fonts/arial.ttf")
        try:
            title_font = ImageFont.truetype(str(font_path), 16)
        except OSError:
            title_font = ImageFont.load_default()
        sheet = Image.new("RGB", (crop_w * 2 + gap + 12, (title_h + label_h + crop_h + 12) * len(tiles) + 8), "#202124")
        draw = ImageDraw.Draw(sheet)
        for index, (candidate_id, source_crop, export_crop) in enumerate(tiles):
            y = 8 + index * (title_h + label_h + crop_h + 12)
            draw.text((6, y), candidate_id, fill="white", font=title_font)
            label_y = y + title_h
            export_x = 6 + crop_w + gap
            draw.text((6, label_y), "PDF FONTE", fill="#dddddd", font=title_font)
            draw.text((export_x, label_y), "PDF ISOLADO · snapshot EN", fill="#dddddd", font=title_font)
            image_y = label_y + label_h
            sheet.paste(source_crop, (6, image_y))
            sheet.paste(export_crop, (export_x, image_y))
        output = io.BytesIO()
        sheet.save(output, format="PNG", optimize=True)
        return output.getvalue()
    finally:
        for doc in exports:
            doc.close()


def main() -> None:
    assert sha256(SOURCE_PDF) == SOURCE_SHA256, "Source PDF hash changed; stop and review before accepting this proof."
    base_path = OUTPUT / "readiness-ledger-v10.json"
    ledger = read_json(base_path)
    assert len(ledger["placements"]) == 111
    rows = {item["candidateId"]: item for item in ledger["placements"]}
    assert set(IDS).issubset(rows)
    for candidate_id in IDS:
        assert rows[candidate_id]["status"] == "PENDING", f"Unexpected prior status for {candidate_id}."
        assert rows[candidate_id]["canonicalApplied"] is False

    proof_report_path = PROOF_ROOT / "proof-report.json"
    proof_report = read_json(proof_report_path)
    test_summary = read_json(TEST_SUMMARY_PATH)
    assert test_summary["web"]["testsPassed"] == 203 and test_summary["web"]["testsSkipped"] == 2
    assert test_summary["web"]["testsFailed"] == 0
    assert test_summary["adminIntegration"]["testsPassed"] == 18
    assert test_summary["adminE2E"]["testsExecuted"] == 0
    assert proof_report["sourcePdfSha256"] == SOURCE_SHA256
    assert proof_report["canonicalWrites"] == proof_report["payloadWrites"] == proof_report["translationWrites"] == proof_report["apiRequests"] == 0
    proof_candidates = {item["candidateId"]: item for item in proof_report["candidates"]}
    assert set(proof_candidates) == set(IDS)
    source_pdf_doc = pymupdf.open(SOURCE_PDF)
    records: list[dict] = []

    for candidate_id in IDS:
        target = TARGETS[candidate_id]
        candidate_dir = PROOF_ROOT / candidate_id
        proof = proof_candidates[candidate_id]
        candidate = read_json(candidate_dir / "candidate-input.json")
        slot = read_json(candidate_dir / "source-slot.json")
        cancel = read_json(candidate_dir / "cancel-check.json")
        movement = read_json(candidate_dir / "movement.json")
        empty = read_json(candidate_dir / "empty-state.json")
        original_snapshot_path = candidate_dir / "snapshot/original-position-snapshot.json"
        moved_snapshot_path = candidate_dir / "snapshot/moved-test-snapshot.json"
        snapshot = read_json(original_snapshot_path)
        moved_snapshot = read_json(moved_snapshot_path)
        pdf_path = candidate_dir / "p065-en-mask-v1.pdf"
        metrics_path = candidate_dir / "capture/export-metrics.json"
        metrics = read_json(metrics_path)
        export_log_path = candidate_dir / "export.log"
        export_log = export_log_path.read_text(encoding="utf-8")

        assert candidate["page"] == 65 and candidate["symbolId"] == target["symbolId"]
        assert candidate["sourcePdfSha256"] == SOURCE_SHA256
        mask_path = candidate_dir / "native-vector-clean-mask.png"
        assert sha256(mask_path) == EXPECTED_MASKS[candidate_id]
        assert candidate["exactCleanMaskSha256"] == EXPECTED_MASKS[candidate_id]
        assert proof["replacementMaskSha256"] == EXPECTED_MASKS[candidate_id]
        assert proof["collateralChangedPixelsOutsideMask"] == 0
        assert proof["imageXrefsPreserved"] is True
        original_mask_path = ROOT / "output/proofs/full-symbol-integrity-2026-10-13/patches/pages/page_065" / Path(candidate["mask"]["url"]).name
        assert sha256(original_mask_path) == candidate["originalMaskSha256"]

        assert slot["expectedLeftContext"] == target["left"]
        assert slot["expectedRightContext"] == target["right"]
        assert target["left"] in slot["precedingText"]
        assert target["right"] in slot["followingText"]
        assert snapshot["patched"] is True and snapshot["verifyRenderedSnapshot"] is True
        translations = snapshot["translations"]
        assert len(translations) == 1
        translation = translations[0]
        assert translation["language"] == "en"
        assert not translation["spanKey"].endswith("__en")
        assert "__en" not in original_snapshot_path.read_text(encoding="utf-8")
        assert translation["spanKey"] == empty["ownerKey"]
        assert moved_snapshot["verifyRenderedSnapshot"] is True
        assert sha256(original_snapshot_path) != sha256(moved_snapshot_path)

        segments = translation["data"]["segments"]
        source_key = candidate["metrics"]["sourceAppearanceKey"]
        target_segments = [
            segment for segment in segments
            if segment.get("symbolId") == target["symbolId"]
            and segment.get("symbolMetrics", {}).get("sourceAppearanceKey") == source_key
        ]
        assert len(target_segments) == 1, f"{candidate_id}: expected one source-matched target in the immutable EN snapshot."
        assert sum(1 for segment in segments if segment.get("symbolId") == target["symbolId"]) == 1
        empty_target_segments = [
            segment for record in empty["records"] for segment in record["segments"]
            if segment.get("symbolId") == target["symbolId"]
        ]
        assert len(empty_target_segments) == 0, f"{candidate_id}: empty proof still contains a semantic target."

        assert cancel["recordsAfterCancel"] == 0
        assert cancel["sourceAppearanceRestored"] is True
        assert cancel["apiRequestsAtCheckpoint"] == 0
        assert movement["undoRestored"] is True and movement["redoRestored"] is True
        assert Counter(movement["originalSymbolKeys"]) == Counter(movement["movedSymbolKeys"])
        assert movement["targetSourceAppearanceKey"] == source_key
        assert sum(source_key in key for key in movement["originalSymbolKeys"]) == 1
        assert sum(source_key in key for key in movement["movedSymbolKeys"]) == 1

        assert '"immutableSnapshot": true' in export_log
        assert "edited snapshot text/symbol order verified 1" in export_log
        assert '"pdfVerification": true' in export_log
        assert metrics["page"] == 65 and metrics["language"] == "en"
        assert metrics["print"]["pageWidthPt"] > 0 and metrics["print"]["pageHeightPt"] > 0
        assert pdf_path.exists() and pdf_path.stat().st_size > 0
        export_doc = pymupdf.open(pdf_path)
        try:
            assert len(export_doc) == 1
            pdf_text = export_doc[0].get_text()
            assert target["left"] in pdf_text
            if candidate_id == "p065-v89-92-n4":
                assert "to its Combat Dice Pool via" in pdf_text
            else:
                assert "7" in pdf_text and "Rook" in pdf_text
            source_bbox = candidate["bbox"]
        finally:
            export_doc.close()

        evidence_files = {
            "emptyViewer": candidate_dir / "capture/viewer-empty-clean-mask.png",
            "movedViewer": candidate_dir / "capture/viewer-moved-clean-mask.png",
            "sourceViewer": candidate_dir / "capture/viewer-source-with-clean-vector-mask.png",
            "exportPrint": candidate_dir / "capture/export-print.png",
            "exportViewer": candidate_dir / "capture/export-viewer.png",
            "cancel": candidate_dir / "cancel-check.json",
            "movement": candidate_dir / "movement.json",
            "snapshot": original_snapshot_path,
            "movedSnapshot": moved_snapshot_path,
            "isolatedPdf": pdf_path,
            "exportLog": export_log_path,
        }
        for path in evidence_files.values():
            assert path.exists() and path.stat().st_size > 0

        records.append({
            "candidateId": candidate_id,
            "page": 65,
            "symbolId": target["symbolId"],
            "priorLedgerStatus": "PENDING",
            "finalLedgerStatus": "READY",
            "statusPromotion": True,
            "newDiscovery": False,
            "sourcePdfSha256": SOURCE_SHA256,
            "originalMaskSha256": candidate["originalMaskSha256"],
            "replacementMaskSha256": sha256(mask_path),
            "collateralChangedPixelsOutsideMask": 0,
            "imageXrefsPreserved": True,
            "sourceAppearanceKey": source_key,
            "sourceBBoxPt": source_bbox,
            "sourceSlot": {"left": target["left"], "symbol": target["symbolId"], "right": target["right"]},
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
            "sourceFallbackAssessment": "none indicated; immutable EN snapshot consumed and export PDF verified",
            "exporterPdfVerification": True,
            "normalScaleReview": "no perceptible ghost or rectangle; text and adjacent symbols remain legible",
            "zoomReview": "patch is smoother than the source texture, most visible for dice.black; recorded as a zoom-only fidelity caveat",
            "visualReviewer": "/root/luna_review_v2",
            "evidence": {key: {"path": rel(path), "sha256": sha256(path)} for key, path in evidence_files.items()},
        })

    comparison_path = PROOF_ROOT / "final-review/p065-source-vs-isolated-pdf-v1.png"
    comparison_bytes = make_source_pdf_comparison(source_pdf_doc, records)
    source_pdf_doc.close()
    write_immutable(comparison_path, comparison_bytes)

    visual_review = {
        "schemaVersion": 1,
        "reviewedAt": "2026-10-14",
        "reviewer": "/root/luna_review_v2",
        "reviewType": "independent read-only visual review",
        "status": "candidate-level READY at normal reading scale; page-level structural pass withheld",
        "sourcePdfSha256": SOURCE_SHA256,
        "pageLevelPassAsserted": False,
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
        "summary": "Both targets are legible at page scale without a reliable visible rectangle or ghost. At enlarged comparison, the replacement patch is smoother than the source texture, most noticeably behind the black die. This is a fidelity caveat, not exact recovery of the original texture.",
        "targets": [
            {
                "candidateId": record["candidateId"],
                "status": "READY",
                "normalScale": record["normalScaleReview"],
                "enlargedScale": record["zoomReview"],
                "targetInSourceSlot": True,
                "duplicateAfterReinsert": False,
                "neighborContentCovered": False,
                "cancelRestoresSource": True,
                "pdfOnePageAndVerified": True,
                "evidence": record["evidence"],
            }
            for record in records
        ],
        "evidence": {
            "sourceVsIsolatedPdf": {"path": rel(comparison_path), "sha256": sha256(comparison_path)},
            "sourceVersusPdfZoomExisting": {
                "path": rel(PROOF_ROOT / "p065-v2-source-vs-pdf.png"),
                "sha256": sha256(PROOF_ROOT / "p065-v2-source-vs-pdf.png"),
            },
        },
        "pageLevelBlocker": {
            "candidateId": "p065-g-boxed-letter",
            "scope": "outlier outside frozen 111 placements",
            "status": "open",
            "effect": "p.65 does not receive page-level structural PASS",
        },
    }
    visual_review_path = PROOF_ROOT / "final-review/visual-review.json"
    write_immutable(visual_review_path, json_bytes(visual_review))

    closeout = {
        "schemaVersion": 1,
        "generatedAt": "2026-10-14",
        "status": "two existing p.65 candidates promoted to candidate-level READY; no canonical activation",
        "priorLedger": rel(base_path),
        "priorLedgerSha256": sha256(base_path),
        "sourcePdf": str(SOURCE_PDF),
        "sourcePdfSha256": SOURCE_SHA256,
        "discoveryCount": 0,
        "priorPreparedPlacementCount": 111,
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
        "promotions": records,
        "independentVisualReview": rel(visual_review_path),
        "sourceVsIsolatedPdfComparison": {"path": rel(comparison_path), "sha256": sha256(comparison_path)},
        "applicationValidation": {
            "path": rel(TEST_SUMMARY_PATH),
            "sha256": sha256(TEST_SUMMARY_PATH),
            "web": "203 passed, 2 skipped, 0 failed",
            "webBuild": "passed with warnings",
            "adminIntegration": "18 passed, 0 failed",
            "adminE2E": "not executed; Playwright runner resolution error; pnpm wrapper blocked",
            "suiteApprovedInFull": False,
        },
        "pageLevelPassAsserted": False,
        "pageLevelBlocker": "p065-g-boxed-letter remains open outside the frozen 111 placements.",
    }

    updated = json.loads(json.dumps(ledger))
    updated_rows = {item["candidateId"]: item for item in updated["placements"]}
    updated["generatedAt"] = "2026-10-14"
    updated["scope"] = "v11: the existing frozen 111 placements only; two p.65 candidates gained candidate-specific evidence; no canonical activation."
    updated["summary"]["technicallyReadyAndVisuallyValidated"] += 2
    updated["summary"]["sourceIdentityAndSlotConfirmed"] += 2
    updated["summary"]["technicallyPending"] -= 2
    updated["summary"]["candidateScopePlacementPromotionsThisLedger"] = IDS
    updated["summary"]["candidateScopePlacementPromotionsInV11"] = IDS
    updated["summary"]["p065PendingFamilyProofCount"] = 2
    updated["summary"]["p065PendingFamilyProofCandidateIds"] = IDS
    updated["summary"]["p065CandidateLevelVisualReviewPassed"] = True
    updated["summary"]["p065PageLevelStructuralPassAsserted"] = False
    web_result = test_summary["web"]
    updated["verification"]["web"].update({
        "status": web_result["status"],
        "command": web_result["command"],
        "testFilesPassed": web_result["testFilesPassed"],
        "testFilesSkipped": web_result["testFilesSkipped"],
        "testFilesTotal": web_result["testFilesTotal"],
        "testsPassed": web_result["testsPassed"],
        "testsSkipped": web_result["testsSkipped"],
        "testsFailed": web_result["testsFailed"],
        "page41Regression": "passed in current serial full run; an earlier concurrent timeout was not reproduced",
        "latestRunAfterP065TestAddition": True,
    })
    build_result = test_summary["webBuild"]
    updated["verification"]["typescript"]["status"] = "passed"
    updated["verification"]["webBuild"] = {
        "status": build_result["status"],
        "command": build_result["command"],
        "modulesTransformed": build_result["modulesTransformed"],
        "mainBundleKb": build_result["mainBundleKb"],
        "buildSeconds": build_result["buildSeconds"],
        "warnings": build_result["warnings"],
    }
    updated["verification"]["adminIntegration"] = {
        "status": "passed",
        "command": test_summary["adminIntegration"]["command"],
        "testFilesPassed": test_summary["adminIntegration"]["testFilesPassed"],
        "testsPassed": test_summary["adminIntegration"]["testsPassed"],
        "testsFailed": test_summary["adminIntegration"]["testsFailed"],
        "rerunAfterSourceInlineRendererFix": True,
    }
    updated["verification"]["adminE2E"] = {
        "status": "runner_resolution_error",
        "testsPassed": 0,
        "testsFailed": 0,
        "testsExecuted": 0,
        "note": "Playwright reported multiple test instances before discovery; the pnpm script was separately blocked by ERR_PNPM_IGNORED_BUILDS. See final-review/test-summary-v1.json.",
        "historicalPreviousCheckpoint": "4/4 passed before the latest renderer fix; not reproduced in this run.",
    }
    updated["verification"]["pnpmTestWrapper"] = {
        "status": "preflight_blocked",
        "error": "ERR_PNPM_IGNORED_BUILDS for better-sqlite3, esbuild, and unrs-resolver; local Vitest binaries were used successfully for web/admin integration.",
    }
    updated["verification"]["testSummary"] = {
        "path": rel(TEST_SUMMARY_PATH),
        "sha256": sha256(TEST_SUMMARY_PATH),
        "suiteApprovedInFull": False,
    }
    for finding in updated["summary"]["pageLevelStructuralFindings"]:
        if finding["page"] == 65:
            finding["classification"] = "two individual dice candidates are READY; boxed G outlier outside the frozen 111 still blocks page-level PASS"
            finding["finding"] = "p065-v89-92-n4 and p065-v93-96-n4 passed their own source-position, empty/move/Cancel, and isolated PDF checks. At normal reading scale no reliable ghost or patch rectangle is visible; an enlarged comparison shows the replacement patch is smoother than the source texture. The boxed G marker remains visually separated from its source vector box and continues to block page-level structural approval."
            finding["evidence"] = rel(visual_review_path)
            break
    else:
        raise AssertionError("The v10 ledger must retain its p.65 page-level blocker record.")

    for record in records:
        row = updated_rows[record["candidateId"]]
        row["status"] = "READY"
        row["identityAndSlotConfirmed"] = True
        row["visualStatus"] = "technical-visual-validation-passed"
        row["statusOrigin"] = "candidate-specific p.65 source-position proof plus independent visual review; v11 promotion"
        row["reason"] = (
            "Promoted from PENDING after the normalized EN snapshot retained exactly one target with the sourceAppearanceKey, "
            "the immutable one-page PDF passed export verification, movement undo/redo and Cancel passed, and the independent "
            "review found no reliable ghost/rectangle at normal reading scale. The replacement patch is smoother than source "
            "texture under enlarged inspection; this caveat is recorded and the original artwork texture is not claimed as exactly recovered. "
            "Candidate-level READY only; the boxed G outlier still blocks page-level approval."
        )
        row["p065FamilyProof"] = record
        row["candidateVisualReview"] = {
            "reviewer": "/root/luna_review_v2",
            "status": "candidate-ready-normal-reading-scale-with-zoom-texture-caveat",
            "evidence": record["evidence"],
            "pageLevelPassAsserted": False,
        }

    assert Counter(row["status"] for row in updated["placements"]) == Counter({"READY": 74, "AESTHETIC_APPROVAL_PENDING": 3, "PENDING": 16, "BLOCKED": 18})
    assert sum(row["identityAndSlotConfirmed"] for row in updated["placements"]) == 77
    assert len({row["candidateId"] for row in updated["placements"]}) == 111
    assert updated["summary"]["totalPreparedPlacements"] == 111
    assert updated["summary"]["canonicalPlacementsApplied"] == 0
    assert updated["summary"]["specialCompositionCasesExcluded"] == 6
    assert updated["summary"]["pageLevelStructuralPassWithheld"] == [45, 64, 65, 68, 102]

    ledger_json_path = OUTPUT / "readiness-ledger-v11.json"
    write_current_generated(ledger_json_path, json_bytes(updated))
    csv_fields = ["candidateId", "page", "symbolId", "status", "identityAndSlotConfirmed", "isolatedPatchPrepared", "appliedInDryRunSimulation", "canonicalApplied", "visualStatus", "statusOrigin", "reason"]
    csv_buffer = io.StringIO(newline="")
    writer = csv.DictWriter(csv_buffer, fieldnames=csv_fields, lineterminator="\n")
    writer.writeheader()
    for row in updated["placements"]:
        writer.writerow({key: row.get(key, "") for key in csv_fields})
    write_immutable(OUTPUT / "readiness-ledger-v11.csv", csv_buffer.getvalue().encode("utf-8"))

    summary = updated["summary"]
    markdown = f"""# MIDDARA — Ledger de prontidão para tradução (v11)

Atualizado em 2026-10-14. O ledger parte do v10 e mantém os mesmos 111 placements; não grava no canônico.

## Estado dos placements

- **{summary['technicallyReadyAndVisuallyValidated']} READY** em escopo de candidato, incluindo duas promoções individuais da p.65.
- **{summary['aestheticApprovalPending']} aguardando aceite estético humano**, todos da p.92; textura sintética aproximada, não recuperação exata da arte.
- **{summary['technicallyPending']} pendentes** de evidência própria.
- **{summary['evidenceBlockedWithin111']} bloqueados**.
- **{summary['sourceIdentityAndSlotConfirmed']}** com identidade e slot confirmados.
- Total congelado: **{summary['totalPreparedPlacements']}**. As seis composições especiais continuam fora do lote e bloqueadas.

## Promoções da p.65

- `p065-v89-92-n4` (`dice.black`): `BLACK` → dado → `to its Combat Dice Pool via`.
- `p065-v93-96-n4` (`dice.white`): `WHITE` → dado → `7`.
- Eram candidatos existentes em PENDING no ledger v10; não são novas descobertas. O snapshot EN serializa o span key normalizado sem `__en`, mantém uma única ocorrência com o `sourceAppearanceKey` fonte, e o PDF isolado de uma página consumiu o snapshot imutável e passou `pdfVerification`.
- Estado vazio sem símbolo alvo, movimento com undo/redo, Cancel sem registros residuais e restauração da aparência fonte foram verificados para cada ID. A revisão independente não percebe ghost ou retângulo confiável no tamanho normal de leitura; a inspeção ampliada nota que o patch é mais liso que a textura fonte, sobretudo no dado preto. Isso é uma ressalva de fidelidade visual em zoom, não alegação de recuperação exata da textura.
- Evidências: [revisão visual](native-vector-mask-p065-pending-proof-v2/final-review/visual-review.json), [recibo de fechamento](native-vector-mask-p065-pending-proof-v2/final-review/p065-family-closeout-v1.json), [comparação direta dos PDFs](native-vector-mask-p065-pending-proof-v2/final-review/p065-source-vs-isolated-pdf-v1.png).

**A p.65 não recebe PASS estrutural.** O marcador `G` encaixotado permanece outlier fora dos 111 e continua separado de sua caixa vetorial fonte.

## Totais de reconciliação preservados

- Detector: {summary['unmatchedSourceGlyphCandidatesDetected']} candidatos de glifo não correspondidos.
- {summary['initialPlacementCandidates']} candidatos iniciais + {summary['reconciledPlacementCandidates']} reconciliados = {summary['potentialPlacementsAfterReconciliation']} oportunidades potenciais.
- {summary['potentialPlacementsAfterReconciliation']} − {summary['specialCompositionCasesExcluded']} composições especiais = {summary['isolatedPatchPlacementsPrepared']} patches isolados preparados.
- Nenhuma descoberta adicional nesta revisão; zero ativação canônica.

## Validação

O script [`finalize_p065_pending_family.py`](../../scripts/finalize_p065_pending_family.py) verifica novamente os hashes do PDF fonte, máscaras, snapshots, exports e capturas antes de produzir este ledger. A suíte web serial passou com 203 testes aprovados, 2 ignorados e 0 falhas; a regressão p.41 passou, e um timeout concorrente histórico não se repetiu. O build web e TypeScript passaram, com avisos de `/texture.png` resolvido em runtime, bundle principal de 1,33 MB e callback de preparação de saída levando 38 s. Admin integration passou 18/18. O E2E Admin segue pendente: o runner não descobriu testes por erro de instâncias Playwright; a execução pelo pnpm parou antes por `ERR_PNPM_IGNORED_BUILDS`. O lint web não foi repetido porque o binário Oxlint não está disponível; ESLint Admin ainda falha ao formatar configuração circular. Portanto a suíte inteira não está aprovada. Recibo: [test-summary-v1.json](native-vector-mask-p065-pending-proof-v2/final-review/test-summary-v1.json).

As provas ficam limitadas aos dois candidatos e não liberam a p.65 inteira.
"""
    write_current_generated(OUTPUT / "readiness-ledger-v11.json", json_bytes(updated))
    write_current_generated(OUTPUT / "readiness-ledger-v11.csv", csv_buffer.getvalue().encode("utf-8"))
    write_current_generated(OUTPUT / "readiness-ledger-v11.md", markdown.encode("utf-8"))
    write_current_generated(PROOF_ROOT / "final-review/p065-family-closeout-v1.json", json_bytes(closeout))

    print(json.dumps({
        "promoted": IDS,
        "summary": {key: summary[key] for key in ("technicallyReadyAndVisuallyValidated", "aestheticApprovalPending", "technicallyPending", "evidenceBlockedWithin111", "sourceIdentityAndSlotConfirmed", "totalPreparedPlacements")},
        "ledger": rel(ledger_json_path),
        "closeout": rel(PROOF_ROOT / "final-review/p065-family-closeout-v1.json"),
        "comparison": rel(comparison_path),
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
