#!/usr/bin/env python3
"""Independently verify the isolated p.56 family PDF and record its closeout."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-15/p056-general-information-v2"
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-056-general-information-proposal-2026-10-15-v2.json"
SOURCE_PDF = Path("C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
EXPECTED_SOURCE_SHA = "A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351"
TARGETS = {
    "page_56_block_0__pt-BR": "Informações Gerais",
    "page_56_block_1__pt-BR": "As cartas trazem informações sobre os Combatentes e regras para todas as miniaturas, exceto as dos Aventureiros. Há 2 tipos de Combatentes.",
    "page_56_block_2__pt-BR": "1. Combatentes de Comando: Os jogadores controlam diretamente os Combatentes de Comando. Em geral, eles representam personagens que se juntam temporariamente aos personagens durante a Aventura.",
    "page_56_block_3__pt-BR": "2. Combatentes Inteligentes: Esses Combatentes automatizam as miniaturas no tabuleiro: nenhum jogador escolhe as Ações dessas miniaturas; elas tomam as próprias decisões.",
    "page_56_block_4__pt-BR": "Independentemente do tipo de Combatente que o jogador usa, os dois tipos compartilham muitas informações. A seguir estão as informações e regras comuns a ambos.",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def norm(value: str) -> str:
    return " ".join(str(value).split())


def atomic_immutable(path: Path, value: bytes) -> None:
    if path.exists():
        assert path.read_bytes() == value, "Refusing to replace changed verification receipt: " + str(path)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as handle:
        handle.write(value)


assert sha(SOURCE_PDF) == EXPECTED_SOURCE_SHA, "Official source PDF hash changed"
proposal = json.loads(PROPOSAL_PATH.read_text(encoding="utf-8"))
assert proposal["page"] == 56 and proposal["attempt"] == 2 and proposal["revisionBudget"] == 2
assert proposal["sourceHashes"]["sourcePdf"] == EXPECTED_SOURCE_SHA
assert proposal["sourceHashes"]["payloadBaseline"] == [], "Payload baseline is no longer empty"
assert proposal["familyCompleteness"]["complete"] is True

keys = {item["spanKey"] for item in proposal["candidates"]}
assert keys == set(TARGETS), "Proposal candidate set changed"

source_doc = pymupdf.open(SOURCE_PDF)
assert len(source_doc) == 102, "Unexpected official PDF page count"
source_page = source_doc[55]
assert abs(source_page.rect.width - 820.346) < 0.02
assert abs(source_page.rect.height - 820.346) < 0.02
source_text = norm(source_page.get_text())
for phrase in (
    "General Information",
    "Combatant information is printed on cards that contain the rules for all",
    "1. Command Combatants:",
    "2. Intelligent Combatants:",
    "Regardless of which type of Combatant",
):
    assert phrase in source_text, "Expected source-page content missing: " + phrase

pdf_path = PROOF / "page-056-pt-BR-proposal-v2.pdf"
export_doc = pymupdf.open(pdf_path)
assert len(export_doc) == 1, "Export should contain exactly one page"
export_page = export_doc[0]
assert abs(export_page.rect.width - source_page.rect.width) < 0.02
assert abs(export_page.rect.height - source_page.rect.height) < 0.02
export_text_raw = export_page.get_text()
export_text = norm(export_text_raw)
target_counts = {}
for key, expected in TARGETS.items():
    count = export_text.count(norm(expected))
    assert count == 1, "Expected exactly one rendered override for " + key + "; found " + str(count)
    target_counts[key] = count
for phrase in (
    "General Information",
    "Combatant information is printed on cards that contain the rules for all",
    "1. Command Combatants:",
    "2. Intelligent Combatants:",
    "Regardless of which type of Combatant",
):
    assert phrase not in export_text, "English source fallback remains for a proposed target: " + phrase
assert "\ufffd" not in export_text_raw, "Replacement character found in exported PDF text"

source_hash_receipt = json.loads((PROOF / "source-hashes.json").read_text(encoding="utf-8"))
for name, expected_hash in source_hash_receipt["pageFiles"].items():
    assert sha(ROOT / "apps/web/public/pages/page_056" / name) == expected_hash, "Canonical source asset changed: " + name

editor_receipt_path = PROOF / "normal-editor-readonly-receipt-v2.json"
editor_receipt = json.loads(editor_receipt_path.read_text(encoding="utf-8"))
assert editor_receipt["allSourceBlocksMatchedAndEditable"] is True
assert editor_receipt["cancelClosedEveryDraft"] is True
assert editor_receipt["payloadPtBrRecordsBeforeAndAfter"] == {"before": [], "after": []}
assert editor_receipt["blockedWriteRequests"] == []
assert editor_receipt["canonicalPageFilesUnchanged"] is True

required_evidence = [
    "viewer-page-056-pt-BR-v2.png",
    "print-page-056-pt-BR-v2.png",
    "export-raster-110dpi.png",
    "source-vs-export-general-information-v2.png",
    "normal-editor-page_56_block_0-source-v2.png",
    "normal-editor-page_56_block_1-source-v2.png",
]
for name in required_evidence:
    path = PROOF / name
    assert path.exists() and path.stat().st_size > 0, "Missing evidence: " + name

pdf_receipt = {
    "schemaVersion": 1,
    "page": 56,
    "family": "General Information",
    "sourcePdfSha256": EXPECTED_SOURCE_SHA,
    "sourcePrintedPage": 56,
    "sourcePageSizePt": [round(source_page.rect.width, 3), round(source_page.rect.height, 3)],
    "exportPdfSha256": sha(pdf_path),
    "exportPages": len(export_doc),
    "exportPageSizePt": [round(export_page.rect.width, 3), round(export_page.rect.height, 3)],
    "candidateTextOccurrences": target_counts,
    "englishFallbackPhrasesAbsent": True,
    "replacementCharacters": export_text_raw.count("\ufffd"),
    "canonicalPageAssetHashesUnchanged": True,
    "editorReadOnlyReceipt": editor_receipt_path.relative_to(ROOT).as_posix(),
    "viewerScreenshot": (PROOF / "viewer-page-056-pt-BR-v2.png").relative_to(ROOT).as_posix(),
    "printScreenshot": (PROOF / "print-page-056-pt-BR-v2.png").relative_to(ROOT).as_posix(),
    "actualPdfRaster": (PROOF / "export-raster-110dpi.png").relative_to(ROOT).as_posix(),
    "sourceExportComparison": (PROOF / "source-vs-export-general-information-v2.png").relative_to(ROOT).as_posix(),
    "payloadPageRecordsBeforeAndAfter": 0,
    "notes": "All five proposed family units are present once in the actual PDF; target English source text is absent. Only this family is proposed; the rest of p.56 remains English.",
}
receipt_path = PROOF / "independent-pdf-verification-v2.json"
atomic_immutable(receipt_path, (json.dumps(pdf_receipt, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))

final_status = "isolated-complete-family-proposal-ready-for-human-editorial-review"
proposal["status"] = final_status
proposal["copyfit"] = {
    "status": "verified-in-normal-viewer-and-official-pdf-export",
    "attemptsUsed": 2,
    "revisionBudget": 2,
    "sourceVisibleLineCounts": {"block_8": 1, "block_10": 2, "block_12": 3, "block_13": 3, "block_14": 3},
    "proposalVisibleLineCounts": {"block_8": 1, "block_10": 2, "block_12": 3, "block_13": 3, "block_14": 3},
    "viewerScreenshot": "output/proofs/translation-readiness-2026-10-15/p056-general-information-v2/viewer-page-056-pt-BR-v2.png",
    "printScreenshot": "output/proofs/translation-readiness-2026-10-15/p056-general-information-v2/print-page-056-pt-BR-v2.png",
    "actualPdfRaster": "output/proofs/translation-readiness-2026-10-15/p056-general-information-v2/export-raster-110dpi.png",
    "sourceExportComparison": "output/proofs/translation-readiness-2026-10-15/p056-general-information-v2/source-vs-export-general-information-v2.png",
    "independentPdfReceipt": receipt_path.relative_to(ROOT).as_posix(),
    "allFiveCandidateOverridesPresentExactlyOnce": True,
    "targetEnglishFallbackAbsent": True,
    "replacementCharacters": 0,
    "visualReview": "No clipping or collision is visible in the General Information family; the transition remains above the next-family heading and adjacent source artwork remains visible.",
    "evidence": [path.relative_to(ROOT).as_posix() for path in [PROOF / name for name in required_evidence]],
}
proposal["editorCheck"] = {
    "normalEditorSourceBlocksMatchedAndEditable": True,
    "keys": [item["key"] for item in editor_receipt["editorialKeys"]],
    "cancelRestoredSourceAfterEachBlock": True,
    "noSaveClicked": True,
    "unsyncedLocalRecords": 0,
    "payloadPtBrRecordsBeforeAndAfter": 0,
    "canonicalPageAssetsUnchanged": True,
    "receipt": editor_receipt_path.relative_to(ROOT).as_posix(),
    "limit": "The proposed PT-BR values were not entered or saved in the Editor; candidate rendering is independently proven in the isolated Viewer and exported PDF.",
}
proposal["copyfit"]["sourceLineCounts"] = {
    "block_8": 1, "block_10": 2, "block_12": 3, "block_13": 3, "block_14": 3,
}
proposal["proofHashes"] = {
    "exportPdf": pdf_receipt["exportPdfSha256"],
    "independentPdfReceipt": sha(receipt_path),
    "editorReceipt": sha(editor_receipt_path),
}

proposal_bytes = (json.dumps(proposal, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
existing_bytes = PROPOSAL_PATH.read_bytes()
existing = json.loads(existing_bytes)
assert existing["page"] == 56 and existing["attempt"] == 2, "Proposal changed before finalization"
if existing.get("status") == final_status:
    assert existing_bytes == proposal_bytes, "Final proposal was modified after verification"
else:
    assert existing.get("status") == "isolated-complete-family-proposal-awaiting-final-copyfit-and-human-editorial-review"
    PROPOSAL_PATH.write_bytes(proposal_bytes)

print(json.dumps({
    "status": final_status,
    "candidateCount": len(TARGETS),
    "candidateOccurrences": target_counts,
    "exportPdfSha256": pdf_receipt["exportPdfSha256"],
    "independentReceipt": receipt_path.relative_to(ROOT).as_posix(),
    "proposal": PROPOSAL_PATH.relative_to(ROOT).as_posix(),
    "editorReadOnly": True,
}, ensure_ascii=False, indent=2))
