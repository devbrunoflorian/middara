#!/usr/bin/env python3
"""Verify p.33 v5 candidate text, PDF, and Copyfit V3 print metrics."""
from __future__ import annotations

import copy
import csv
import io
import json
import re
import unicodedata
from pathlib import Path

import pymupdf


ROOT = Path.cwd()
PROOF_REL = "output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5"
PROOF = ROOT / PROOF_REL
PDF = PROOF / "page-033-pt-BR-v5.pdf"
PDF_RASTER = PROOF / "pdf-render-v5.png"
VIEWER = PROOF / "viewer-v5.png"
PRINT = PROOF / "print-v5.png"
METRICS = PROOF / "export-metrics-v5.json"
PROPOSAL_PATH = PROOF / "proposal-candidates.json"
SNAPSHOT_PATH = PROOF / "snapshot/snapshot.json"
DOM_PATH = ROOT / "apps/web/public/pages/page_033/page_033_dom.json"
QUEUE_PATH = ROOT / "docs/translations/localization-exceptions.json"
BLOCKED_KEY = "page_33_block_22__pt-BR"
PAGE_PT = 820.3460083007812


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


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    value = value.replace("\uFFFC", " ").replace("\u00AD", "")
    value = re.sub(r"(?<=\w)-\s+(?=\w)", "-", value)
    return re.sub(r"\s+", " ", value).strip()


for path in (PDF, PDF_RASTER, VIEWER, PRINT, METRICS, PROPOSAL_PATH, SNAPSHOT_PATH):
    assert path.is_file(), f"Missing p.33 v5 proof file: {path}"

proposal = read_json(PROPOSAL_PATH)
snapshot = read_json(SNAPSHOT_PATH)
metrics_doc = read_json(METRICS)
candidates = proposal["candidates"]
assert len(candidates) == 19
snapshot_records = {item["spanKey"]: item for item in snapshot["translations"]}
assert len(snapshot_records) == 19
blank_keys = [key for key, item in snapshot_records.items() if not item.get("data", {}).get("segments")]
assert blank_keys == [BLOCKED_KEY], f"Unexpected diagnostic blank set: {blank_keys}"

with pymupdf.open(PDF) as doc:
    assert len(doc) == 1, f"Expected one-page PDF; got {len(doc)}"
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
    key = candidate["spanKey"]
    expected = normalize("".join(segment.get("text", "") for segment in candidate["data"].get("segments", [])))
    diagnostic_blank = key in blank_keys
    target = targets[key]
    measured_text = normalize(target.get("text", ""))
    if diagnostic_blank:
        assert candidate.get("proposalText") == "Conjuração:", "Full blocked proposal must remain intact."
        assert target["lineCount"] == 0 and target.get("text") == "", f"Diagnostic text leaked into {key}"
        assert expected and expected not in pdf_text, f"Blocked full label unexpectedly appears in PDF: {key}"
    else:
        assert target["lineCount"] > 0, f"Visible candidate has no measured lines: {key}"
        assert expected == measured_text, f"Rendered text differs from proposal for {key}"
        assert expected in pdf_text, f"Complete visible candidate text missing from PDF: {key}"
    unit_checks.append({
        "spanKey": key,
        "diagnosticBlank": diagnostic_blank,
        "expectedText": expected,
        "completeTextMatchesViewerMetric": expected == measured_text,
        "completeTextPresentInPdf": (expected in pdf_text) if not diagnostic_blank else False,
    })
    excess = target["edgeExcessPt"]
    assert excess["right"] <= 0.05 and excess["bottom"] <= 0.05, f"Copyfit V3 overflow {key}: {excess}"
    copyfit_checks.append({
        "spanKey": key,
        "lineCount": target["lineCount"],
        "widestLinePt": target["widestLinePt"],
        "frameRectPt": target["frameRectPt"],
        "contentBoundsPt": target["contentBoundsPt"],
        "edgeExcessPt": excess,
        "status": "whole_unit_blank_diagnostic_exception" if diagnostic_blank else "copyfit_v3_pass",
    })

max_top_excess = max((item["edgeExcessPt"]["top"] for item in copyfit_checks), default=0)
receipt = {
    "status": "p033_v5_18_visible_candidates_copyfit_v3_pass_one_whole_unit_diagnostic_blank",
    "page": 33,
    "locale": "pt-BR",
    "pdf": PDF.relative_to(ROOT).as_posix(),
    "pageCount": 1,
    "mediaBoxPt": {"width": rect.width, "height": rect.height},
    "visibleCandidateCount": 18,
    "diagnosticBlankUnitCount": 1,
    "replacementCharacterCount": extracted.count("\uFFFD"),
    "privateUseCharacterCount": len(private_use),
    "copyfitEngine": "Copyfit V3 print metrics",
    "copyfitChecks": copyfit_checks,
    "rightOrBottomOverflowCount": sum(
        item["edgeExcessPt"]["right"] > 0.05 or item["edgeExcessPt"]["bottom"] > 0.05
        for item in copyfit_checks
    ),
    "maxTopGlyphExtentExcessPt": max_top_excess,
    "rasterReview": "The print screenshot and independently rendered PDF were inspected after the revisions. No visible clipping/collision among the 18 translated candidates; block_38 remains wholly blank only in the diagnostic and its source die stays at the original background position.",
    "unitChecks": unit_checks,
    "copyfitChecks": copyfit_checks,
}
assert receipt["rightOrBottomOverflowCount"] == 0
write_json(PROOF / "pdf-copyfit-receipt-v5.json", receipt)

proposal["version"] = 5
proposal["status"] = "18_of_19_candidates_viewer_pdf_copyfit_v3_verified_one_whole_unit_diagnostic_blank_fixed_source_die_exception_human_review_pending_artwork_pending"
proposal["counts"].update({
    "visibleCandidateUnitsInV5": 18,
    "editorVerifiedCandidates": 1,
    "copyfitV3Checked": 18,
    "copyfitV3Status": "18_visible_candidates_pass_with_no_right_or_bottom_excess_over_0.05pt_one_whole_unit_blank",
    "copyfitV3PassedCandidates": 18,
    "copyfitV3FailedVisibleCandidates": 0,
    "wholeUnitDiagnosticBlanks": 1,
    "humanReviewCandidates": 19,
    "technicalCompositionExceptions": 1,
})
proposal["validation"] = {
    "viewer": f"{PROOF_REL}/viewer-v5.png",
    "printScreenshot": f"{PROOF_REL}/print-v5.png",
    "pdf": PDF.relative_to(ROOT).as_posix(),
    "pdfRaster": PDF_RASTER.relative_to(ROOT).as_posix(),
    "exportMetrics": METRICS.relative_to(ROOT).as_posix(),
    "copyfitV3Receipt": f"{PROOF_REL}/pdf-copyfit-receipt-v5.json",
    "visibleCandidateCount": 18,
    "viewerPdfCandidatesVerified": 18,
    "editorVerifiedCandidates": 1,
    "copyfitV3PassedCandidates": 18,
    "diagnosticBlankSpanKeys": blank_keys,
    "payloadWrites": 0,
    "canonicalChangesDuringV5": 0,
    "englishArtworkOverlays": 3,
}
write_json(PROPOSAL_PATH, proposal)

docs_json = ROOT / "docs/translations/proposals/page-033-full-prose-proposal-2026-10-16-v5.json"
docs_md = ROOT / "docs/translations/proposals/page-033-full-prose-proposal-2026-10-16-v5.md"
write_json(docs_json, proposal)

markdown = """# p.33 — proposta completa de prosa PT-BR v5

**Estado:** 19 unidades propostas; 18 passaram no Viewer, PDF e Copyfit V3. `block_38` mantém `Conjuração:` preservado no JSON, mas fica inteiro em branco somente no diagnóstico porque colide com o dado roxo-fonte ao lado. Só o campo de Dados Padrão foi conferido no Rich Block Editor. Revisão humana e três overlays em inglês pendentes. Nenhum texto foi salvo no Payload.

## Iteração de copyfit

O Copyfit V3 da v4 mediu excesso à direita em três unidades: block_35 (0,211 pt), block_25 / Custo de SP (1,734 pt) e block_40 / Limite de Aprimoramentos (2,039 pt). As três redações foram encurtadas preservando o sentido. Na v5, as 18 unidades visíveis têm excesso à direita e abaixo de no máximo 0,05 pt igual a zero; block_43 tem 0,035 pt de excesso inferior, dentro da tolerância. A maior excursão de tinta acima do frame é 2,25 pt; o raster foi inspecionado e não mostra corte.

## Exceção e escopo

- `block_38` permanece inteiro em branco apenas no diagnóstico até rastrear semanticamente o dado roxo fixo ou aprovar rótulo mais curto.
- Somente `page_33_unit_p33-block-35-default-dice-paragraph__pt-BR` foi conferido no Editor read-only.
- Magic Staff, Deflection Core e Quick Blow continuam como overlays em inglês; esta não é uma página integralmente localizada.
- A revisão editorial humana de todas as 19 propostas continua pendente.

## Evidências

- [Prova de exportação e Copyfit V3](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5/pdf-copyfit-receipt-v5.json).
- [Viewer](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5/viewer-v5.png), [impressão](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5/print-v5.png), [PDF](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5/page-033-pt-BR-v5.pdf), [raster independente](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5/pdf-render-v5.png) e [métricas](../../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5/export-metrics-v5.json).
- Histórico v4: [proposta e exceção de composição](page-033-full-prose-proposal-2026-10-16-v4.md).
"""
write_text(docs_md, markdown)

report_path = ROOT / "docs/project-progress/2026-10-16-p033-full-prose-proposal-v5.md"
report = """# 2026-10-16 — p.33: proposta completa de prosa v5 e Copyfit V3

## Resultado

A Copyfit V3 da v4 encontrou três excessos direitos (0,211 pt no parágrafo dos dados; 1,734 pt no Custo de SP; 2,039 pt no limite de Aprimoramentos). Revisei as três frases preservando a regra e exportei uma nova prova. Na v5, 18 unidades visíveis passam Copyfit V3; nenhuma tem excesso direito ou inferior acima de 0,05 pt. Block_43 tem apenas 0,035 pt abaixo, dentro da tolerância. A maior excursão de tinta acima do frame é 2,25 pt; a captura de impressão e o raster independente não mostram clipping.

## Exceção técnica ainda aberta

`block_38` (`Conjuração:`) continua inteiro em branco somente no Viewer/PDF diagnóstico. A versão v3 colidia com um dado roxo-fonte fixo, e a v4/v5 mantêm o dado no fundo sem texto sobreposto. O texto proposto continua completo e recuperável. A correção exige placement semântico para o dado ou um rótulo mais curto aprovado.

O Editor read-only verificou apenas a unidade de Dados Padrão. A revisão humana das 19 propostas segue pendente, assim como a localização dos três overlays ingleses. Portanto, a p.33 não está aprovada nem integralmente localizada.

## Persistência

O snapshot v5 não gravou traduções no Payload nem alterou assets canônicos. O patch separado dos cinco dados roxos-fonte da v3 permanece ativo e tem recibo/rollback próprios.

- [JSON da proposta v5](../translations/proposals/page-033-full-prose-proposal-2026-10-16-v5.json) e [Markdown](../translations/proposals/page-033-full-prose-proposal-2026-10-16-v5.md).
- [Recibo Copyfit V3](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5/pdf-copyfit-receipt-v5.json), [Viewer](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5/viewer-v5.png), [PDF](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5/page-033-pt-BR-v5.pdf), [raster](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5/pdf-render-v5.png) e [métricas](../../output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5/export-metrics-v5.json).
- [Histórico v4](2026-10-16-p033-full-prose-proposal-v4.md) registra a colisão original e o blanking integral do rótulo.
"""
write_text(report_path, report)

queue = read_json(QUEUE_PATH)
candidate_by_span = {item["spanKey"]: item for item in candidates}
for item in queue["items"]:
    if item.get("page") == 33 and item.get("category") == "human_terminology_editorial_review":
        candidate = candidate_by_span.get(item.get("spanKey"))
        if candidate:
            item["proposedText"] = candidate["proposalText"]
            for evidence in [docs_json.relative_to(ROOT).as_posix(), docs_md.relative_to(ROOT).as_posix(), PROOF_REL + "/pdf-copyfit-receipt-v5.json"]:
                if evidence not in item.setdefault("evidence", []):
                    item["evidence"].append(evidence)
    if item.get("id") == "p033-casting-label-fixed-source-die-overlap":
        for evidence in [PROOF_REL + "/pdf-copyfit-receipt-v5.json", PROOF_REL + "/pdf-render-v5.png"]:
            if evidence not in item.setdefault("evidence", []):
                item["evidence"].append(evidence)
        item["requiredAction"] = "Rastrear o dado-fonte como placement semântico ou aprovar rótulo curto com espaço suficiente; então repetir Viewer, Copyfit V3 e PDF."
sources = queue.setdefault("sourceProposals", [])
for source in [docs_json.relative_to(ROOT).as_posix(), docs_md.relative_to(ROOT).as_posix()]:
    if source not in sources:
        sources.append(source)
queue["updated"] = "2026-10-16"
write_json(QUEUE_PATH, queue)

status_path = ROOT / "docs/translations/page-status.csv"
status_text = read_text(status_path)
lines = status_text.splitlines(keepends=True)
row_index = next(index for index, line in enumerate(lines) if line.startswith('"33",') or line.startswith("33,"))
row = next(csv.reader([lines[row_index]]))
row[3] = "pdf_vs_viewer_composition_and_ptbr_v5_raster_reviewed_2026-10-16"
row[4] = "proposal_v5_18_of_19_viewer_pdf_copyfit_v3_verified_one_diagnostic_blank_editor_partial_artwork_human_review_pending"
row[5] = (
    "19 prose candidates proposed; 18 pass Viewer, one-page PDF and Copyfit V3 with no right/bottom overrun beyond 0.05 pt. block_38 remains wholly blank only in the diagnostic because Conjuração: collides with a fixed source purple die. Only block_35 was checked in the read-only Editor; human review and three English card overlays remain open. No Payload translation writes; see p.033 v5 proposal/report."
)
buf = io.StringIO()
csv.writer(buf, lineterminator="\n").writerow(row)
lines[row_index] = buf.getvalue()
write_text(status_path, "".join(lines))

progress_path = ROOT / "docs/translations/localization-goal-progress.md"
old_p33 = "- **p.33:** proposta v4 contém 19 unidades; 18 aparecem no Viewer/PDF e block_38 fica inteiro em branco apenas no diagnóstico por colisão com um dado roxo-fonte. Somente block_35 foi conferido no Editor; Copyfit V3, 19 revisões humanas e a localização de três overlays em inglês continuam pendentes. Ver [relatório v4](../project-progress/2026-10-16-p033-full-prose-proposal-v4.md)."
new_p33 = "- **p.33:** proposta v5 contém 19 unidades; 18 passaram no Viewer, PDF e Copyfit V3 sem excesso direito/inferior acima de 0,05 pt. Block_38 permanece inteiro em branco apenas no diagnóstico por colisão com um dado roxo-fonte; só block_35 foi conferido no Editor. Revisão humana e três overlays em inglês pendentes. Ver [relatório v5](../project-progress/2026-10-16-p033-full-prose-proposal-v5.md)."
replace_once(progress_path, old_p33, new_p33)
replace_once(progress_path,
    "e 18/19 da p.33 (19 propostas preservadas; 18 visíveis no Viewer/PDF, só block_35 conferido no Editor e Copyfit V3 pendente).",
    "e 18/19 da p.33 (19 propostas preservadas; 18 visíveis e aprovadas no Copyfit V3, só block_35 conferido no Editor; 1 rótulo inteiro em branco por composição inline).")

readme_path = ROOT / "docs/project-progress/README.md"
replace_once(readme_path,
    "[2026-10-16 — p.33: proposta completa de prosa v4]",
    "[2026-10-16 — p.33: proposta completa de prosa v5]")
replace_once(readme_path,
    "(2026-10-16-p033-full-prose-proposal-v4.md)",
    "(2026-10-16-p033-full-prose-proposal-v5.md)")

translations_readme = ROOT / "docs/translations/README.md"
replace_once(translations_readme,
    "- [`proposals/page-033-conviction-casting-v1.md`](proposals/page-033-conviction-casting-v1.md): 16 editorial copy targets drafted after p.33 source-PDF↔normal-Viewer review; the three card-art overlays remain English and need their own localization step. Copyfit, Editor key reconciliation, and PT export remain pending.",
    "- [`proposals/page-033-conviction-casting-v1.md`](proposals/page-033-conviction-casting-v1.md): historical v1 draft; superseded by the complete-prose v5 proposal below. The three card-art overlays still need their own localization step.\n- [`proposals/page-033-full-prose-proposal-2026-10-16-v5.md`](proposals/page-033-full-prose-proposal-2026-10-16-v5.md): 19 text proposals; 18 pass isolated Viewer, PDF, and Copyfit V3; one label remains wholly blank in the diagnostic due to a fixed source die. Human review and three English card overlays remain pending.")
replace_once(translations_readme,
    "- [`proposals/page-032-discipline-trees-v2.md`](proposals/page-032-discipline-trees-v2.md): 15 PT-BR copy targets prepared after p.32 PDF↔Viewer review; one pre-existing saved example translation is recorded and protected. A real PT Editor click exposed a nested span key, so key reconciliation, copyfit, terminology, and export remain pending.",
    "- [`proposals/page-032-discipline-trees-v2.md`](proposals/page-032-discipline-trees-v2.md): historical source-review draft; the current complete proposal is listed below.\n- [`proposals/page-032-full-page-proposal-2026-10-16-v1.md`](proposals/page-032-full-page-proposal-2026-10-16-v1.md): 15 new PT-BR text candidates pass Viewer, Editor read-only, and isolated PDF review; Copyfit V3 and human review remain pending.")

state_path = ROOT / "docs/PROJECT_STATE.md"
replace_once(state_path,
    "- **p.33:** proposta de prosa v4 com 19 unidades; 18 visíveis no Viewer/PDF isolado e block_38 em branco somente no diagnóstico por colisão com dado roxo fixo. Copyfit V3, revisão humana e três overlays em inglês pendentes; só block_35 foi verificado no Editor. Ver [relatório v4](project-progress/2026-10-16-p033-full-prose-proposal-v4.md).",
    "- **p.33:** proposta de prosa v5 com 19 unidades; 18 visíveis no Viewer/PDF e aprovadas no Copyfit V3 sem excesso direito/inferior acima de 0,05 pt; block_38 fica inteiro em branco somente no diagnóstico por colisão com dado roxo fixo. Revisão humana e três overlays em inglês pendentes; só block_35 foi verificado no Editor. Ver [relatório v5](project-progress/2026-10-16-p033-full-prose-proposal-v5.md).")

handoff_path = ROOT / "PROJECT-HANDOFF.md"
replace_once(handoff_path,
    "- **p.33:** proposta v4 tem 19 unidades; 18 visíveis no Viewer/PDF. block_38 fica inteiro em branco apenas no diagnóstico por colisão com dado roxo-fonte; Copyfit V3, revisão humana e três overlays em inglês pendentes. Só block_35 foi verificado no Editor. Ver [relatório v4](docs/project-progress/2026-10-16-p033-full-prose-proposal-v4.md).",
    "- **p.33:** proposta v5 tem 19 unidades; 18 visíveis no Viewer/PDF e aprovadas no Copyfit V3 sem excesso direito/inferior acima de 0,05 pt. block_38 fica inteiro em branco apenas no diagnóstico por colisão com dado roxo-fonte; revisão humana e três overlays em inglês pendentes. Só block_35 foi verificado no Editor. Ver [relatório v5](docs/project-progress/2026-10-16-p033-full-prose-proposal-v5.md).")

print(json.dumps({
    "status": receipt["status"],
    "visibleCandidates": receipt["visibleCandidateCount"],
    "copyfitCandidatesPassed": sum(item["status"] == "copyfit_v3_pass" for item in copyfit_checks),
    "diagnosticBlankUnits": receipt["diagnosticBlankUnitCount"],
    "rightOrBottomOverflowCount": receipt["rightOrBottomOverflowCount"],
    "maxTopGlyphExtentExcessPt": max_top_excess,
    "queueTotal": len(queue["items"]),
    "queueOpen": sum(item.get("status") != "resolved" for item in queue["items"]),
    "queueResolved": sum(item.get("status") == "resolved" for item in queue["items"]),
    "report": report_path.relative_to(ROOT).as_posix(),
}, ensure_ascii=False, indent=2))
