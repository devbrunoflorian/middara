#!/usr/bin/env python3
"""Record p.33 v4 diagnostic evidence without saving translations to Payload."""
from __future__ import annotations

import csv
import copy
import io
import json
import re
from pathlib import Path

import fitz


ROOT = Path.cwd()
PROOF_REL = "output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4"
PROOF = ROOT / PROOF_REL
INPUT_CANDIDATES = PROOF / "proposal-candidates.json"
V3_PROPOSAL = ROOT / "output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v3/proposal-candidates.json"
V3_EDITOR = ROOT / "output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v3/editor-check-v3.json"
PDF_PATH = PROOF / "page-033-pt-BR-v4.pdf"
PDF_RENDER = PROOF / "pdf-render-v4.png"
VIEWER = PROOF / "viewer-v4.png"
PRINT = PROOF / "print-v4.png"
METRICS = PROOF / "export-metrics-v4.json"
DOM_PATH = ROOT / "apps/web/public/pages/page_033/page_033_dom.json"
QUEUE_PATH = ROOT / "docs/translations/localization-exceptions.json"
BLOCKED_KEY = "page_33_block_22__pt-BR"


def read_text(path: Path) -> str:
    with path.open("r", encoding="utf-8", newline="") as stream:
        return stream.read()


def write_text(path: Path, value: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        stream.write(value)


def read_json(path: Path) -> dict:
    return json.loads(read_text(path))


def write_json(path: Path, value: dict) -> None:
    write_text(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def replace_once(path: Path, old: str, new: str) -> None:
    body = read_text(path)
    if new in body:
        return
    if old in body:
        write_text(path, body.replace(old, new, 1))
        return
    for eol in ("\r\n", "\n"):
        old_variant = old.replace("\n", eol)
        if old_variant in body:
            write_text(path, body.replace(old_variant, new.replace("\n", eol), 1))
            return
    raise AssertionError(f"Expected text not found in {path}: {old[:100]!r}")


required_files = [PDF_PATH, PDF_RENDER, VIEWER, PRINT, METRICS, PROOF / "snapshot/snapshot.json"]
missing = [path for path in required_files if not path.is_file()]
if missing:
    raise SystemExit("Missing p.33 v4 proof files: " + ", ".join(str(path) for path in missing))

proposal = read_json(INPUT_CANDIDATES)
proposal["version"] = 4
proposal["status"] = "18_of_19_candidates_visible_in_v4_viewer_pdf_one_whole_unit_blank_due_to_fixed_source_die_overlap_copyfit_v3_and_human_review_pending"
candidates = proposal["candidates"]
assert len(candidates) == 19, f"Expected 19 candidate records; found {len(candidates)}"
blocked = [item for item in candidates if item.get("spanKey") == BLOCKED_KEY]
assert len(blocked) == 1, f"Expected one blocked unit for {BLOCKED_KEY}"
assert blocked[0].get("diagnosticData", {}).get("segments") == [], "The whole blocked unit must be blank in the diagnostic."
assert blocked[0].get("proposalText") == "Conjuração:", "The full candidate proposal must remain preserved."

pdf = fitz.open(PDF_PATH)
assert len(pdf) == 1, f"Expected a one-page PDF, got {len(pdf)} pages"
page = pdf[0]
media_box = tuple(float(x) for x in page.rect)
assert abs(media_box[2] - 820.346) < 0.02 and abs(media_box[3] - 820.346) < 0.02, media_box
pdf_text = page.get_text()
assert "\ufffd" not in pdf_text, "PDF text extraction contains replacement characters."
private_use_count = sum(1 for char in pdf_text if 0xE000 <= ord(char) <= 0xF8FF)
assert private_use_count == 0, f"PDF text extraction contains {private_use_count} private-use characters."

# The v4 PDF and screenshots are an independent visual diagnostic. The copied
# v3 Editor receipt only verifies the default-dice semantic field, not all 19.
editor_receipt = read_json(V3_EDITOR)
assert editor_receipt.get("apiWrites") == []
assert editor_receipt.get("payloadTranslationChanges") == 0
metrics = read_json(METRICS)
assert metrics.get("page") == 33 and metrics.get("language") == "pt-BR"

validation = {
    "viewerScreenshot": f"{PROOF_REL}/viewer-v4.png",
    "printScreenshot": f"{PROOF_REL}/print-v4.png",
    "pdf": f"{PROOF_REL}/page-033-pt-BR-v4.pdf",
    "pdfRaster": f"{PROOF_REL}/pdf-render-v4.png",
    "exportMetrics": f"{PROOF_REL}/export-metrics-v4.json",
    "pageCount": 1,
    "mediaBoxPt": list(media_box),
    "extractablePdfTextCharacters": len(pdf_text),
    "replacementCharacterCount": 0,
    "privateUseCharacterCount": private_use_count,
    "visibleTextCandidatesInV4": 18,
    "wholeUnitDiagnosticBlanks": [BLOCKED_KEY],
    "copyfitV3": {
        "status": "pending",
        "reason": "The Viewer/PDF raster has been inspected, but no Copyfit V3 receipt was produced for this page.",
    },
    "editor": {
        "status": editor_receipt.get("status"),
        "verifiedSpanKeys": [editor_receipt.get("editableSpanKey")],
        "candidateFieldsChecked": 1,
        "candidateFieldsNotChecked": 18,
        "note": "The Rich Block Editor check opened and canceled the default-dice unit only; it does not certify the other candidate fields.",
    },
    "payloadWrites": 0,
    "canonicalChangesDuringV4": 0,
    "canonicalDicePatchFromV3": "Five source-traced purple-die placements are already active from the separate, receipted v3 technical patch.",
    "englishArtworkOverlays": 3,
}
proposal["counts"] = {
    "candidateUnits": 19,
    "visibleInViewerAndPdfV4": 18,
    "editorChecked": 1,
    "copyfitV3Checked": 0,
    "wholeUnitDiagnosticBlanks": 1,
    "humanReviewCandidates": 19,
    "technicalCompositionExceptions": 1,
    "savedHumanRecords": 0,
}
proposal["validation"] = validation
proposal["diagnosticExceptions"][0]["requiredAction"] = (
    "Trace the source die as a semantic placement or approve a shorter label that fits before it; then rerun Viewer, "
    "Copyfit V3, and PDF review. Do not persist the proposal while the exception is open."
)
write_json(INPUT_CANDIDATES, proposal)

docs_json = ROOT / "docs/translations/proposals/page-033-full-prose-proposal-2026-10-16-v4.json"
docs_md = ROOT / "docs/translations/proposals/page-033-full-prose-proposal-2026-10-16-v4.md"
write_json(docs_json, proposal)

markdown = """# p.33 — proposta completa de prosa PT-BR v4

**Estado:** 19 unidades propostas; 18 aparecem no Viewer e no PDF diagnóstico v4. `block_38` mantém a proposta completa `Conjuração:`, mas fica inteiro em branco apenas no snapshot porque colide com um dado roxo fixo da arte-fonte. Copyfit V3 e revisão humana continuam pendentes. Só o campo de Dados Padrão foi conferido no Rich Block Editor; isso não valida os outros 18 campos. Nenhum texto foi salvo no Payload.

## Correção do diagnóstico

A captura v3 mostrou que `Conjuração:` invade o dado roxo que permanece na posição original depois de `Casting:`. A proposta foi preservada, e a unidade inteira foi retirada do Viewer/PDF v4 diagnóstico. O fundo e o dado continuam intactos. O bloqueio será resolvido depois de rastrear semanticamente o dado ou aprovar um rótulo curto que caiba antes dele.

## Estado de composição

- O PDF v4 tem uma página de `820,346 × 820,346 pt`; a extração não encontrou caracteres de substituição nem caracteres de uso privado.
- O raster independente e a captura de impressão foram conferidos após a correção; o rótulo em colisão não aparece, e o dado-fonte permanece visível.
- Os outros 18 candidatos aparecem no diagnóstico isolado. O Editor read-only verificou somente `page_33_unit_p33-block-35-default-dice-paragraph__pt-BR`.
- **Copyfit V3 ainda pendente:** esta prova registra Viewer, exportação PDF e revisão raster. Ela não contém um recibo Copyfit V3.
- Magic Staff, Deflection Core e Quick Blow permanecem overlays em inglês conforme o escopo de arte registrado. A p.33 ainda não está integralmente localizada.
- O patch técnico v3, que registrou cinco dados roxos-fonte no sidecar, já foi aplicado e tem recibo/rollback próprios. A criação do diagnóstico v4 não alterou arquivos canônicos.

## Proposta e evidências

- Texto completo das 19 unidades: [JSON da proposta](page-033-full-prose-proposal-2026-10-16-v4.json) e [candidatos no pacote v4](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/proposal-candidates.json).
- [Viewer v4](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/viewer-v4.png), [captura de impressão](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/print-v4.png), [PDF](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/page-033-pt-BR-v4.pdf), [raster independente](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/pdf-render-v4.png), [métricas de exportação](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/export-metrics-v4.json) e [recibo de validação](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/validation-v4.json).
- Provas anteriores preservadas: [v3](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v3/visual-review-v3.md) e [proposta inicial](page-033-conviction-casting-v1.md).
"""
write_text(docs_md, markdown)

report_path = ROOT / "docs/project-progress/2026-10-16-p033-full-prose-proposal-v4.md"
report = """# 2026-10-16 — p.33: proposta completa de prosa v4

## Resultado

A proposta reúne 19 unidades editáveis. A revisão visual do v3 detectou uma colisão que havia passado despercebida: `Conjuração:` fica maior que o rótulo-fonte `Casting:` e invade o dado roxo fixo ao lado. A v4 preserva o texto completo no JSON, mas deixa `block_38` inteiro em branco apenas no Viewer/PDF diagnóstico. O dado continua no fundo em sua posição original.

Os outros 18 candidatos aparecem no Viewer e no PDF diagnóstico. O PDF tem uma página de 820,346 × 820,346 pt; a extração não contém caracteres de substituição ou de uso privado. A captura de impressão e a renderização independente foram inspecionadas depois da correção. O Editor read-only verificou somente o campo de Dados Padrão. Copyfit V3 permanece pendente, assim como a revisão editorial humana de todas as 19 propostas. Três recortes de carta continuam em inglês.

## Exceção técnica

`p033-casting-label-fixed-source-die-overlap` registra o dado roxo sem placement semântico depois do rótulo `Casting:`. Ação pendente: rastrear o vetor como placement semântico ou revisar um rótulo curto com espaço suficiente. Até lá, manter o rótulo traduzido inteiro em branco nos diagnósticos.

## Persistência e evidências

Nenhuma proposta foi gravada no Payload. A criação do diagnóstico v4 não alterou arquivos canônicos; o patch v3 dos cinco dados roxos permanece ativo com recibo de rollback separado. A fila recebeu 19 itens de revisão humana e uma exceção técnica.

- Proposta: [JSON](../translations/proposals/page-033-full-prose-proposal-2026-10-16-v4.json) e [Markdown](../translations/proposals/page-033-full-prose-proposal-2026-10-16-v4.md).
- Prova v4: [README](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/README.md), [Viewer](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/viewer-v4.png), [PDF](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/page-033-pt-BR-v4.pdf), [raster](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/pdf-render-v4.png), [métricas](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/export-metrics-v4.json) e [recibo](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4/validation-v4.json).
- Histórico v3 e patch canônico: [revisão visual](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v3/visual-review-v3.md) e [recibo de rollback](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v3/canonical-rollback/receipt.json).
"""
write_text(report_path, report)

receipt_path = PROOF / "validation-v4.json"
write_json(receipt_path, {
    "status": "p033_v4_viewer_pdf_verified_with_one_whole_unit_diagnostic_blank_copyfit_v3_pending",
    "page": 33,
    "candidateCount": 19,
    "visibleCandidateCount": 18,
    "editorCheckedCandidateCount": 1,
    "copyfitV3CheckedCandidateCount": 0,
    "diagnosticBlankSpanKeys": [BLOCKED_KEY],
    "pageCount": len(pdf),
    "mediaBoxPt": list(media_box),
    "pdfExtractableTextCharacters": len(pdf_text),
    "replacementCharacterCount": 0,
    "privateUseCharacterCount": private_use_count,
    "payloadWrites": 0,
    "canonicalChangesDuringV4": 0,
    "block38SourceBboxPt": [91.5789, 217.7640, 140.2989, 231.2440],
    "files": {
        "proposalJson": docs_json.relative_to(ROOT).as_posix(),
        "proposalMarkdown": docs_md.relative_to(ROOT).as_posix(),
        "viewerScreenshot": VIEWER.relative_to(ROOT).as_posix(),
        "printScreenshot": PRINT.relative_to(ROOT).as_posix(),
        "pdf": PDF_PATH.relative_to(ROOT).as_posix(),
        "pdfRaster": PDF_RENDER.relative_to(ROOT).as_posix(),
        "exportMetrics": METRICS.relative_to(ROOT).as_posix(),
        "editorReceipt": V3_EDITOR.relative_to(ROOT).as_posix(),
    },
})

queue = read_json(QUEUE_PATH)
existing_ids = {item["id"] for item in queue["items"]}
dom = read_json(DOM_PATH)
evidence = [
    docs_json.relative_to(ROOT).as_posix(),
    docs_md.relative_to(ROOT).as_posix(),
    PROOF_REL + "/proposal-candidates.json",
    PROOF_REL + "/validation-v4.json",
    PROOF_REL + "/viewer-v4.png",
    PROOF_REL + "/print-v4.png",
    PROOF_REL + "/page-033-pt-BR-v4.pdf",
    PROOF_REL + "/pdf-render-v4.png",
]
for candidate in candidates:
    identifier = candidate["spanKey"] + "::human-review"
    if identifier in existing_ids:
        continue
    block = dom["blocks"][candidate["blockIndex"]]
    blocked_candidate = candidate["spanKey"] == BLOCKED_KEY
    queue["items"].append({
        "id": identifier,
        "page": 33,
        "sourceBlockId": block["id"],
        "sourceUnitIds": [candidate["unitId"]],
        "spanKey": candidate["spanKey"],
        "bboxPt": block["bbox"],
        "category": "human_terminology_editorial_review",
        "status": "pending_human_review",
        "reason": "Proposta de tradução aguardando revisão editorial humana; nenhuma proposta foi aprovada ou gravada.",
        "sourceText": candidate.get("sourceText", ""),
        "proposedText": candidate.get("proposalText", ""),
        "diagnosticRendering": (
            "Entire label blank only in v4 diagnostic due to source die overlap; full proposal retained."
            if blocked_candidate else "Proposed text visible in isolated v4 Viewer/PDF diagnostic."
        ),
        "verifiedIn": (
            ["proposal JSON", "official PDF and English Viewer review"]
            if blocked_candidate else ["isolated PT-BR Viewer v4", "isolated one-page PDF v4", "proposal JSON"]
        ),
        "editor": (
            "Not checked in the read-only Editor; the full proposal remains in JSON."
            if candidate.get("spanKey") != "page_33_unit_p33-block-35-default-dice-paragraph__pt-BR"
            else "Checked in the read-only Editor in the earlier v3 proof; dialog canceled without saving."
        ),
        "evidence": evidence,
    })
    existing_ids.add(identifier)

technical_id = "p033-casting-label-fixed-source-die-overlap"
if technical_id not in existing_ids:
    block = next(item for item in dom["blocks"] if item["id"] == "block_38")
    queue["items"].append({
        "id": technical_id,
        "page": 33,
        "sourceBlockId": "block_38",
        "sourceUnitIds": ["block_38"],
        "spanKey": BLOCKED_KEY,
        "bboxPt": [91.5789, 217.7640, 140.2989, 231.2440],
        "category": "unmapped_inline_source_symbol_composition",
        "status": "open",
        "reason": "O rótulo PT-BR 'Conjuração:' invade o dado roxo fixo depois de 'Casting:'; esse dado não tem placement semântico no sidecar.",
        "sourceText": "Casting: ",
        "proposedText": "Conjuração:",
        "diagnosticRendering": "O bloco completo fica em branco somente no Viewer/PDF v4; o dado roxo permanece no fundo em sua posição original.",
        "verifiedIn": ["PDF oficial e Viewer EN", "Viewer/PDF diagnóstico v3 com colisão", "Viewer/PDF diagnóstico v4 após blanking integral"],
        "requiredAction": "Rastrear o vetor como placement semântico ou aprovar rótulo curto com espaço suficiente; depois repetir Viewer, Copyfit V3 e PDF.",
        "evidence": evidence + [PROOF_REL + "/source-en-vs-ptbr-v3.png"],
    })
    existing_ids.add(technical_id)

queue["updated"] = "2026-10-16"
sources = queue.setdefault("sourceProposals", [])
for source in [docs_json.relative_to(ROOT).as_posix(), docs_md.relative_to(ROOT).as_posix()]:
    if source not in sources:
        sources.append(source)
write_json(QUEUE_PATH, queue)

status_path = ROOT / "docs/translations/page-status.csv"
status_text = read_text(status_path)
lines = status_text.splitlines(keepends=True)
row_index = next(index for index, line in enumerate(lines) if line.startswith('"33",') or line.startswith("33,"))
row = next(csv.reader([lines[row_index]]))
row[3] = "pdf_vs_viewer_composition_and_ptbr_v4_raster_reviewed_2026-10-16"
row[4] = "proposal_v4_18_of_19_viewer_pdf_proofed_one_diagnostic_blank_copyfit_v3_editor_review_and_artwork_pending"
row[5] = (
    "19 prose candidates proposed; 18 visible in the isolated v4 Viewer and one-page PDF. block_38 is wholly blank only in the diagnostic because Conjuração: collides with a fixed source purple die. Only the default-dice field was checked in the read-only Editor; Copyfit V3, human review, and the three English card overlays remain open. No Payload translation writes. See p.033 v4 proposal/report."
)
buf = io.StringIO()
csv.writer(buf, lineterminator="\n").writerow(row)
lines[row_index] = buf.getvalue()
write_text(status_path, "".join(lines))

progress_path = ROOT / "docs/translations/localization-goal-progress.md"
p30_line = "- **p.30:** proposta v2 cobre 19 unidades; 18/19 passaram Viewer, Copyfit V3 e PDF, e os 19 campos foram conferidos no Editor read-only. Block_41 permanece inteiro em branco somente no snapshot por composição de Escudo/Livro-3 sem placements seguros; a proposta integral foi preservada. A v1 continua intacta. Zero Payload writes; revisão humana e exceção técnica pendentes. Ver [relatório v2](../project-progress/2026-10-16-p030-icons-conditions-tags-symbols-proposal-v2.md)."
p33_line = "- **p.33:** proposta v4 contém 19 unidades; 18 aparecem no Viewer/PDF e block_38 fica inteiro em branco apenas no diagnóstico por colisão com um dado roxo-fonte. Somente block_35 foi conferido no Editor; Copyfit V3, 19 revisões humanas e a localização de três overlays em inglês continuam pendentes. Ver [relatório v4](../project-progress/2026-10-16-p033-full-prose-proposal-v4.md)."
replace_once(progress_path, p30_line, p30_line + "\n" + p33_line)
replace_once(progress_path, "Treze páginas têm algum conteúdo proposto.", "Catorze páginas deste lote têm algum conteúdo proposto; a p.32 possui uma proposta completa de ciclo anterior, ainda sem reconciliação nesta fila.")
replace_once(progress_path, "pendente nas treze páginas.", "pendente nas catorze páginas deste lote; a p.32 também aguarda revisão humana.")
replace_once(progress_path, "Fila deste conjunto: 266 itens únicos", "Fila deste conjunto: 286 itens únicos")
replace_once(progress_path,
    "21 decisões humanas e 1 exceção técnica de composição inline p.30. São 265 itens abertos e 1 resolvido.",
    "21 decisões humanas e 1 exceção técnica de composição inline p.30; 19 decisões humanas e 1 exceção técnica de dado-fonte fixo p.33. São 285 itens abertos e 1 resolvido.")
replace_once(progress_path,
    "diagnóstico). Na p.28, oito registros salvos",
    "diagnóstico) e 18/19 da p.33 (19 propostas preservadas; 18 visíveis no Viewer/PDF, só block_35 conferido no Editor e Copyfit V3 pendente). Na p.28, oito registros salvos")
replace_once(progress_path,
    "A reconciliação de exceções para as demais páginas ainda não foi feita.",
    "A p.32 já tem 15 novos candidatos em proposta completa v1, com Viewer/Editor/PDF verificados, aguardando Copyfit V3 e reconciliação da fila. A p.31 é uma página de ilustração sem prosa editorial. A reconciliação de exceções para as demais páginas ainda não foi feita.")

readme_path = ROOT / "docs/project-progress/README.md"
replace_once(readme_path, "# Project progress log\n", "# Project progress log\n\n- [2026-10-16 — p.33: proposta completa de prosa v4](2026-10-16-p033-full-prose-proposal-v4.md): 18/19 candidatos visíveis no Viewer/PDF isolado; um rótulo inteiro em branco no diagnóstico por colisão com dado roxo-fonte; Copyfit V3, revisão humana e três overlays de carta ainda pendentes.\n")

state_path = ROOT / "docs/PROJECT_STATE.md"
replace_once(state_path,
    "## Atualização corrente — ativações técnicas e propostas (15 e 16/10/2026)\n",
    "## Atualização corrente — ativações técnicas e propostas (15 e 16/10/2026)\n\n- **p.33:** proposta de prosa v4 com 19 unidades; 18 visíveis no Viewer/PDF isolado e block_38 em branco somente no diagnóstico por colisão com dado roxo fixo. Copyfit V3, revisão humana e três overlays em inglês pendentes; só block_35 foi verificado no Editor. Ver [relatório v4](project-progress/2026-10-16-p033-full-prose-proposal-v4.md).\n")

handoff_path = ROOT / "PROJECT-HANDOFF.md"
replace_once(handoff_path,
    "## Execução mais recente — 16/10/2026\n",
    "## Execução mais recente — 16/10/2026\n- **p.33:** proposta v4 tem 19 unidades; 18 visíveis no Viewer/PDF. block_38 fica inteiro em branco apenas no diagnóstico por colisão com dado roxo-fonte; Copyfit V3, revisão humana e três overlays em inglês pendentes. Só block_35 foi verificado no Editor. Ver [relatório v4](docs/project-progress/2026-10-16-p033-full-prose-proposal-v4.md).\n")

proof_readme = read_text(PROOF / "README.md")
validation_note = "Validation: one-page 820.346 pt PDF and independent raster reviewed; 18 candidate units visible, with the full block_38 label blank only in this diagnostic. The only read-only Editor field check is the default-dice unit. Copyfit V3 remains pending. See `validation-v4.json`."
if validation_note not in proof_readme:
    proof_readme += "\n" + validation_note + "\n"
    write_text(PROOF / "README.md", proof_readme)

print(json.dumps({
    "page": 33,
    "candidateCount": len(candidates),
    "visibleCandidateCount": 18,
    "editorCheckedCandidateCount": 1,
    "copyfitV3CheckedCandidateCount": 0,
    "queueTotal": len(queue["items"]),
    "queueOpen": sum(item.get("status") != "resolved" for item in queue["items"]),
    "queueResolved": sum(item.get("status") == "resolved" for item in queue["items"]),
    "report": report_path.relative_to(ROOT).as_posix(),
}, ensure_ascii=False, indent=2))
