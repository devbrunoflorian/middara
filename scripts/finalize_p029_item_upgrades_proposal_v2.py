#!/usr/bin/env python
"""Record verified p.29 proposal evidence and its open human/technical exceptions."""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path

ROOT = Path.cwd()
PROOF = "output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2"
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.json"
PROPOSAL_MD = ROOT / "docs/translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.md"
VIEWER_RECEIPT_PATH = ROOT / PROOF / "viewer-editor-receipt-v2.json"
PDF_RECEIPT_PATH = ROOT / PROOF / "pdf-copyfit-receipt-v2.json"
QUEUE_PATH = ROOT / "docs/translations/localization-exceptions.json"


def read_text(path: Path) -> str:
    with path.open("r", encoding="utf-8", newline="") as stream:
        return stream.read()


def write_text(path: Path, value: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        stream.write(value)


proposal = json.loads(read_text(PROPOSAL_PATH))
viewer_receipt = json.loads(read_text(VIEWER_RECEIPT_PATH))
pdf_receipt = json.loads(read_text(PDF_RECEIPT_PATH))
assert viewer_receipt["candidateCount"] == 21
assert viewer_receipt["viewerCandidateTextCount"] == 20
assert viewer_receipt["viewerDiagnosticBlankCount"] == 1
assert viewer_receipt["editorVerifiedCandidateCount"] == 21
assert pdf_receipt["extractableCandidateCount"] == 20
assert pdf_receipt["rightOrBottomOverflowCount"] == 0

candidates = proposal["candidates"]
failed_key = "page_29_block_6__pt-BR"
verified_keys = [candidate["legacyBlockSpanKey"] for candidate in candidates if candidate["legacyBlockSpanKey"] != failed_key]
for candidate in candidates:
    key = candidate["legacyBlockSpanKey"]
    candidate["editorialStatus"] = "pending_human_review"
    if key == failed_key:
        candidate["status"] = "full_proposal_editor_verified_diagnostic_blank_due_to_unresolved_star_rendering_exception"
        candidate["technicalStatus"] = "editor_verified_full_text_retained_but_viewer_pdf_copyfit_pending_symbol_exception"
    else:
        candidate["status"] = "verified_in_viewer_editor_copyfit_pdf_human_review_pending"
        candidate["technicalStatus"] = "verified_in_viewer_editor_copyfit_v3_and_pdf"

proposal["status"] = "20_of_21_candidates_verified_in_viewer_editor_copyfit_pdf_one_whole_unit_diagnostic_blank_human_review_pending_star_render_exception"
proposal["counts"].update({
    "candidates": 21,
    "verifiedInViewer": 20,
    "verifiedInEditor": 21,
    "verifiedInCopyfit": 20,
    "verifiedInPdf": 20,
    "preservedHumanRecords": 0,
    "diagnosticBlankUnits": 1,
    "artworkExceptions": 0,
    "technicalExceptions": 1,
    "humanReviewCandidates": 21,
})
proposal["technicalExceptions"][0]["diagnosticRepair"] = (
    "An isolated semantic sidecar and donor mask were attempted in the diagnostic snapshot only; "
    "the exported Viewer/PDF still renders the star white, so the repair was not accepted."
)
proposal["technicalExceptions"][0]["diagnosticTextTreatment"] = (
    "The entire editable block_22 copy remains blank only in the PT-BR diagnostic snapshot because "
    "the star still renders white. The full proposed PT-BR text remains in candidates[block_22].data "
    "and was checked in the read-only Editor."
)
proposal["copyfit"] = {
    "status": "20_print_candidates_pass_copyfit_v3_one_whole_unit_blank_for_symbol_render_exception",
    "diagnosticSnapshot": f"{PROOF}/snapshot-diagnostic-v2/snapshot.json",
    "metrics": f"{PROOF}/metrics-pt-BR-diagnostic-v2.json",
    "viewerCandidateCount": 20,
    "printCandidateCount": 20,
    "diagnosticBlankSpanKeys": [failed_key],
    "maximumPrintedRightOrBottomExcessPt": 0,
    "maximumTopGlyphExtentExcessPt": pdf_receipt["maxTopGlyphExtentExcessPt"],
    "failedCandidates": [failed_key],
    "rasterReview": "Viewer and PDF raster were inspected. No right or bottom overflow or visible clipping was found; small top glyph-extent measurements are recorded in the receipt.",
}
proposal["validation"] = {
    "viewerEditorReceipt": f"{PROOF}/viewer-editor-receipt-v2.json",
    "pdfReceipt": f"{PROOF}/pdf-copyfit-receipt-v2.json",
    "pdf": f"{PROOF}/page-029-pt-BR-diagnostic-v2.pdf",
    "viewerScreenshot": f"{PROOF}/viewer-readonly-pt-BR-diagnostic-v2.png",
    "printScreenshot": f"{PROOF}/print-pt-BR-diagnostic-v2.png",
    "editorScreenshot": f"{PROOF}/editor-readonly-v2.png",
    "copyfitMetrics": f"{PROOF}/metrics-pt-BR-diagnostic-v2.json",
    "verifiedCandidateSpanKeys": verified_keys,
    "editorOnlyCandidateSpanKeys": [failed_key],
    "diagnosticBlankSpanKeys": [failed_key],
    "payloadTranslationsBefore": 0,
    "payloadTranslationsAfter": 0,
    "payloadLayoutFramesBefore": 0,
    "payloadLayoutFramesAfter": 0,
    "observedApiMethods": ["GET"],
    "payloadWrites": 0,
    "canonicalAssetsUnchangedDuringReadOnlyVerification": True,
}
write_text(PROPOSAL_PATH, json.dumps(proposal, ensure_ascii=False, indent=2) + "\n")

queue = json.loads(read_text(QUEUE_PATH))
existing_ids = {item["id"] for item in queue["items"]}
human_evidence = [
    "docs/translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.json",
    "docs/translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.md",
    f"{PROOF}/viewer-editor-receipt-v2.json",
    f"{PROOF}/pdf-copyfit-receipt-v2.json",
    f"{PROOF}/metrics-pt-BR-diagnostic-v2.json",
    f"{PROOF}/page-029-pt-BR-diagnostic-v2.pdf",
    f"{PROOF}/viewer-readonly-pt-BR-diagnostic-v2.png",
    f"{PROOF}/editor-readonly-v2.png",
    f"{PROOF}/print-pt-BR-diagnostic-v2.png",
]
for candidate in candidates:
    key = candidate["spanKey"]
    queue_id = f"{key}::human-review"
    if queue_id in existing_ids:
        continue
    boxes = candidate.get("sourceBboxes", [])
    bbox = None
    if boxes:
        bbox = [min(box[0] for box in boxes), min(box[1] for box in boxes), max(box[2] for box in boxes), max(box[3] for box in boxes)]
    terms = candidate.get("pendingTerms", [])
    item = {
        "id": queue_id,
        "page": 29,
        "sourceBlockId": candidate["sourceBlockId"],
        "sourceUnitIds": candidate.get("sourceUnitIds", []),
        "spanKey": candidate["spanKey"],
        "bboxPt": bbox,
        "category": "human_terminology_editorial_review",
        "status": "pending_human_review",
        "reason": " ".join(terms) if terms else "Tradução proposta aguardando revisão editorial humana.",
        "sourceText": candidate["sourceText"],
        "proposedText": candidate["proposalText"],
        "verifiedIn": (["official source review", "read-only Admin Editor v2; dialog cancelled"] if candidate["legacyBlockSpanKey"] == failed_key else ["official source review", "PT-BR Viewer v2", "read-only Admin Editor v2; dialog cancelled", "one-page PDF v2 and Copyfit V3 metrics"]),
        "editor": "Candidate text confirmed in the read-only Editor; dialog cancelled without saving. Semantic symbol aliases were treated as symbols rather than prose.",
        "evidence": human_evidence,
    }
    queue["items"].append(item)
    existing_ids.add(queue_id)

star = proposal["technicalExceptions"][0]
technical_id = star["id"]
if technical_id not in existing_ids:
    queue["items"].append({
        "id": technical_id,
        "page": 29,
        "sourceBlockId": star["sourceBlockId"],
        "sourceUnitIds": [star["sourceUnitId"]],
        "spanKey": "page_29_block_6",
        "bboxPt": star["bboxPt"],
        "category": "technical_symbol_color_mismatch",
        "status": "open",
        "reason": "A fonte oficial mostra combat.damage-star em preto, enquanto o Viewer e o PDF de diagnóstico renderizam o símbolo branco. O patch isolado não resolveu a divergência; block_22 fica inteiro em branco somente no diagnóstico até a revisão do símbolo.",
        "sourceText": next(candidate["sourceText"] for candidate in candidates if candidate["legacyBlockSpanKey"] == failed_key),
        "proposedText": next(candidate["proposalText"] for candidate in candidates if candidate["legacyBlockSpanKey"] == failed_key),
        "requiredAction": "Corrigir o preflight do sidecar/asset e validar uma renderização preta em Viewer e PDF antes de integrar a correção canônica. Preservar a proposta completa e a política de unidade inteira em branco no diagnóstico.",
        "diagnosticRendering": "Full PT-BR block retained in proposal and read-only Editor; whole unit blank only in isolated Viewer/PDF diagnostic.",
        "verifiedIn": ["official source PDF", "current English Viewer/PDF", "PT-BR Viewer and PDF diagnostic v2"],
        "evidence": human_evidence,
    })
queue["updated"] = "2026-10-16"
source_proposals = queue.setdefault("sourceProposals", [])
for path in [
    "docs/translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.json",
    "docs/translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.md",
]:
    if path not in source_proposals:
        source_proposals.append(path)
write_text(QUEUE_PATH, json.dumps(queue, ensure_ascii=False, indent=2) + "\n")

status_path = ROOT / "docs/translations/page-status.csv"
status_text = read_text(status_path)
lines = status_text.splitlines(keepends=True)
row_index = next(index for index, line in enumerate(lines) if line.startswith('"29",'))
row = next(csv.reader([lines[row_index]]))
row[4] = "proposal_v2_20_of_21_viewer_editor_copyfit_pdf_verified_one_diagnostic_blank_human_review_pending"
row[5] = (
    "21 editable units proposed; 20 passed Viewer, read-only Editor, Copyfit V3 and one-page PDF; all 21 proposal fields confirmed in Editor. "
    "Block_22 remains wholly blank only in the diagnostic because combat.damage-star renders white instead of the source black. "
    "No Payload writes or canonical asset changes; see p.029 v2 proposal/report."
)
buffer = io.StringIO()
csv.writer(buffer, lineterminator="\n").writerow(row)
lines[row_index] = buffer.getvalue()
write_text(status_path, "".join(lines))


def replace_once(path: Path, old: str, new: str) -> None:
    body = read_text(path)
    if new in body:
        return
    if old in body:
        write_text(path, body.replace(old, new, 1))
        return
    for eol in ("\r\n", "\n"):
        old_with_eol = old.replace("\n", eol)
        if old_with_eol in body:
            write_text(path, body.replace(old_with_eol, new.replace("\n", eol), 1))
            return
    raise AssertionError(f"Expected text not found in {path}: {old[:80]!r}")


proposal_md = read_text(PROPOSAL_MD)
proposal_md = proposal_md.replace(
    "**Estado:** 21 unidades localizáveis têm proposta inicial. Copyfit V3, Viewer, Editor read-only e PDF de uma página estão pendentes. Revisão humana pendente. Nenhuma tradução ou frame foi gravado no Payload.",
    "**Estado:** 21 unidades localizáveis têm proposta. Vinte passaram no Viewer, Editor read-only, Copyfit V3 de impressão e PDF; os 21 campos da proposta foram confirmados no Editor. A unidade de block_22 permanece inteira em branco somente no diagnóstico por uma exceção de renderização da estrela. Revisão humana pendente. Nenhuma tradução ou frame foi gravado no Payload.",
)
proposal_md = proposal_md.replace(
    "A fonte oficial mostra uma estrela preta entre “single” e “Symbol”; o Viewer canônico atual a mostra branca. O sidecar semântico e a máscara já verificados foram copiados somente para o snapshot de diagnóstico v2. Nenhum arquivo canônico foi alterado. A integração da correção permanece pendente.",
    "A fonte oficial mostra uma estrela preta entre “single” e “Symbol”; o Viewer e o PDF de diagnóstico v2 ainda a mostram branca, mesmo após a tentativa com sidecar semântico e máscara isolados. Por isso o texto de block_22 fica inteiro em branco apenas no Viewer/PDF diagnóstico. A proposta completa permanece no JSON e foi conferida no Editor read-only. Nenhum arquivo canônico foi alterado; a correção exige resolver o conflito de hash do preflight antes de integração.",
)
proposal_md += (
    "\n## Copyfit, Viewer, Editor e PDF v2\n\n"
    "Vinte unidades foram conferidas em Viewer, Editor read-only, Copyfit V3 de impressão e PDF de uma página. Os 21 textos completos da proposta foram confirmados no Editor, com todos os diálogos cancelados. A exportação tem uma página (820,346 × 820,346 pt), 20 unidades PT-BR selecionáveis, zero caractere de substituição/uso privado e nenhum excesso à direita ou abaixo. A unidade block_22 fica integralmente em branco apenas no snapshot diagnóstico; o texto completo segue preservado na proposta. O raster não mostra corte visível. Payload: zero traduções e frames antes/depois, somente GET; assets canônicos inalterados.\n\n"
    "Evidências da validação: Viewer/Editor [recibo](../../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/viewer-editor-receipt-v2.json), [PDF e Copyfit V3](../../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/pdf-copyfit-receipt-v2.json), [PDF](../../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/page-029-pt-BR-diagnostic-v2.pdf), [raster](../../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/print-pt-BR-diagnostic-v2.png) e [métricas](../../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/metrics-pt-BR-diagnostic-v2.json).\n"
)
write_text(PROPOSAL_MD, proposal_md)

report_path = ROOT / "docs/project-progress/2026-10-16-p029-item-upgrades-proposal-v2.md"
report = """# 2026-10-16 — p.29: proposta “Aprimoramentos de Item” v2

## Resultado

A proposta v2 contém 21 unidades localizáveis. Vinte unidades passaram no Viewer PT-BR, Editor read-only, Copyfit V3 de impressão e PDF; todos os 21 textos completos foram confirmados nos campos do Editor e os diálogos foram cancelados sem salvar. A unidade de block_22 não é contabilizada como verificada no Viewer/PDF/Copyfit: ela permanece inteira em branco somente no snapshot diagnóstico por causa de uma exceção técnica do símbolo. O texto proposto integral continua recuperável no JSON.

O PDF tem uma página de 820,346 × 820,346 pt. As 20 traduções visíveis foram encontradas no texto selecionável. Não há caracteres de substituição ou de uso privado, e o Copyfit V3 não mediu excesso à direita ou abaixo. Há pequenas excursões de tinta acima de alguns frames (máximo 2,250 pt); a inspeção do raster não mostrou corte. A estrela é uma exceção distinta: o PDF oficial mostra combat.damage-star preto, enquanto Viewer e export de diagnóstico ainda a mostram branca.

## Exceção técnica

O sidecar semântico e a máscara foram tentados somente no snapshot. A estrela continuou branca na exportação e a correção não foi aceita nem integrada ao sidecar canônico. A falha de preflight por hash permanece aberta. Para evitar uma localização parcial ou fallback inglês, todo o block_22 fica em branco somente no Viewer/PDF isolados. O texto PT-BR completo e os símbolos semânticos permanecem na proposta e o campo foi confirmado no Editor read-only.

## Copyfit e persistência

Frames maiores de título, rótulos dos cards e a unidade final da coluna direita existem somente no snapshot diagnóstico. Vinte alvos ativos foram medidos com Copyfit V3; right/bottom excess = 0. O Payload tinha zero traduções PT-BR e zero frames da p.29 antes e depois. A verificação observou somente GET; nenhum save foi executado e os hashes de todos os assets canônicos da página permaneceram iguais.

## Revisão humana e continuidade

As 21 propostas aguardam revisão terminológica/editorial humana. A fila consolidada recebeu 21 itens de revisão humana e uma exceção técnica de símbolo: 246 itens únicos no total, 245 abertos e um resolvido. A revisão humana não equivale a aprovação; a localização não foi publicada nem gravada no Payload.

## Evidências

- Proposta: [JSON](../translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.json) e [Markdown](../translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.md).
- Viewer/Editor: [captura Viewer](../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/viewer-readonly-pt-BR-diagnostic-v2.png), [captura Editor](../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/editor-readonly-v2.png) e [recibo](../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/viewer-editor-receipt-v2.json).
- PDF/Copyfit: [PDF](../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/page-029-pt-BR-diagnostic-v2.pdf), [raster](../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/print-pt-BR-diagnostic-v2.png), [recibo](../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/pdf-copyfit-receipt-v2.json) e [métricas Copyfit V3](../../output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2/metrics-pt-BR-diagnostic-v2.json).
"""
write_text(report_path, report)

progress_path = ROOT / "docs/translations/localization-goal-progress.md"
replace_once(
    progress_path,
    "- **p.28:** proposta v4 cobre 23 novas unidades; 23/23 passaram no Viewer, Editor read-only, Copyfit V3 de impressão e PDF. Oito traduções humanas salvas foram preservadas e aparecem no Viewer/PDF; sete correspondem no Editor. O registro 232 permanece intacto, com uma exceção de chave legada que abre o inglês na caixa semântica atual. Três frames de lista existem somente no snapshot; três cartas permanecem compartilhadas em inglês conforme autorização anterior. Revisão humana pendente; zero Payload writes. Ver [relatório v4](../project-progress/2026-10-16-p028-item-upgrades-proposal-v4.md).",
    "- **p.28:** proposta v4 cobre 23 novas unidades; 23/23 passaram no Viewer, Editor read-only, Copyfit V3 de impressão e PDF. Oito traduções humanas salvas foram preservadas e aparecem no Viewer/PDF; sete correspondem no Editor. O registro 232 permanece intacto, com uma exceção de chave legada que abre o inglês na caixa semântica atual. Três frames de lista existem somente no snapshot; três cartas permanecem compartilhadas em inglês conforme autorização anterior. Revisão humana pendente; zero Payload writes. Ver [relatório v4](../project-progress/2026-10-16-p028-item-upgrades-proposal-v4.md).\n- **p.29:** proposta v2 cobre 21 unidades; 20/20 passaram Viewer, Editor read-only, Copyfit V3 e PDF, e os 21 campos completos foram conferidos no Editor. Block_22 permanece inteiro em branco somente no snapshot por estrela preta/branca; a proposta integral foi preservada. Zero Payload writes. As 21 propostas aguardam revisão humana; a exceção técnica do símbolo continua aberta. Ver [relatório v2](../project-progress/2026-10-16-p029-item-upgrades-proposal-v2.md).",
)
replace_once(progress_path, "Onze páginas têm algum conteúdo proposto.", "Doze páginas têm algum conteúdo proposto.")
replace_once(progress_path, "e p.28 (23 novas propostas, 8 registros salvos preservados e 1 exceção de chave no Editor).", "e p.28 (23 novas propostas, 8 registros salvos preservados e 1 exceção de chave no Editor), e p.29 (21 propostas, 20 verificadas nas três superfícies e 1 bloco inteiro em branco no diagnóstico por exceção de símbolo).")
replace_once(progress_path, "27/30 da p.27 e 23/23 unidades novas da p.28.", "27/30 da p.27, 23/23 unidades novas da p.28 e 20/21 da p.29 (21/21 campos confirmados no Editor; um bloco em branco no Viewer/PDF diagnóstico).")
replace_once(progress_path, "pendente nas onze páginas.", "pendente nas doze páginas.")
replace_once(progress_path, "Fila deste conjunto: 224 itens únicos", "Fila deste conjunto: 246 itens únicos")
replace_once(progress_path, "23 decisões humanas e 1 exceção de chave no Editor p.28. A reconciliação", "23 decisões humanas e 1 exceção de chave no Editor p.28; 21 decisões humanas e 1 exceção técnica de símbolo p.29. São 245 itens abertos e 1 resolvido. A reconciliação")

readme_path = ROOT / "docs/project-progress/README.md"
replace_once(
    readme_path,
    "# Project progress log\n",
    "# Project progress log\n\n- [2026-10-16 — p.29: proposta “Aprimoramentos de Item” v2](2026-10-16-p029-item-upgrades-proposal-v2.md): 20/21 unidades passaram Viewer, Editor read-only, Copyfit V3 e PDF; os 21 campos completos foram conferidos no Editor; um bloco fica inteiro em branco só no diagnóstico por exceção técnica do símbolo; 21 decisões humanas e um reparo técnico pendentes.\n",
)

state_path = ROOT / "docs/PROJECT_STATE.md"
replace_once(
    state_path,
    "## Atualização corrente — ativações técnicas e propostas (15 e 16/10/2026)\n",
    "## Atualização corrente — ativações técnicas e propostas (15 e 16/10/2026)\n\n- **p.29:** proposta v2 contém 21 unidades; 20 passaram Viewer, Editor read-only, Copyfit V3 e PDF, e os 21 campos completos foram conferidos no Editor. Block_22 permanece inteiro em branco somente no snapshot por exceção de estrela; texto integral preservado. Zero writes no Payload; revisão humana e correção técnica pendentes. Ver [relatório v2](project-progress/2026-10-16-p029-item-upgrades-proposal-v2.md).\n",
)

handoff_path = ROOT / "PROJECT-HANDOFF.md"
replace_once(
    handoff_path,
    "## Execução mais recente — 16/10/2026\n",
    "## Execução mais recente — 16/10/2026\n- **p.29:** proposta v2 cobre 21 unidades; 20 passaram Viewer, Editor read-only, Copyfit V3 e PDF, com os 21 campos completos confirmados no Editor. Block_22 fica inteiro em branco só no diagnóstico pela estrela que ainda renderiza branca; proposta integral preservada. Zero Payload writes, revisão humana e reparo técnico pendentes. Ver [relatório v2](docs/project-progress/2026-10-16-p029-item-upgrades-proposal-v2.md).\n",
)

print(json.dumps({
    "proposal": str(PROPOSAL_PATH.relative_to(ROOT)).replace("\\", "/"),
    "humanReviewItemsAdded": sum(item["page"] == 29 and item["category"] == "human_terminology_editorial_review" for item in queue["items"]),
    "technicalExceptionsForP29": sum(item["page"] == 29 and item["category"] == "technical_symbol_color_mismatch" for item in queue["items"]),
    "queueTotal": len(queue["items"]),
    "queueOpen": sum(item["status"] != "resolved" for item in queue["items"]),
    "queueResolved": sum(item["status"] == "resolved" for item in queue["items"]),
    "report": str(report_path.relative_to(ROOT)).replace("\\", "/"),
}, ensure_ascii=False, indent=2))
