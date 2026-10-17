#!/usr/bin/env python3
"""Verify the isolated p.32 PT-BR PDF contains every proposed text unit and preserved Example."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PROOF_DIR = ROOT / "output/proofs/translation-readiness-2026-10-16/p032-full-page-v1"
PDF_PATH = PROOF_DIR / "page-032-pt-BR-v1.pdf"
PROPOSAL_PATH = PROOF_DIR / "proposal-candidates.json"
SNAPSHOT_PATH = PROOF_DIR / "snapshot/snapshot.json"
SOURCE_HASHES_PATH = PROOF_DIR / "source-hashes.json"
RECEIPT_PATH = PROOF_DIR / "pdf-readonly-receipt-v1.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def normalize(value: str) -> str:
    value = re.sub(r"\[\[[^\]]+\]\]", " ", value)
    value = value.replace("\ufffc", " ").replace("\ufffd", " ")
    return re.sub(r"\s+", " ", value).strip()


proposal = json.loads(PROPOSAL_PATH.read_text(encoding="utf-8"))
snapshot = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
source_hashes = json.loads(SOURCE_HASHES_PATH.read_text(encoding="utf-8"))
with pymupdf.open(PDF_PATH) as document:
    assert len(document) == 1, f"Expected one exported page, got {len(document)}"
    page = document[0]
    extracted = normalize(page.get_text("text"))
    media_box_pt = [round(page.rect.width, 6), round(page.rect.height, 6)]

checks = []
for candidate in proposal["candidates"]:
    expected = normalize(candidate["proposalText"])
    checks.append({"spanKey": candidate["spanKey"], "textPresent": expected in extracted})

example_key = "page_32_unit_p32-discipline-levels-example__pt-BR"
example = next(row for row in snapshot["translations"] if row["spanKey"] == example_key)
example_text = normalize("".join(segment.get("text", "") for segment in example["data"]["segments"]))
example_present = example_text in extracted

assert all(item["textPresent"] for item in checks), [item for item in checks if not item["textPresent"]]
assert example_present, "The pre-existing human Example text is missing from the PDF."

receipt = {
    "status": "passed-isolated-pdf-text-presence-and-page-box-check",
    "page": 32,
    "locale": "pt-BR",
    "pdf": str(PDF_PATH.relative_to(ROOT)).replace("\\", "/"),
    "pdfSha256": sha256(PDF_PATH),
    "proposalSha256": sha256(PROPOSAL_PATH),
    "snapshotSha256": sha256(SNAPSHOT_PATH),
    "sourcePdfSha256": source_hashes["sourcePdf"],
    "pageCount": 1,
    "mediaBoxPt": media_box_pt,
    "candidateCount": len(checks),
    "candidatesPresent": sum(item["textPresent"] for item in checks),
    "checks": checks,
    "preservedExample": {"spanKey": example_key, "textPresent": example_present},
    "extractedTextLength": len(extracted),
}
RECEIPT_PATH.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(receipt, ensure_ascii=False, indent=2))
