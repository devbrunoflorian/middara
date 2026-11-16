#!/usr/bin/env python3
"""Verify the isolated p.26 PT-BR proposal PDF and its diagnostic blank region."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PROPOSAL = ROOT / "docs/translations/proposals/page-026-item-card-types-proposal-2026-10-16-v1.json"
SNAPSHOT = ROOT / "output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1/snapshot-diagnostic-v5/snapshot.json"
RECEIPT = ROOT / "output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1/pdf-verification-v1.json"


def normalized(value: str) -> str:
    return " ".join(value.split())


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify_p026_item_card_types_pdf_v1.py <pdf>")
    pdf_path = Path(sys.argv[1]).resolve()
    proposal = json.loads(PROPOSAL.read_text(encoding="utf-8"))
    json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    document = pymupdf.open(pdf_path)
    assert document.page_count == 1, f"Expected one page, got {document.page_count}"
    page = document[0]
    expected_size = [820.346, 820.346]
    actual_size = [round(page.rect.width, 3), round(page.rect.height, 3)]
    assert all(abs(actual_size[i] - expected_size[i]) <= 0.5 for i in range(2)), actual_size

    extracted = page.get_text()
    normalized_extracted = normalized(extracted)
    missing_candidate_text = [
        candidate["spanKey"]
        for candidate in proposal["candidates"]
        if normalized(candidate["proposalText"]) not in normalized_extracted
    ]
    assert not missing_candidate_text, f"Missing PT-BR candidate text: {missing_candidate_text}"

    technical = proposal["technicalExceptions"][0]
    blocked_source_present = normalized(technical["sourceText"]) in normalized_extracted
    blocked_proposal_present = normalized(technical["proposedText"]) in normalized_extracted
    assert not blocked_source_present, "The blocked English body appeared in the diagnostic PDF."
    assert not blocked_proposal_present, "The blocked PT-BR body appeared in the diagnostic PDF."

    replacement_count = extracted.count("\ufffd")
    private_use_count = sum(0xE000 <= ord(char) <= 0xF8FF for char in extracted)
    assert replacement_count == 0, f"Replacement characters found: {replacement_count}"
    assert private_use_count == 0, f"Private-use characters found: {private_use_count}"

    blank_keys = [
        "page_26_unit_p26-block-478-font-size-10pt-unit-01__pt-BR",
        "page_26_unit_p26-block-478-font-size-9pt-unit-02__pt-BR",
        "page_26_unit_p26-block-478-font-size-10pt-unit-03__pt-BR",
    ]
    blank_source_fragments = [
        "Some Abilities printed on Items require Symbols to use.",
        "See section 6 of The Attack Action Pg. 41.",
    ]
    visible_blocked_fragments = [fragment for fragment in blank_source_fragments if fragment in extracted]
    assert not visible_blocked_fragments, f"English from the failed body is visible: {visible_blocked_fragments}"

    receipt = {
        "status": "passed_single_page_pdf_export_and_blocked_body_absence_check",
        "page": 26,
        "pdf": str(pdf_path.relative_to(ROOT)).replace("\\", "/"),
        "pages": document.page_count,
        "pageSizePt": actual_size,
        "selectableCharacters": len(extracted),
        "replacementCharacters": replacement_count,
        "privateUseCharacters": private_use_count,
        "embeddedImageObjects": len(page.get_images(full=True)),
        "verifiedCandidateCount": len(proposal["candidates"]) - len(missing_candidate_text),
        "candidateCount": len(proposal["candidates"]),
        "missingCandidateSpanKeys": missing_candidate_text,
        "blockedEnglishBodyAbsent": not blocked_source_present,
        "blockedProposedBodyAbsent": not blocked_proposal_present,
        "failedSpanKeys": blank_keys,
        "failedEnglishFragmentsAbsent": not visible_blocked_fragments,
        "diagnosticSnapshot": "output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1/snapshot-diagnostic-v5/snapshot.json",
        "payloadWrites": 0,
    }
    RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
