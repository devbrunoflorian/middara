#!/usr/bin/env python3
"""Verify the isolated p.27 PT-BR PDF and the three unit-level diagnostic blanks."""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PROPOSAL = ROOT / "docs/translations/proposals/page-027-item-tiers-and-types-proposal-2026-10-16-v10.json"
SNAPSHOT = ROOT / "output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1/snapshot-diagnostic-v10/snapshot.json"
RECEIPT = ROOT / "output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1/pdf-verification-v2.json"


def normalized(value: str) -> str:
    return " ".join(value.split())


def main() -> None:
    import sys

    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify_p027_item_tiers_and_types_pdf_v8.py <pdf>")

    pdf_path = Path(sys.argv[1]).resolve()
    proposal = json.loads(PROPOSAL.read_text(encoding="utf-8"))
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    assert proposal["page"] == 27 and proposal["locale"] == "pt-BR"
    assert len(proposal["candidates"]) == 30
    assert len(proposal["technicalExceptions"]) == 3

    document = pymupdf.open(pdf_path)
    assert document.page_count == 1, f"Expected one page, got {document.page_count}"
    page = document[0]
    expected_size = [820.346, 820.346]
    actual_size = [round(page.rect.width, 3), round(page.rect.height, 3)]
    assert all(abs(actual_size[i] - expected_size[i]) <= 0.5 for i in range(2)), actual_size

    extracted = page.get_text()
    normalized_extracted = normalized(extracted)
    visible_candidates = [candidate for candidate in proposal["candidates"] if candidate["diagnosticRendering"] == "proposal"]
    missing_candidate_text = [
        candidate["spanKey"]
        for candidate in visible_candidates
        if normalized(candidate["proposalText"]) not in normalized_extracted
    ]
    assert not missing_candidate_text, f"Missing visible PT-BR candidate text: {missing_candidate_text}"

    failed_candidates = [candidate for candidate in proposal["candidates"] if candidate["diagnosticRendering"] != "proposal"]
    failed_keys = [candidate["legacyBlockSpanKey"] for candidate in failed_candidates]
    assert sorted(failed_keys) == sorted(snapshot["diagnosticOnly"]["blankedSpanKeys"])
    records = {record["spanKey"]: record for record in snapshot["translations"]}
    for candidate in failed_candidates:
        record = records[candidate["legacyBlockSpanKey"]]
        assert record["language"] == "pt-BR"
        assert record["data"]["segments"] == [], f"Failed unit is not blank in the diagnostic: {candidate['spanKey']}"

    visible_failed_source = [
        candidate["spanKey"]
        for candidate in failed_candidates
        if normalized(candidate["sourceText"]) in normalized_extracted
    ]
    visible_failed_proposals = [
        candidate["spanKey"]
        for candidate in failed_candidates
        if normalized(candidate["proposalText"]) in normalized_extracted
    ]
    assert not visible_failed_source, f"Failed source fallback appears in the PDF: {visible_failed_source}"
    assert not visible_failed_proposals, f"Failed PT-BR proposal appears in the PDF: {visible_failed_proposals}"

    replacement_count = extracted.count("\ufffd")
    private_use_count = sum(0xE000 <= ord(char) <= 0xF8FF for char in extracted)
    assert replacement_count == 0, f"Replacement characters found: {replacement_count}"
    assert private_use_count == 0, f"Private-use characters found: {private_use_count}"

    receipt = {
        "status": "passed_single_page_pdf_with_three_diagnostic_blank_units",
        "page": 27,
        "locale": "pt-BR",
        "pdf": str(pdf_path.relative_to(ROOT)).replace("\\", "/"),
        "pages": document.page_count,
        "pageSizePt": actual_size,
        "selectableCharacters": len(extracted),
        "replacementCharacters": replacement_count,
        "privateUseCharacters": private_use_count,
        "embeddedImageObjects": len(page.get_images(full=True)),
        "verifiedCandidateCount": len(visible_candidates) - len(missing_candidate_text),
        "candidateCount": len(proposal["candidates"]),
        "missingCandidateSpanKeys": missing_candidate_text,
        "failedSpanKeys": failed_keys,
        "failedSourceFallbackAbsent": not visible_failed_source,
        "failedProposalTextAbsent": not visible_failed_proposals,
        "technicalExceptionCount": len(proposal["technicalExceptions"]),
        "diagnosticSnapshot": "output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1/snapshot-diagnostic-v10/snapshot.json",
        "payloadWrites": 0,
    }
    RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
