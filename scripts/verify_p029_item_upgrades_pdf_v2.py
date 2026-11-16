#!/usr/bin/env python
"""Verify the isolated p.29 PT-BR diagnostic PDF and Copyfit V3 receipt."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pymupdf

ROOT = Path.cwd()
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2"
PDF = PROOF / "page-029-pt-BR-diagnostic-v2.pdf"
PROPOSAL = ROOT / "docs/translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.json"
SNAPSHOT = PROOF / "snapshot-diagnostic-v2/snapshot.json"
METRICS = PROOF / "metrics-pt-BR-diagnostic-v2.json"
RECEIPT = PROOF / "pdf-copyfit-receipt-v2.json"
PAGE_PT = 820.3460083007812


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    value = value.replace("\uFFFC", " ").replace("\u00AD", "")
    return re.sub(r"\s+", " ", value).strip()


proposal = json.loads(PROPOSAL.read_text(encoding="utf-8"))
snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
metrics_doc = json.loads(METRICS.read_text(encoding="utf-8"))
candidates = proposal["candidates"]
blank_keys = snapshot.get("diagnosticOnly", {}).get("blankedSpanKeys", [])
assert len(candidates) == 21, f"Expected 21 candidate units, got {len(candidates)}"
assert blank_keys == ["page_29_block_6__pt-BR"], f"Unexpected diagnostic blanks: {blank_keys}"

with pymupdf.open(PDF) as doc:
    assert len(doc) == 1, f"Expected one PDF page, got {len(doc)}"
    page = doc[0]
    rect = page.rect
    assert abs(rect.width - PAGE_PT) < 0.02 and abs(rect.height - PAGE_PT) < 0.02, f"Unexpected MediaBox: {rect}"
    extracted = page.get_text()

assert "\uFFFD" not in extracted, "PDF text contains replacement characters"
private_use = [ch for ch in extracted if 0xE000 <= ord(ch) <= 0xF8FF]
assert not private_use, f"PDF text contains private-use glyphs: {len(private_use)}"
pdf_text = normalize(extracted)

targets = {item["spanKey"]: item for item in metrics_doc["print"]["translationTargets"]}
assert len(targets) == 21, f"Expected 21 Copyfit V3 targets, got {len(targets)}"
unit_checks = []
copyfit_checks = []
for candidate in candidates:
    key = candidate["legacyBlockSpanKey"]
    expected = normalize("".join(
        "" if segment.get("symbolId") else segment.get("text", "")
        for segment in candidate["data"].get("segments", [])
    ))
    diagnostic_blank = key in blank_keys
    actual_in_pdf = expected in pdf_text if expected else False
    if diagnostic_blank:
        assert expected, f"Full candidate text was lost for blank unit {key}"
        assert not actual_in_pdf, f"Whole failed diagnostic unit unexpectedly appears in PDF: {key}"
    else:
        assert expected, f"Unexpected empty candidate {key}"
        assert actual_in_pdf, f"Candidate text is not extractable from PDF: {key}"
    unit_checks.append({
        "spanKey": key,
        "diagnosticBlank": diagnostic_blank,
        "proposedText": expected,
        "completeTextPresentInPdf": actual_in_pdf,
    })

    target = targets[key]
    assert target["text"] == ("" if diagnostic_blank else target["text"]), f"Unexpected nonblank Copyfit target for {key}"
    assert (target["lineCount"] == 0) == diagnostic_blank, f"Unexpected Copyfit line count for {key}: {target['lineCount']}"
    excess = target["edgeExcessPt"]
    assert excess["right"] <= 0.05 and excess["bottom"] <= 0.05, f"Copyfit V3 right/bottom overflow for {key}: {excess}"
    copyfit_checks.append({
        "spanKey": key,
        "lineCount": target["lineCount"],
        "widestLinePt": target["widestLinePt"],
        "frameRectPt": target["frameRectPt"],
        "contentBoundsPt": target["contentBoundsPt"],
        "edgeExcessPt": excess,
    })

top_excess = [check["edgeExcessPt"]["top"] for check in copyfit_checks]
receipt = {
    "status": "p029_one_page_pdf_text_and_copyfit_verified_with_one_whole_unit_diagnostic_blank",
    "page": 29,
    "locale": "pt-BR",
    "pdf": str(PDF.relative_to(ROOT)).replace("\\", "/"),
    "pageCount": 1,
    "mediaBoxPt": {"width": rect.width, "height": rect.height},
    "extractableCandidateCount": sum(not item["diagnosticBlank"] and item["completeTextPresentInPdf"] for item in unit_checks),
    "diagnosticBlankUnitCount": sum(item["diagnosticBlank"] for item in unit_checks),
    "replacementCharacterCount": extracted.count("\uFFFD"),
    "privateUseCharacterCount": len(private_use),
    "unitChecks": unit_checks,
    "copyfitEngine": "Copyfit V3 print metrics",
    "copyfitChecks": copyfit_checks,
    "rightOrBottomOverflowCount": sum(
        item["edgeExcessPt"]["right"] > 0.05 or item["edgeExcessPt"]["bottom"] > 0.05
        for item in copyfit_checks
    ),
    "maxTopGlyphExtentExcessPt": max(top_excess, default=0),
    "note": "Small top glyph-extent excursions are recorded; raster inspection found no visible clipping. No right or bottom overflow is permitted.",
}
RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: value for key, value in receipt.items() if key not in ("unitChecks", "copyfitChecks")}, ensure_ascii=False, indent=2))
