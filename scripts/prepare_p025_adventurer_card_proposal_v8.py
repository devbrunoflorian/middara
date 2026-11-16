"""Build p.25 v8 diagnostic snapshot with failed units blanked as a whole."""

from __future__ import annotations

import copy
import hashlib
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROOF_BASE = ROOT / "output/proofs/translation-readiness-2026-10-16"
V7_PROOF = PROOF_BASE / "p025-adventurer-card-proposal-v7"
V8_PROOF = PROOF_BASE / "p025-adventurer-card-proposal-v8"
V7_JSON = ROOT / "docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v7.json"
V8_JSON = ROOT / "docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v8.json"
V7_MD = ROOT / "docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v7.md"
V8_MD = ROOT / "docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v8.md"
CANONICAL_DOM = ROOT / "apps/web/public/pages/page_025/page_025_dom.json"

FAILED_UNIT_IDS = {
    "p25-block-84-localized-body-v1",
    "p25-block-86-localized-legend-v1",
    "p25-block-87-localized-body-v1",
}


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize(value: str) -> str:
    return " ".join(value.split())


def main() -> None:
    for path in (V8_PROOF, V8_JSON, V8_MD):
        if path.exists():
            raise FileExistsError(f"Refusing to overwrite existing v8 artifact: {path}")
    if not V7_PROOF.is_dir() or not V7_JSON.is_file() or not V7_MD.is_file():
        raise FileNotFoundError("Complete p.25 v7 proposal and proof are required.")

    v7_hashes = read_json(V7_PROOF / "source-hashes-v2.json")
    canonical_before = sha256(CANONICAL_DOM)
    if canonical_before != v7_hashes["page_025_dom.json"]:
        raise ValueError("Canonical p.25 DOM differs from the v7 source receipt.")

    shutil.copytree(V7_PROOF / "snapshot", V8_PROOF / "snapshot")
    dom_path = V8_PROOF / "snapshot/pages/page_025/page_025_dom.json"
    dom = read_json(dom_path)
    proposal = copy.deepcopy(read_json(V7_JSON))
    assert isinstance(dom, dict) and isinstance(proposal, dict)
    candidates = proposal["candidates"]
    failed = [candidate for candidate in candidates if candidate.get("sourceUnitId") in FAILED_UNIT_IDS]
    if {candidate["sourceUnitId"] for candidate in failed} != FAILED_UNIT_IDS:
        raise ValueError("The expected three p.25 failed units were not found exactly.")

    blanked_units: list[dict[str, object]] = []
    blocks = {block["id"]: block for block in dom.get("blocks", [])}
    for candidate in failed:
        source_unit_id = candidate["sourceUnitId"]
        block_id = candidate["sourceBlockId"]
        block = blocks.get(block_id)
        if not block:
            raise ValueError(f"Missing copied snapshot block {block_id}.")
        unit = next(
            (unit for unit in block.get("typographicSpanUnits", []) if unit.get("id") == source_unit_id),
            None,
        )
        if not unit:
            raise ValueError(f"Missing exact source span unit {source_unit_id}.")

        lines = {line["id"]: line for line in block.get("lines", [])}
        original_spans: list[dict[str, object]] = []
        for ref in unit.get("spanRefs", []):
            line_id, span_index = ref.rsplit(":", 1)
            span = lines[line_id]["spans"][int(span_index)]
            original_spans.append({"ref": ref, "text": span.get("text", ""), "bbox": span.get("bbox")})
        original_text = "".join(str(span["text"]) for span in original_spans)
        if normalize(original_text) != normalize(candidate["sourceText"]):
            raise ValueError(f"Source text for {source_unit_id} does not match its exact unit refs.")
        if not original_text.strip():
            raise ValueError(f"Refusing to blank already-empty unit {source_unit_id}.")

        for ref in unit.get("spanRefs", []):
            line_id, span_index = ref.rsplit(":", 1)
            lines[line_id]["spans"][int(span_index)]["text"] = ""

        candidate["diagnosticRendering"] = "blank_whole_unit_diagnostic_only"
        candidate["status"] = "full_proposal_preserved_whole_unit_blank_in_v8_diagnostic_pending_structure_repair_and_human_review"
        blanked_units.append({
            "page": 25,
            "blockId": block_id,
            "unitId": source_unit_id,
            "spanKey": candidate["spanKey"],
            "spanRefs": unit["spanRefs"],
            "sourceText": candidate["sourceText"],
            "proposalText": candidate["proposalText"],
            "blankedSpans": original_spans,
            "diagnosticTreatment": "Set only copied snapshot DOM text for every exact unit span to an empty string.",
            "canonicalDomChanged": False,
            "payloadWritten": False,
        })

    if len(blanked_units) != 3:
        raise ValueError("Expected to blank exactly three complete units.")
    write_json(dom_path, dom)

    snapshot = read_json(V8_PROOF / "snapshot/snapshot.json")
    expected_blank_keys = {unit["spanKey"] for unit in blanked_units}
    if any(record.get("spanKey") in expected_blank_keys for record in snapshot.get("translations", [])):
        raise ValueError("A blank unit must not be stored as an empty PT-BR translation record.")
    if len(snapshot.get("translations", [])) != 13:
        raise ValueError("Expected nine active proposals and four preserved human records.")

    blanking_receipt = {
        "status": "prepared_exact_whole_unit_blanks_in_isolated_snapshot",
        "page": 25,
        "sourceProposal": "page-025-adventurer-card-proposal-2026-10-16-v7.json",
        "newProposal": V8_JSON.relative_to(ROOT).as_posix(),
        "snapshot": "snapshot/snapshot.json",
        "snapshotDom": "snapshot/pages/page_025/page_025_dom.json",
        "blankedUnitCount": len(blanked_units),
        "blankedUnits": blanked_units,
        "preservedSnapshotTranslationCount": len(snapshot["translations"]),
        "payloadWrites": 0,
        "canonicalChanges": 0,
        "sourceHashes": {
            "canonicalDomBefore": canonical_before,
            "canonicalDomAfter": sha256(CANONICAL_DOM),
            "sourceSnapshotDom": v7_hashes["snapshotDomSha256"],
            "diagnosticSnapshotDom": sha256(dom_path),
            "diagnosticSnapshot": sha256(V8_PROOF / "snapshot/snapshot.json"),
        },
    }
    write_json(V8_PROOF / "diagnostic-blanking-v8.json", blanking_receipt)

    for exception in proposal.get("technicalExceptions", []):
        if exception.get("id") in {"p25-block-84-body", "p25-block-86-legend", "p25-block-87-body"}:
            exception["requiredAction"] = (
                "Repair the occurrence-specific source references and Admin selection boundary, then rerun Viewer, Editor and PDF checks. "
                "Until then, keep the whole unit blank only in the isolated PT-BR diagnostic; do not show source-English fallback or partial PT-BR."
            )
            exception["diagnosticRendering"] = "blank_whole_unit_diagnostic_only"
            exception.setdefault("evidence", []).append("output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v8/diagnostic-blanking-v8.json")

    proposal["proposalId"] = "page-025-adventurer-card-2026-10-16-v8"
    proposal["version"] = 8
    proposal["status"] = "diagnostic_v8_prepared_pending_viewer_editor_copyfit_v3_and_pdf_verification"
    proposal["counts"]["diagnosticBlankUnits"] = 3
    proposal["sourceReview"]["fidelityNote"] = (
        "The official raster, English Viewer and one-page English export were compared. The complete Nightingale card remains printed in background.webp. "
        "Nine editable proposals remain visible for PT-BR verification; three failed units are blank as whole units only in the isolated v8 diagnostic, "
        "with full source and proposal text preserved. Four saved human translations are unchanged."
    )
    proposal["diagnosticFailurePolicy"] = (
        "For this PT-BR diagnostic, render a failed unit wholly blank in the isolated snapshot; never display its English fallback or partial PT-BR. "
        "Preserve complete source and proposal text in this file. Do not persist the blank or alter the English Viewer, human translations or canonical DOM."
    )
    proposal["validation"] = {
        "viewerEditorReceipt": "output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v8/viewer-editor-receipt-v8.json",
        "pdfReceipt": "output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v8/pdf-verification-v8.json",
        "blankingReceipt": "output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v8/diagnostic-blanking-v8.json",
        "pdfSnapshotTranslationRecords": len(snapshot["translations"]),
        "blankedWholeUnitCount": len(blanked_units),
        "payloadWrites": 0,
        "canonicalAssetsUnchanged": True,
    }
    proposal.setdefault("revisionHistory", []).append({
        "from": "v7",
        "change": "Replaced three disallowed source-English diagnostic fallbacks with exact whole-unit blanks in the copied v8 snapshot.",
        "preserved": "All complete source and PT-BR candidate text, four saved human records, and the original v7 proof.",
    })
    write_json(V8_JSON, proposal)

    markdown = V7_MD.read_text(encoding="utf-8")
    markdown = markdown.replace("proposal PT-BR v7", "proposal PT-BR v8")
    markdown = markdown.replace("proposal v7", "proposal v8")
    markdown = markdown.replace("diagnostic v7", "diagnostic v8")
    markdown = markdown.replace(
        "**Estado:** 12 unidades editáveis têm proposta; 9/9 unidades ativas passaram Viewer, Editor read-only e PDF de uma página. Três unidades permanecem em fallback inglês por duplicação/colisão confirmada e incompatibilidade de seleção no Editor. Quatorze grupos impressos no card aguardam localização de arte. Quatro traduções humanas (IDs 320–323) foram mantidas; zero writes no Payload e nenhuma alteração canônica.",
        "**Estado:** 12 unidades editáveis têm proposta; 9/9 unidades ativas passaram Viewer, Editor read-only e PDF de uma página. As três unidades com falha ficam integralmente em branco apenas no diagnóstico v8; suas fontes e propostas completas permanecem preservadas. Quatorze grupos impressos no card aguardam localização de arte. Quatro traduções humanas (IDs 320–323) foram mantidas; zero writes no Payload e nenhuma alteração canônica.",
    )
    markdown = markdown.replace(
        "As outras três traduções completas permanecem recuperáveis no JSON, mas o diagnóstico usa o texto-fonte inglês até a correção das referências de ocorrência e da seleção no Admin.",
        "As três traduções completas permanecem recuperáveis no JSON; seus spans de origem ficam em branco como unidades inteiras somente no DOM copiado do snapshot até a correção das referências de ocorrência e da seleção no Admin.",
    )
    markdown = markdown.replace("## Unidades mantidas em inglês no diagnóstico", "## Unidades em branco no diagnóstico v8")
    markdown = markdown.replace(
        "Os três fallbacks estruturais permanecem em inglês.",
        "As três unidades bloqueadas ficam integralmente em branco apenas no snapshot PT-BR; o background original permanece visível.",
    )
    markdown = markdown.replace("source_english_fallback", "blank_whole_unit_diagnostic_only")
    markdown = markdown.replace(
        "Keep source English in the diagnostic while unresolved.",
        "Keep the whole unit blank only in the isolated diagnostic while unresolved; do not show source-English fallback or partial PT-BR.",
    )
    if "fallback inglês" in markdown or "texto-fonte inglês" in markdown or "source_english_fallback" in markdown:
        raise ValueError("The v8 proposal Markdown still describes an English fallback.")
    V8_MD.write_text(markdown, encoding="utf-8")

    if sha256(CANONICAL_DOM) != canonical_before:
        raise ValueError("Canonical p.25 DOM changed during diagnostic preparation.")
    print(json.dumps({
        "status": blanking_receipt["status"],
        "blankedUnits": [unit["unitId"] for unit in blanked_units],
        "snapshotTranslations": len(snapshot["translations"]),
        "proposalJson": V8_JSON.relative_to(ROOT).as_posix(),
        "proposalMarkdown": V8_MD.relative_to(ROOT).as_posix(),
        "proofDir": V8_PROOF.relative_to(ROOT).as_posix(),
        "payloadWrites": 0,
        "canonicalChanges": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
