#!/usr/bin/env python
"""Record p.30 Viewer/Editor/PDF evidence and its source-symbol exception."""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path

ROOT = Path.cwd()
PROOF = "output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2"
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.json"
PROPOSAL_MD = ROOT / "docs/translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.md"
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
candidates = proposal["candidates"]
blank_key = "page_30_block_17__pt-BR"
assert len(candidates) == 19
assert viewer_receipt["viewerCandidateTextCount"] == 18
assert viewer_receipt["viewerDiagnosticBlankCount"] == 1
assert viewer_receipt["editorVerifiedCandidateCount"] == 19
assert pdf_receipt["extractableCandidateCount"] == 18
assert pdf_receipt["rightOrBottomOverflowCount"] == 0

verified_keys = []
for candidate in candidates:
    if candidate["legacyBlockSpanKey"] == blank_key:
        candidate["status"] = "full_proposal_editor_verified_whole_unit_blank_in_viewer_pdf_due_to_source_symbol_composition_exception"
        candidate["technicalStatus"] = "editor_checked_diagnostic_only_source_symbols_unmapped"
    else:
        candidate["status"] = "verified_in_viewer_editor_copyfit_pdf_human_review_pending"
        candidate["technicalStatus"] = "verified_in_viewer_editor_copyfit_v3_and_pdf"
        verified_keys.append(candidate["legacyBlockSpanKey"])
    candidate["editorialStatus"] = "pending_human_review"

proposal["status"] = "18_of_19_candidates_verified_in_viewer_copyfit_pdf_all_19_editor_fields_checked_one_whole_unit_diagnostic_blank_source_symbol_composition_exception_human_review_pending"
proposal["counts"].update({
    "candidates": 19,
    "verifiedInViewer": 18,
    "verifiedInEditor": 19,
    "verifiedInCopyfit": 18,
    "verifiedInPdf": 18,
    "diagnosticBlankUnits": 1,
    "preservedHumanRecords": 0,
    "artworkExceptions": 0,
    "technicalExceptions": 1,
    "humanReviewCandidates": 19,
})
proposal["copyfit"] = {
    "status": "18_print_candidates_pass_copyfit_v3_one_whole_unit_blank_for_source_symbol_exception",
    "diagnosticSnapshot": f"{PROOF}/snapshot-diagnostic-v2/snapshot.json",
    "metrics": f"{PROOF}/metrics-pt-BR-diagnostic-v2.json",
    "viewerCandidateCount": 18,
    "printCandidateCount": 18,
    "diagnosticBlankSpanKeys": [blank_key],
    "maximumPrintedRightOrBottomExcessPt": 0,
    "maximumTopGlyphExtentExcessPt": pdf_receipt["maxTopGlyphExtentExcessPt"],
    "failedCandidates": [blank_key],
    "rasterReview": "The 18 translated units show no visible clipping or collision. The block_41 source Shield and Book/3 graphics remain at their original background coordinates while the full prose is blank; no translated text overlaps or replaces the glyphs.",
}
proposal["technicalExceptions"][0]["diagnosticTextTreatment"] = (
    "The entire block_41 is blank only in the PT-BR Viewer/PDF diagnostic. Full PT prose and source-symbol placement notes remain in the candidate JSON/Markdown and were inspected in the read-only Editor. Source glyphs remain visible in their original background positions."
)
proposal["validation"] = {
    "viewerEditorReceipt": f"{PROOF}/viewer-editor-receipt-v2.json",
    "pdfReceipt": f"{PROOF}/pdf-copyfit-receipt-v2.json",
    "pdf": f"{PROOF}/page-030-pt-BR-diagnostic-v2.pdf",
    "viewerScreenshot": f"{PROOF}/viewer-readonly-pt-BR-diagnostic-v2.png",
    "printScreenshot": f"{PROOF}/print-pt-BR-diagnostic-v2.png",
    "editorScreenshot": f"{PROOF}/editor-readonly-v2.png",
    "copyfitMetrics": f"{PROOF}/metrics-pt-BR-diagnostic-v2.json",
    "verifiedCandidateSpanKeys": verified_keys,
    "editorOnlyCandidateSpanKeys": [blank_key],
    "diagnosticBlankSpanKeys": [blank_key],
    "payloadTranslationsBefore": 0,
    "payloadTranslationsAfter": 0,
    "payloadLayoutFramesBefore": 0,
    "payloadLayoutFramesAfter": 0,
    "observedApiMethods": ["GET"],
    "payloadWrites": 0,
    "canonicalAssetsUnchangedDuringReadOnlyVerification": True,
}

proposal_md = read_text(PROPOSAL_MD)
proposal_md = proposal_md.replace(
    "**Estado:** proposta estruturada em 19 unidades. A validação de Viewer, Editor read-only, Copyfit V3 e PDF está pendente. A unidade do exemplo inline fica inteira em branco somente no snapshot por uma exceção de composição de símbolos. Revisão humana pendente. Nenhuma tradução ou frame foi gravado no Payload. A v1 permanece preservada.",
    "**Estado:** 19 unidades propostas; 18 passaram no Viewer, Copyfit V3 de impressão e PDF. Os 19 campos completos foram conferidos no Editor read-only. O exemplo inline fica inteiro em branco somente no snapshot por uma exceção de composição de símbolos. Revisão humana pendente. Nenhuma tradução ou frame foi gravado no Payload. A v1 permanece preservada.",
)
proposal_md += (
    "\n## Viewer, Editor, Copyfit V3 e PDF v2\n\n"
    "Dezoito unidades passaram Viewer, Editor read-only, Copyfit V3 de impressão e PDF de uma página; os 19 campos candidatos foram comparados no Editor e todos os diálogos foram cancelados. A exportação tem 820,346 × 820,346 pt, 18 unidades PT-BR selecionáveis, zero caractere de substituição/uso privado e nenhum excesso à direita ou abaixo. A unidade block_41 fica integralmente em branco somente no Viewer/PDF diagnóstico. Os glifos-fonte de Escudo e Livro/3 continuam no fundo em suas posições originais. O raster não mostra colisão ou corte das 18 unidades. Payload: zero traduções e frames antes/depois, somente GET; os assets canônicos permaneceram iguais.\n\n"
    "Evidências: [recibo Viewer/Editor](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/viewer-editor-receipt-v2.json), [recibo PDF e Copyfit V3](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/pdf-copyfit-receipt-v2.json), [PDF](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/page-030-pt-BR-diagnostic-v2.pdf), [raster](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/print-pt-BR-diagnostic-v2.png) e [métricas](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/metrics-pt-BR-diagnostic-v2.json).\n"
)
write_text(PROPOSAL_PATH, json.dumps(proposal, ensure_ascii=False, indent=2) + "\n")
write_text(PROPOSAL_MD, proposal_md)

queue = json.loads(read_text(QUEUE_PATH))
existing_ids = {item["id"] for item in queue["items"]}
evidence = [
    "docs/translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.json",
    "docs/translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.md",
    f"{PROOF}/viewer-editor-receipt-v2.json",
    f"{PROOF}/pdf-copyfit-receipt-v2.json",
    f"{PROOF}/metrics-pt-BR-diagnostic-v2.json",
    f"{PROOF}/page-030-pt-BR-diagnostic-v2.pdf",
    f"{PROOF}/viewer-readonly-pt-BR-diagnostic-v2.png",
    f"{PROOF}/editor-readonly-v2.png",
    f"{PROOF}/print-pt-BR-diagnostic-v2.png",
    f"output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v1/source-official-p030.png",
]
for candidate in candidates:
    queue_id = f"{candidate['spanKey']}::human-review"
    if queue_id in existing_ids:
        continue
    boxes = candidate.get("sourceBboxes", [])
    bbox = None if not boxes else [min(box[0] for box in boxes), min(box[1] for box in boxes), max(box[2] for box in boxes), max(box[3] for box in boxes)]
    blocked = candidate["legacyBlockSpanKey"] == blank_key
    queue["items"].append({
        "id": queue_id,
        "page": 30,
        "sourceBlockId": candidate["sourceBlockId"],
        "sourceUnitIds": candidate.get("sourceUnitIds", []),
        "spanKey": candidate["spanKey"],
        "bboxPt": bbox,
        "category": "human_terminology_editorial_review",
        "status": "pending_human_review",
        "reason": " ".join(candidate.get("pendingTerms", [])) or "Proposta de tradução aguardando revisão editorial humana.",
        "sourceText": candidate["sourceText"],
        "proposedText": candidate["proposalText"],
        "verifiedIn": (["official source PDF review", "read-only Admin Editor v2; dialog cancelled"] if blocked else ["official PDF and English Viewer review", "PT-BR Viewer v2", "read-only Admin Editor v2; dialog cancelled", "one-page PDF v2 and Copyfit V3 metrics"]),
        "editor": "Candidate checked in the read-only Editor; the dialog was cancelled without saving. Rich symbol marker is preserved for the IMPORTANT callout.",
        "evidence": evidence,
    })
    existing_ids.add(queue_id)

technical = proposal["technicalExceptions"][0]
if technical["id"] not in existing_ids:
    blocked_candidate = next(item for item in candidates if item["legacyBlockSpanKey"] == blank_key)
    queue["items"].append({
        "id": technical["id"],
        "page": 30,
        "sourceBlockId": technical["sourceBlockId"],
        "sourceUnitIds": [technical["sourceUnitId"]],
        "spanKey": "page_30_block_17",
        "bboxPt": technical["bboxPt"],
        "category": technical["classification"],
        "status": "open",
        "reason": "The inline example contains source Shield and Book/3 glyphs without semantic placements. The p030-v116-117-n2 combat.page occurrence remains blocked because the icon includes a printed 3; translated text cannot safely reflow around fixed glyphs yet.",
        "sourceText": blocked_candidate["sourceText"],
        "proposedText": blocked_candidate["proposalText"],
        "requiredAction": "Resolve the exact source glyph occurrence and placement, then validate the inline example's Viewer and PDF reflow. Keep the canonical sidecar and artwork unchanged until review.",
        "diagnosticRendering": "The full paragraph is blank only in the isolated PT-BR Viewer/PDF; full proposal remains available and the source glyphs remain on the background.",
        "verifiedIn": ["official source PDF", "English Viewer source review", "PT-BR Viewer/PDF diagnostic v2"],
        "evidence": evidence,
    })
queue["updated"] = "2026-10-16"
sources = queue.setdefault("sourceProposals", [])
for source in [
    "docs/translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.json",
    "docs/translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.md",
]:
    if source not in sources:
        sources.append(source)
write_text(QUEUE_PATH, json.dumps(queue, ensure_ascii=False, indent=2) + "\n")

status_path = ROOT / "docs/translations/page-status.csv"
status_text = read_text(status_path)
lines = status_text.splitlines(keepends=True)
row_index = next(index for index, line in enumerate(lines) if line.startswith('"30",') or line.startswith('30,'))
row = next(csv.reader([lines[row_index]]))
row[4] = "proposal_v2_18_of_19_viewer_copyfit_pdf_verified_19_editor_fields_checked_one_diagnostic_blank_human_review_pending"
row[5] = (
    "19 editable units proposed; 18 passed Viewer, Copyfit V3 and one-page PDF; all 19 fields were checked in the read-only Editor. "
    "Block_41 stays wholly blank only in the diagnostic because its source Shield/Book-with-3 glyphs lack safe placements. "
    "No Payload writes or canonical asset changes; v1 is preserved; see p.030 v2 proposal/report."
)
buf = io.StringIO()
csv.writer(buf, lineterminator="\n").writerow(row)
lines[row_index] = buf.getvalue()
write_text(status_path, "".join(lines))


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
    raise AssertionError(f"Expected text not found in {path}: {old[:80]!r}")


report_path = ROOT / "docs/project-progress/2026-10-16-p030-icons-conditions-tags-symbols-proposal-v2.md"
report = """# 2026-10-16 — p.30: proposta “Ícones, Condições, Tags e Símbolos” v2

## Resultado

A v2 estruturou 19 unidades localizáveis. Dezoito passaram no Viewer PT-BR, Copyfit V3 de impressão e PDF; os 19 campos completos foram conferidos no Editor read-only e cancelados sem salvar. Block_41, o exemplo com glifos inline, fica inteiro em branco somente no diagnóstico. O texto proposto e as notas de posicionamento continuam no JSON/Markdown. A proposta v1 permanece intacta como histórico.

O PDF tem uma página de 820,346 × 820,346 pt. As 18 unidades visíveis foram localizadas no texto selecionável. Não há caracteres de substituição ou de uso privado. O Copyfit V3 não mediu excesso à direita ou abaixo; a maior excursão de tinta acima do frame é 1,500 pt e o raster não mostra corte.

## Exceção técnica de composição inline

O parágrafo block_41 contém glifos-fonte de Escudo e Livro com o número 3 entre trechos do texto. O sidecar canônico não registra placements para eles. A auditoria de símbolos mantém `p030-v116-117-n2` bloqueado porque o ícone `combat.page` contém o número 3. Sem uma âncora semântica comprovada, o texto localizado poderia se separar das figuras fixas. Por isso, o parágrafo completo fica em branco somente no Viewer/PDF diagnóstico. O fundo original, inclusive os glifos em suas posições-fonte, continua visível.

## Persistência e revisão humana

O Payload tinha zero traduções PT-BR e zero frames da p.30 antes e depois; as verificações observaram somente GET. Os hashes dos assets canônicos permaneceram iguais. A fila recebeu 19 itens de revisão terminológica/editorial e uma exceção técnica. A proposta não foi aprovada nem publicada.

## Evidências

- Proposta: [JSON](../translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.json) e [Markdown](../translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.md); [proposta v1 histórica](../translations/proposals/page-030-icons-conditions-tags-symbols-v1.md).
- Fonte: [PDF raster oficial](../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v1/source-official-p030.png) e [Viewer EN](../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v1/viewer-en-source-v1.png).
- Viewer/Editor: [captura Viewer](../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/viewer-readonly-pt-BR-diagnostic-v2.png), [captura Editor](../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/editor-readonly-v2.png) e [recibo](../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/viewer-editor-receipt-v2.json).
- PDF/Copyfit: [PDF](../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/page-030-pt-BR-diagnostic-v2.pdf), [raster](../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/print-pt-BR-diagnostic-v2.png), [recibo](../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/pdf-copyfit-receipt-v2.json) e [métricas Copyfit V3](../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2/metrics-pt-BR-diagnostic-v2.json).
"""
write_text(report_path, report)

progress_path = ROOT / "docs/translations/localization-goal-progress.md"
replace_once(progress_path,
    "- **p.29:** proposta v2 cobre 21 unidades; 20/21 passaram no Viewer, Copyfit V3 e PDF, e as 21 propostas completas foram conferidas no Editor read-only. Block_22 permanece inteiro em branco somente no snapshot por estrela preta/branca; a proposta integral foi preservada. Zero Payload writes. As 21 propostas aguardam revisão humana; a exceção técnica do símbolo continua aberta. Ver [relatório v2](../project-progress/2026-10-16-p029-item-upgrades-proposal-v2.md).",
    "- **p.29:** proposta v2 cobre 21 unidades; 20/21 passaram no Viewer, Copyfit V3 e PDF, e as 21 propostas completas foram conferidas no Editor read-only. Block_22 permanece inteiro em branco somente no snapshot por estrela preta/branca; a proposta integral foi preservada. Zero Payload writes. As 21 propostas aguardam revisão humana; a exceção técnica do símbolo continua aberta. Ver [relatório v2](../project-progress/2026-10-16-p029-item-upgrades-proposal-v2.md).\n- **p.30:** proposta v2 cobre 19 unidades; 18/19 passaram Viewer, Copyfit V3 e PDF, e os 19 campos foram conferidos no Editor read-only. Block_41 permanece inteiro em branco somente no snapshot por composição de Escudo/Livro-3 sem placements seguros; a proposta integral foi preservada. A v1 continua intacta. Zero Payload writes; revisão humana e exceção técnica pendentes. Ver [relatório v2](../project-progress/2026-10-16-p030-icons-conditions-tags-symbols-proposal-v2.md).")
replace_once(progress_path, "Doze páginas têm algum conteúdo proposto.", "Treze páginas têm algum conteúdo proposto.")
replace_once(progress_path,
    "e p.29 (21 propostas, 20 verificadas nas três superfícies e 1 bloco inteiro em branco no diagnóstico por exceção de símbolo).",
    "e p.29 (21 propostas, 20 verificadas nas três superfícies e 1 bloco inteiro em branco no diagnóstico por exceção de símbolo), e p.30 (19 propostas, 18 verificadas nas três superfícies e 1 exemplo inline inteiro em branco no diagnóstico).")
replace_once(progress_path,
    "20/21 da p.29 (21/21 campos confirmados no Editor; um bloco em branco no Viewer/PDF diagnóstico).",
    "20/21 da p.29 (21/21 campos confirmados no Editor; um bloco em branco no Viewer/PDF diagnóstico) e 18/19 da p.30 (19/19 campos confirmados no Editor; um exemplo em branco no Viewer/PDF diagnóstico).")
replace_once(progress_path, "pendente nas doze páginas.", "pendente nas treze páginas.")
replace_once(progress_path, "Fila deste conjunto: 246 itens únicos", "Fila deste conjunto: 266 itens únicos")
replace_once(progress_path,
    "São 245 itens abertos e 1 resolvido.",
    "21 decisões humanas e 1 exceção técnica de composição inline p.30. São 265 itens abertos e 1 resolvido.")

readme_path = ROOT / "docs/project-progress/README.md"
replace_once(readme_path, "# Project progress log\n", "# Project progress log\n\n- [2026-10-16 — p.30: proposta “Ícones, Condições, Tags e Símbolos” v2](2026-10-16-p030-icons-conditions-tags-symbols-proposal-v2.md): 18/19 unidades passaram no Viewer, Copyfit V3 e PDF; os 19 campos foram conferidos no Editor read-only; um exemplo com símbolos fica inteiro em branco só no diagnóstico; revisão terminológica e a exceção de composição inline seguem abertas.\n")

state_path = ROOT / "docs/PROJECT_STATE.md"
replace_once(state_path,
    "## Atualização corrente — ativações técnicas e propostas (15 e 16/10/2026)\n",
    "## Atualização corrente — ativações técnicas e propostas (15 e 16/10/2026)\n\n- **p.30:** proposta v2 contém 19 unidades; 18 passaram no Viewer, Copyfit V3 e PDF; os 19 campos foram conferidos no Editor read-only. Block_41 fica inteiro em branco só no diagnóstico por falta de placements semânticos para os símbolos-fonte; a proposta v1 está preservada. Zero Payload writes, revisão humana e exceção de composição pendentes. Ver [relatório v2](project-progress/2026-10-16-p030-icons-conditions-tags-symbols-proposal-v2.md).\n")

handoff_path = ROOT / "PROJECT-HANDOFF.md"
replace_once(handoff_path,
    "## Execução mais recente — 16/10/2026\n",
    "## Execução mais recente — 16/10/2026\n- **p.30:** proposta v2 cobre 19 unidades; 18 passaram no Viewer, Copyfit V3 e PDF, e os 19 campos foram conferidos no Editor read-only. Block_41 fica inteiro em branco só no diagnóstico por símbolos-fonte sem placements seguros; v1 preservada, zero Payload writes. Ver [relatório v2](docs/project-progress/2026-10-16-p030-icons-conditions-tags-symbols-proposal-v2.md).\n")
replace_once(handoff_path,
    "Nenhuma proposta foi persistida no Payload.\n",
    "Nenhuma proposta foi persistida no Payload.\n\nA p.30 agora tem proposta v2 em 19 unidades: 18 verificadas Viewer/Editor/PDF/Copyfit e 1 bloco inteiro em branco no diagnóstico por símbolos inline sem placements seguros. Revisão humana pendente; v1 histórica preservada.\n")

print(json.dumps({
    "humanReviewItemsP30": sum(item["page"] == 30 and item["category"] == "human_terminology_editorial_review" for item in queue["items"]),
    "technicalExceptionsP30": sum(item["page"] == 30 and item["category"] == "unmapped_inline_source_symbol_composition" for item in queue["items"]),
    "queueTotal": len(queue["items"]),
    "queueOpen": sum(item["status"] != "resolved" for item in queue["items"]),
    "queueResolved": sum(item["status"] == "resolved" for item in queue["items"]),
    "report": str(report_path.relative_to(ROOT)).replace("\\", "/"),
}, ensure_ascii=False, indent=2))
