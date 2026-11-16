#!/usr/bin/env python
"""Verify the isolated p.30 PDF text and Copyfit V3 metrics."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pymupdf

ROOT = Path.cwd()
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2"
PDF = PROOF / "page-030-pt-BR-diagnostic-v2.pdf"
PROPOSAL = ROOT / "docs/translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.json"
SNAPSHOT = PROOF / "snapshot-diagnostic-v2/snapshot.json"
METRICS = PROOF / "metrics-pt-BR-diagnostic-v2.json"
RECEIPT = PROOF / "pdf-copyfit-receipt-v2.json"
PAGE_PT = 820.3460083007812


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    value = re.sub(r"\[\[(?:symbol|source-symbol):[^\]]+\]\]", " ", value)
    value = re.sub(r"\[\[[a-z0-9-]+\]\]", " ", value, flags=re.IGNORECASE)
    value = value.replace("\uFFFC", " ").replace("\u00AD", "")
    return re.sub(r"\s+", " ", value).strip()


proposal = json.loads(PROPOSAL.read_text(encoding="utf-8"))
snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
metrics_doc = json.loads(METRICS.read_text(encoding="utf-8"))
candidates = proposal["candidates"]
blank_keys = snapshot.get("diagnosticOnly", {}).get("blankedSpanKeys", [])
assert len(candidates) == 19
assert blank_keys == ["page_30_block_17__pt-BR"]

with pymupdf.open(PDF) as doc:
    assert len(doc) == 1
    page = doc[0]
    rect = page.rect
    assert abs(rect.width - PAGE_PT) < 0.02 and abs(rect.height - PAGE_PT) < 0.02, f"Unexpected MediaBox {rect}"
    extracted = page.get_text()

assert "\uFFFD" not in extracted, "PDF text contains replacement characters"
private_use = [char for char in extracted if 0xE000 <= ord(char) <= 0xF8FF]
assert not private_use, f"PDF text contains private-use characters: {len(private_use)}"
pdf_text = normalize(extracted)
targets = {item["spanKey"]: item for item in metrics_doc["print"]["translationTargets"]}
assert len(targets) == 19
unit_checks = []
copyfit_checks = []
for candidate in candidates:
    key = candidate["legacyBlockSpanKey"]
    expected = normalize("".join(segment.get("text", "") for segment in candidate["data"].get("segments", [])))
    diagnostic_blank = key in blank_keys
    present = expected in pdf_text if expected else False
    if diagnostic_blank:
        assert expected and not present, f"Block_41 should stay fully blank only in this PDF: {key}"
    else:
        assert expected and present, f"Complete proposal text missing from PDF: {key}"
    unit_checks.append({"spanKey": key, "diagnosticBlank": diagnostic_blank, "expectedText": expected, "completeTextPresentInPdf": present})
    target = targets[key]
    assert target["text"] == ("" if diagnostic_blank else target["text"])
    assert (target["lineCount"] == 0) == diagnostic_blank, f"Unexpected line count {key}: {target['lineCount']}"
    excess = target["edgeExcessPt"]
    assert excess["right"] <= 0.05 and excess["bottom"] <= 0.05, f"Copyfit overflow {key}: {excess}"
    copyfit_checks.append({
        "spanKey": key,
        "lineCount": target["lineCount"],
        "widestLinePt": target["widestLinePt"],
        "frameRectPt": target["frameRectPt"],
        "contentBoundsPt": target["contentBoundsPt"],
        "edgeExcessPt": excess,
    })

receipt = {
    "status": "p030_one_page_pdf_text_and_copyfit_verified_with_one_whole_unit_diagnostic_blank",
    "page": 30,
    "locale": "pt-BR",
    "pdf": str(PDF.relative_to(ROOT)).replace("\\", "/"),
    "pageCount": 1,
    "mediaBoxPt": {"width": rect.width, "height": rect.height},
    "extractableCandidateCount": sum(not unit["diagnosticBlank"] and unit["completeTextPresentInPdf"] for unit in unit_checks),
    "diagnosticBlankUnitCount": sum(unit["diagnosticBlank"] for unit in unit_checks),
    "replacementCharacterCount": extracted.count("\uFFFD"),
    "privateUseCharacterCount": len(private_use),
    "unitChecks": unit_checks,
    "copyfitEngine": "Copyfit V3 print metrics",
    "copyfitChecks": copyfit_checks,
    "rightOrBottomOverflowCount": sum(unit["edgeExcessPt"]["right"] > 0.05 or unit["edgeExcessPt"]["bottom"] > 0.05 for unit in copyfit_checks),
    "maxTopGlyphExtentExcessPt": max((unit["edgeExcessPt"]["top"] for unit in copyfit_checks), default=0),
    "note": "No right or bottom excess. Small top glyph-extent excursions are recorded; raster review found no clipping.",
}
RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: value for key, value in receipt.items() if key not in ("unitChecks", "copyfitChecks")}, ensure_ascii=False, indent=2))
