#!/usr/bin/env python3
"""Verify the isolated p.28 PT-BR PDF, preserved records, and print copyfit."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PROPOSAL = ROOT / "docs/translations/proposals/page-028-item-upgrades-proposal-2026-10-16-v4.json"
SNAPSHOT = ROOT / "output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/snapshot-diagnostic-v4/snapshot.json"
METRICS = ROOT / "output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/metrics-pt-BR-diagnostic-v4.json"
RECEIPT = ROOT / "output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/pdf-verification-v1.json"


def normalized(value: str) -> str:
    return " ".join(value.split())


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify_p028_item_upgrades_pdf_v4.py <pdf>")

    pdf_path = Path(sys.argv[1]).resolve()
    proposal = json.loads(PROPOSAL.read_text(encoding="utf-8"))
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    metrics = json.loads(METRICS.read_text(encoding="utf-8"))
    assert proposal["page"] == 28 and proposal["locale"] == "pt-BR"
    assert len(proposal["candidates"]) == 23
    assert len(proposal["preservedHumanRecords"]) == 8
    assert len(snapshot["translations"]) == 31
    assert len(snapshot["diagnosticOnly"]["blankedSpanKeys"]) == 0
    assert len(snapshot["layoutFrames"]) == 3

    document = pymupdf.open(pdf_path)
    assert document.page_count == 1, f"Expected one page, got {document.page_count}"
    page = document[0]
    expected_size = [820.346, 820.346]
    actual_size = [round(page.rect.width, 3), round(page.rect.height, 3)]
    assert all(abs(actual_size[i] - expected_size[i]) <= 0.5 for i in range(2)), actual_size
    extracted = page.get_text()
    normalized_extracted = normalized(extracted)

    expected_units = [
        (candidate["legacyBlockSpanKey"], candidate["proposalText"], "new_candidate")
        for candidate in proposal["candidates"]
    ] + [
        (record["spanKey"], record["proposedText"], "preserved_human_record")
        for record in proposal["preservedHumanRecords"]
    ]
    missing_units = [
        {"spanKey": key, "kind": kind}
        for key, text, kind in expected_units
        if normalized(text) not in normalized_extracted
    ]
    assert not missing_units, f"Missing proposed or preserved PT-BR text: {missing_units}"

    replacement_count = extracted.count("\ufffd")
    private_use_count = sum(0xE000 <= ord(char) <= 0xF8FF for char in extracted)
    assert replacement_count == 0, f"Replacement characters found: {replacement_count}"
    assert private_use_count == 0, f"Private-use characters found: {private_use_count}"

    candidate_keys = {candidate["legacyBlockSpanKey"] for candidate in proposal["candidates"]}
    print_targets = [target for target in metrics["print"]["translationTargets"] if target["spanKey"] in candidate_keys]
    viewer_targets = [target for target in metrics["viewer"]["translationTargets"] if target["spanKey"] in candidate_keys]
    assert len(print_targets) == 23, f"Expected 23 print measurements, got {len(print_targets)}"
    assert len(viewer_targets) == 23, f"Expected 23 viewer measurements, got {len(viewer_targets)}"
    printed_overflows = [
        {"spanKey": target["spanKey"], "rightPt": target["edgeExcessPt"]["right"], "bottomPt": target["edgeExcessPt"]["bottom"]}
        for target in print_targets
        if target["edgeExcessPt"]["right"] > 0.01 or target["edgeExcessPt"]["bottom"] > 0.01
    ]
    assert not printed_overflows, f"Printed candidates exceed a frame edge: {printed_overflows}"
    viewer_subpixel_excess = [
        {"spanKey": target["spanKey"], "rightPt": target["edgeExcessPt"]["right"], "bottomPt": target["edgeExcessPt"]["bottom"]}
        for target in viewer_targets
        if target["edgeExcessPt"]["right"] > 0.01 or target["edgeExcessPt"]["bottom"] > 0.01
    ]

    receipt = {
        "status": "passed_single_page_pdf_all_23_candidates_and_8_saved_records_verified",
        "page": 28,
        "locale": "pt-BR",
        "pdf": pdf_path.relative_to(ROOT).as_posix(),
        "pages": document.page_count,
        "pageSizePt": actual_size,
        "selectableCharacters": len(extracted),
        "replacementCharacters": replacement_count,
        "privateUseCharacters": private_use_count,
        "embeddedImageObjects": len(page.get_images(full=True)),
        "verifiedCandidateCount": len(proposal["candidates"]),
        "verifiedPreservedHumanRecordCount": len(proposal["preservedHumanRecords"]),
        "missingUnitKeys": [],
        "snapshotBlankedUnitKeys": [],
        "printCopyfitOverflowCount": len(printed_overflows),
        "viewerSubpixelExcess": viewer_subpixel_excess,
        "legacyEditorKeyMismatchPresent": True,
        "diagnosticSnapshot": SNAPSHOT.relative_to(ROOT).as_posix(),
        "payloadWrites": 0,
    }
    RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
