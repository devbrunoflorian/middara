"""Verify and record the p.25 v8 whole-unit diagnostic correction."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import tempfile
import unicodedata
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PROOF_REL = "output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v8"
PROOF = ROOT / PROOF_REL
PDF = PROOF / "page-025-pt-BR-v8.pdf"
PDF_RASTER = PROOF / "pdf-render-v8.png"
VIEWER = PROOF / "viewer-pt-BR-v8.png"
PRINT = PROOF / "print-v8.png"
METRICS = PROOF / "export-metrics-v8.json"
SNAPSHOT_PATH = PROOF / "snapshot/snapshot.json"
SNAPSHOT_DOM = PROOF / "snapshot/pages/page_025/page_025_dom.json"
BLANKING = PROOF / "diagnostic-blanking-v8.json"
VIEWER_RECEIPT = PROOF / "viewer-editor-receipt-v8.json"
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v8.json"
PROPOSAL_MD = ROOT / "docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v8.md"
QUEUE_PATH = ROOT / "docs/translations/localization-exceptions.json"
STATUS_PATH = ROOT / "docs/translations/page-status.csv"
GOAL_PROGRESS = ROOT / "docs/translations/localization-goal-progress.md"
PROJECT_STATE = ROOT / "docs/PROJECT_STATE.md"
PROJECT_HANDOFF = ROOT / "PROJECT-HANDOFF.md"
PROJECT_README = ROOT / "docs/project-progress/README.md"
TRANSLATIONS_README = ROOT / "docs/translations/README.md"
PROGRESS_REPORT = ROOT / "docs/project-progress/2026-10-16-p025-adventurer-card-proposal-v8.md"
SOURCE_DIR = ROOT / "apps/web/public/pages/page_025"
PAGE_PT = 820.3460083007812
THRESHOLD_PT = 0.05


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_bytes(path: Path, data: bytes) -> None:
    fd, temporary = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def write_json(path: Path, value: object) -> None:
    atomic_bytes(path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def write_text(path: Path, value: str) -> None:
    atomic_bytes(path, value.encode("utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFC", value).replace("\uFFFC", " ").replace("\u00AD", "")
    value = re.sub(r"(?<=\w)-\s+(?=\w)", "-", value)
    return re.sub(r"\s+", " ", value).strip()


def plain_text(record: dict) -> str:
    return "".join(
        "" if segment.get("symbolId") else str(segment.get("text", ""))
        for segment in record.get("data", {}).get("segments", [])
    )


def update_line(path: Path, predicate, replacement: str, *, required: bool = True) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    matches = [index for index, line in enumerate(lines) if predicate(line)]
    if not matches:
        if required:
            raise ValueError(f"No matching line found in {path}")
        return
    if len(matches) != 1:
        raise ValueError(f"Expected one matching line in {path}, found {len(matches)}")
    lines[matches[0]] = replacement
    write_text(path, "\n".join(lines) + "\n")


def replace_once(path: Path, old: str, new: str) -> None:
    value = path.read_text(encoding="utf-8")
    if new in value:
        return
    if old not in value:
        raise ValueError(f"Expected text not found in {path}: {old[:100]!r}")
    write_text(path, value.replace(old, new, 1))


proposal = read_json(PROPOSAL_PATH)
snapshot = read_json(SNAPSHOT_PATH)
blanking = read_json(BLANKING)
viewer = read_json(VIEWER_RECEIPT)
metrics = read_json(METRICS)
assert proposal["page"] == 25 and proposal["version"] == 8
assert len(proposal["candidates"]) == 12
assert blanking["blankedUnitCount"] == 3
assert viewer["candidateCount"] == 12 and viewer["renderedCandidateCount"] == 9
assert viewer["editorVerifiedCandidateCount"] == 9
assert viewer["editorBoundaryMismatchCount"] == 0
assert viewer["payload"]["unchanged"] is True
assert viewer["canonicalAssetsUnchanged"] is True
assert viewer["saveClicked"] is False
assert viewer["blockedMutations"] == []
assert len(snapshot["translations"]) == 13

visible = [candidate for candidate in proposal["candidates"] if candidate["diagnosticRendering"] == "proposal"]
blanked = [candidate for candidate in proposal["candidates"] if candidate["diagnosticRendering"] == "blank_whole_unit_diagnostic_only"]
assert len(visible) == 9 and len(blanked) == 3
assert metrics["page"] == 25 and metrics["language"] == "pt-BR"
assert abs(metrics["print"]["pageWidthPt"] - PAGE_PT) < 0.02
assert abs(metrics["print"]["pageHeightPt"] - PAGE_PT) < 0.02

with pymupdf.open(PDF) as document:
    assert document.page_count == 1, f"Expected one-page PDF, got {document.page_count}"
    page_count = document.page_count
    page = document[0]
    rect = page.rect
    assert abs(rect.width - PAGE_PT) < 0.02 and abs(rect.height - PAGE_PT) < 0.02, f"Unexpected PDF page box: {rect}"
    extracted = page.get_text()
    image_count = len(page.get_images(full=True))

assert "\uFFFD" not in extracted, "PDF contains replacement characters"
private_use = [char for char in extracted if 0xE000 <= ord(char) <= 0xF8FF]
assert not private_use, f"PDF contains private-use characters: {len(private_use)}"
pdf_text = normalize(extracted)
metrics_by_key = {target["spanKey"]: target for target in metrics["print"]["translationTargets"]}
assert len(metrics_by_key) == 13
copyfit_checks: list[dict[str, object]] = []
visible_text_checks: list[dict[str, object]] = []

for candidate in visible:
    key = candidate["spanKey"]
    metric_key = key if key.endswith("__pt-BR") else key + "__pt-BR"
    target = metrics_by_key.get(metric_key)
    assert target is not None, f"Missing Copyfit V3 print measurement for {metric_key}"
    expected = normalize(candidate["proposalText"])
    assert normalize(target.get("text", "")) == expected, f"Rendered target differs from proposal for {metric_key}"
    assert expected in pdf_text, f"Complete visible candidate is missing from PDF: {metric_key}"
    excess = target["edgeExcessPt"]
    assert excess["right"] <= THRESHOLD_PT and excess["bottom"] <= THRESHOLD_PT, f"Copyfit V3 overflow {metric_key}: {excess}"
    copyfit_checks.append({
        "spanKey": metric_key,
        "lineCount": target["lineCount"],
        "widestLinePt": target["widestLinePt"],
        "frameRectPt": target["frameRectPt"],
        "contentBoundsPt": target["contentBoundsPt"],
        "edgeExcessPt": excess,
        "status": "copyfit_v3_pass",
    })
    visible_text_checks.append({"spanKey": metric_key, "textMatchesViewerMetric": True, "completeTextPresentInPdf": True})

blank_checks: list[dict[str, object]] = []
for candidate in blanked:
    source = normalize(candidate["sourceText"])
    proposed = normalize(candidate["proposalText"])
    assert source and proposed
    assert source not in pdf_text, f"English source fallback leaked into PDF: {candidate['spanKey']}"
    assert proposed not in pdf_text, f"Partial or full proposal leaked for blocked unit: {candidate['spanKey']}"
    blank_checks.append({
        "spanKey": candidate["spanKey"],
        "sourceTextAbsentFromPdf": True,
        "proposalTextAbsentFromPdf": True,
        "completeProposalPreservedInJson": True,
        "wholeUnitBlankedInSnapshot": True,
    })

saved_records = [record for record in snapshot["translations"] if int(record.get("id", 0)) in {320, 321, 322, 323}]
assert sorted(int(record["id"]) for record in saved_records) == [320, 321, 322, 323]
for record in saved_records:
    expected = normalize(plain_text(record))
    assert expected and expected in pdf_text, f"Preserved human record {record['id']} is missing from PDF"

max_right_bottom = max(
    [max(item["edgeExcessPt"]["right"], item["edgeExcessPt"]["bottom"]) for item in copyfit_checks],
    default=0.0,
)
max_top_excess = max((item["edgeExcessPt"]["top"] for item in copyfit_checks), default=0.0)
right_bottom_overflow_count = sum(
    item["edgeExcessPt"]["right"] > THRESHOLD_PT or item["edgeExcessPt"]["bottom"] > THRESHOLD_PT
    for item in copyfit_checks
)
assert right_bottom_overflow_count == 0

copyfit_receipt = {
    "status": "p025_v8_9_visible_candidates_copyfit_v3_pass_three_whole_unit_diagnostic_blanks",
    "page": 25,
    "locale": "pt-BR",
    "pdf": PDF.relative_to(ROOT).as_posix(),
    "pageCount": 1,
    "mediaBoxPt": {"width": rect.width, "height": rect.height},
    "copyfitEngine": "Copyfit V3 print metrics",
    "rightBottomTolerancePt": THRESHOLD_PT,
    "visibleCandidateCount": len(visible),
    "diagnosticBlankUnitCount": len(blanked),
    "copyfitV3PassedCandidateCount": len(copyfit_checks),
    "rightOrBottomOverflowCount": right_bottom_overflow_count,
    "maxRightOrBottomExcessPt": max_right_bottom,
    "maxTopGlyphExtentExcessPt": max_top_excess,
    "rasterReview": "The Viewer, print screenshot and independently rendered PDF raster were visually inspected. All nine visible PT-BR proposals are legible without visible clipping or collision. The three failed source units are wholly blank in the diagnostic while the original background remains visible.",
    "copyfitChecks": copyfit_checks,
}
pdf_receipt = {
    "status": "passed_v8_single_page_pdf_with_nine_visible_candidates_and_three_whole_unit_blanks",
    "page": 25,
    "locale": "pt-BR",
    "pdf": PDF.relative_to(ROOT).as_posix(),
    "pages": page_count,
    "pageSizePt": [rect.width, rect.height],
    "pageImageCount": image_count,
    "snapshotTranslationRecords": len(snapshot["translations"]),
    "visibleCandidateCount": len(visible),
    "preservedHumanRecords": len(saved_records),
    "diagnosticBlankUnitCount": len(blanked),
    "visibleCandidateChecks": visible_text_checks,
    "diagnosticBlankChecks": blank_checks,
    "replacementCharacters": extracted.count("\uFFFD"),
    "privateUseCharacters": len(private_use),
    "selectableCharacters": len(extracted),
    "payloadWrites": 0,
    "canonicalChanges": 0,
}
write_json(PROOF / "copyfit-v3-receipt-v8.json", copyfit_receipt)
write_json(PROOF / "pdf-verification-v8.json", pdf_receipt)

v7_hashes = read_json(ROOT / "output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v7/source-hashes-v2.json")
source_hashes = {
    key: value for key, value in v7_hashes.items()
    if key in {"page_025_dom.json", "background.webp", "layout_frames.json", "sourcePdfSha256", "payloadRecordsBefore", "payloadLayoutFramesBefore"}
}
for name in ("page_025_dom.json", "background.webp", "layout_frames.json"):
    source_hashes[name + "Current"] = sha256(SOURCE_DIR / name)
    assert source_hashes[name + "Current"] == v7_hashes[name], f"Canonical p.25 source changed: {name}"
source_hashes.update({
    "snapshotSha256": sha256(SNAPSHOT_PATH),
    "snapshotDomSha256": sha256(SNAPSHOT_DOM),
    "viewerEditorReceiptSha256": sha256(VIEWER_RECEIPT),
    "payloadWrites": 0,
    "canonicalChanges": 0,
})
write_json(PROOF / "source-hashes-v8.json", source_hashes)

proposal["status"] = "partial_editable_text_proposal_v8_9_units_viewer_editor_copyfit_v3_pdf_verified_three_whole_unit_diagnostic_blanks_human_review_artwork_and_structure_exceptions"
proposal["copyfit"] = {
    "status": "passed_for_nine_visible_candidates_with_three_whole_unit_diagnostic_blanks",
    "engine": "Copyfit V3 print metrics",
    "metrics": f"{PROOF_REL}/export-metrics-v8.json",
    "receipt": f"{PROOF_REL}/copyfit-v3-receipt-v8.json",
    "visibleCandidateCount": 9,
    "printCandidateCount": 9,
    "diagnosticBlankUnitCount": 3,
    "rightAndBottomEdgeExcessPt": max_right_bottom,
    "rightBottomTolerancePt": THRESHOLD_PT,
    "failedCandidates": [
        {"spanKey": item["spanKey"], "sourceBlockId": item["sourceBlockId"], "reason": item["technicalStatus"]}
        for item in blanked
    ],
    "rasterReview": copyfit_receipt["rasterReview"],
}
proposal["counts"].update({
    "verifiedInViewer": 9,
    "verifiedInEditor": 9,
    "verifiedInPdf": 9,
    "copyfitV3Checked": 9,
    "copyfitV3PassedCandidates": 9,
    "copyfitV3FailedVisibleCandidates": 0,
    "diagnosticBlankUnits": 3,
    "preservedHumanRecords": 4,
    "artworkExceptions": 14,
    "technicalExceptions": 3,
})
proposal["validation"] = {
    "viewerEditorReceipt": f"{PROOF_REL}/viewer-editor-receipt-v8.json",
    "pdfReceipt": f"{PROOF_REL}/pdf-verification-v8.json",
    "copyfitV3Receipt": f"{PROOF_REL}/copyfit-v3-receipt-v8.json",
    "pdf": PDF.relative_to(ROOT).as_posix(),
    "pdfRaster": PDF_RASTER.relative_to(ROOT).as_posix(),
    "viewerScreenshot": VIEWER.relative_to(ROOT).as_posix(),
    "printScreenshot": PRINT.relative_to(ROOT).as_posix(),
    "blankingReceipt": BLANKING.relative_to(ROOT).as_posix(),
    "verifiedCandidateCount": 9,
    "blankedWholeUnitCount": 3,
    "payloadWrites": 0,
    "canonicalAssetsUnchanged": True,
}
proposal["sourceReview"]["fidelityNote"] = (
    "The official PDF, English Viewer and one-page English export were compared. The complete Nightingale card remains printed in background.webp. "
    "Nine editable proposals passed Viewer, read-only Editor, Copyfit V3 and one-page PDF checks. The three failed body/legend units are wholly blank only in the isolated v8 PT-BR diagnostic; full source and proposal text remain preserved. Four saved human translations are unchanged."
)
for candidate in proposal["candidates"]:
    if candidate["diagnosticRendering"] == "proposal":
        candidate["status"] = "technically_verified_pending_human_review"
        candidate["technicalStatus"] = "verified_in_viewer_readonly_editor_copyfit_v3_and_pdf"
        candidate["editorialStatus"] = "pending_human_review"
        candidate["verifiedIn"] = ["PT-BR Viewer v8", "read-only Admin Editor v8", "Copyfit V3 print metrics v8", "isolated one-page PT-BR PDF v8 and independent raster"]
    else:
        candidate["status"] = "whole_unit_blank_in_v8_diagnostic_pending_structure_repair_human_review"
        candidate["technicalStatus"] = "blocked_by_verified_viewer_and_editor_unit_boundary_failure"
        candidate["editorialStatus"] = "pending_human_review"
        candidate["diagnosticRendering"] = "blank_whole_unit_diagnostic_only"
        candidate["verifiedIn"] = ["whole source unit absent from PT-BR Viewer v8 and PDF v8", "full source and PT-BR proposal preserved in JSON/Markdown"]
proposal["payload"]["writes"] = 0
proposal["payload"]["existingPageRecords"] = 4
proposal["payload"]["readOnlyMethod"] = "GET"
write_json(PROPOSAL_PATH, proposal)

markdown = PROPOSAL_MD.read_text(encoding="utf-8")
markdown = markdown.replace("# p.25 — proposta PT-BR “Componentes da Carta de Aventureiro” v7", "# p.25 — proposta PT-BR “Componentes da Carta de Aventureiro” v8")
markdown = markdown.replace("p025-adventurer-card-proposal-v7", "p025-adventurer-card-proposal-v8")
markdown = markdown.replace("page-025-adventurer-card-proposal-2026-10-16-v7", "page-025-adventurer-card-proposal-2026-10-16-v8")
lines = markdown.splitlines()
for index, line in enumerate(lines):
    if line.startswith("**Estado:**"):
        lines[index] = "**Estado:** 12 unidades editáveis têm proposta; 9/9 unidades ativas passaram Viewer, Editor read-only, Copyfit V3 e PDF de uma página. As três unidades com falha ficam integralmente em branco apenas no diagnóstico v8; suas fontes e propostas completas permanecem preservadas. Quatorze grupos impressos no card aguardam localização de arte. Quatro traduções humanas (IDs 320–323) foram mantidas; zero writes no Payload e nenhuma alteração canônica."
        break
else:
    raise ValueError("Missing p.25 proposal status line.")
start = lines.index("## Verificações técnicas")
end = lines.index("## Unidades de página editáveis")
technical = [
    "## Verificações técnicas",
    "",
    "- Viewer PT-BR: 9/9 candidatos ativos visíveis e correspondentes; os três textos-fonte bloqueados estão ausentes, sem fallback ou tradução parcial.",
    "- Editor read-only: 9/9 candidatos ativos selecionados e conferidos; todos os diálogos foram cancelados sem salvar.",
    f"- Copyfit V3/PDF: 9 candidatos visíveis; excesso direito/inferior máximo de {max_right_bottom:.3f} pt (tolerância 0,05 pt). O PDF tem uma página de 820,346 × 820,346 pt; zero caracteres de substituição/uso privado.",
    "- Blanking diagnóstico: block_84, block_86 e block_87 ficam vazios como unidades inteiras somente no snapshot PT-BR. As propostas completas permanecem no JSON/Markdown; os spans originais não foram alterados no canônico.",
    "- Raster: Viewer, impressão e raster independente do PDF foram inspecionados. Não há colisão/corte visível nos nove alvos PT-BR ativos; a arte original permanece visível.",
    "- Payload: quatro registros humanos antes/depois, IDs 320–323 intactos; somente GET; zero writes. DOM, arte e molduras canônicas mantiveram os hashes de origem.",
]
lines = lines[:start] + technical + [""] + lines[end:]
if "**Estado:**" not in "\n".join(lines) or "## Unidades em branco no diagnóstico v8" not in "\n".join(lines):
    raise ValueError("p.25 v8 Markdown is missing its status or blank-unit section.")
if "p025-adventurer-card-proposal-v7/snapshot" in "\n".join(lines):
    raise ValueError("p.25 v8 Markdown still points to the v7 active snapshot.")
lines.extend([
    "",
    "## Histórico",
    "",
    "A v7 foi preservada como registro histórico e usava fallback inglês nas três unidades. A v8 corrige apenas o diagnóstico isolado; não altera a proposta integral, a fonte canônica nem os quatro registros humanos.",
    "",
    "Evidências v8: [Viewer](../../../" + VIEWER.relative_to(ROOT).as_posix() + "), [Editor read-only](../../../" + (PROOF / "editor-readonly-v8.png").relative_to(ROOT).as_posix() + "), [PDF](../../../" + PDF.relative_to(ROOT).as_posix() + "), [raster independente](../../../" + PDF_RASTER.relative_to(ROOT).as_posix() + "), [Copyfit V3](../../../" + (PROOF / "copyfit-v3-receipt-v8.json").relative_to(ROOT).as_posix() + ").",
    "",
    "Histórico v7: [proposta JSON](page-025-adventurer-card-proposal-2026-10-16-v7.json), [Markdown](page-025-adventurer-card-proposal-2026-10-16-v7.md) e [relatório](../../project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md).",
])
write_text(PROPOSAL_MD, "\n".join(lines) + "\n")

report = f"""# 2026-10-16 — p.25: proposta PT-BR v8 e blanking diagnóstico integral

## Correção

A v7 deixava os corpos/legenda de `block_84`, `block_86` e `block_87` em fallback inglês devido a falhas reais de limites de unidade/seleção. Isso contrariava a instrução do Goal para propostas diagnósticas PT-BR. A v8 preserva as três propostas completas, mas deixa todos os spans de cada unidade em branco somente no DOM copiado do snapshot. O Viewer EN, o DOM canônico, o background original e as quatro traduções humanas permanecem intactos.

## Verificação

- Viewer: 9/9 candidatos ativos visíveis; os três textos-fonte bloqueados não aparecem e nenhuma tradução parcial é exibida.
- Editor read-only: 9/9 candidatos ativos correspondem exatamente; todos os diálogos foram cancelados sem salvar.
- Copyfit V3: {len(copyfit_checks)}/9 candidatos ativos passam; excesso máximo direito/inferior de {max_right_bottom:.3f} pt, com tolerância de 0,05 pt.
- PDF: uma página de {rect.width:.3f} × {rect.height:.3f} pt; nove candidatos ativos e quatro traduções humanas preservadas aparecem. Os textos-fonte e propostas dos três bloqueios não aparecem; não há caracteres de substituição ou de uso privado.
- Raster: Viewer, captura de impressão e raster independente do PDF foram inspecionados. Nenhuma colisão ou corte visível nos nove candidatos ativos; as três unidades bloqueadas estão inteiramente vazias e o background fonte continua presente.
- Persistência: apenas chamadas GET; IDs humanos 320–323 inalterados; zero Payload writes e zero mudanças canônicas.

## Pendências

A revisão terminológica/editorial das 12 propostas, 14 grupos de texto impresso na carta e os três reparos estruturais continuam abertos. A página não está aprovada nem integralmente localizada.

## Evidências

- Proposta v8: [JSON](../translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v8.json) e [Markdown](../translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v8.md).
- Provas: [Viewer/Editor receipt](../../{PROOF_REL}/viewer-editor-receipt-v8.json), [blanking exato](../../{PROOF_REL}/diagnostic-blanking-v8.json), [Copyfit V3](../../{PROOF_REL}/copyfit-v3-receipt-v8.json), [PDF](../../{PROOF_REL}/page-025-pt-BR-v8.pdf), [raster](../../{PROOF_REL}/pdf-render-v8.png), [métricas](../../{PROOF_REL}/export-metrics-v8.json) e [hashes](../../{PROOF_REL}/source-hashes-v8.json).
- Histórico v7 preservado: [relatório](2026-10-16-p025-adventurer-card-proposal-v7.md).
"""
write_text(PROGRESS_REPORT, report)

queue = read_json(QUEUE_PATH)
tech_ids = {"p25-block-84-body::structure-repair", "p25-block-86-legend::structure-repair", "p25-block-87-body::structure-repair"}
updated_tech: set[str] = set()
evidence = [
    PROPOSAL_PATH.relative_to(ROOT).as_posix(),
    PROPOSAL_MD.relative_to(ROOT).as_posix(),
    (PROOF / "diagnostic-blanking-v8.json").relative_to(ROOT).as_posix(),
    (PROOF / "viewer-editor-receipt-v8.json").relative_to(ROOT).as_posix(),
    (PROOF / "pdf-verification-v8.json").relative_to(ROOT).as_posix(),
    (PROOF / "copyfit-v3-receipt-v8.json").relative_to(ROOT).as_posix(),
]
for item in queue["items"]:
    if item.get("id") in tech_ids:
        item["requiredAction"] = (
            "Repair the occurrence-specific source references and Admin selection boundary, then rerun Viewer, Editor and PDF checks. "
            "Until then, keep the whole unit blank only in the isolated PT-BR diagnostic; do not show source-English fallback or partial PT-BR."
        )
        item["diagnosticRendering"] = "blank_whole_unit_diagnostic_only"
        item["blankedSpanKeys"] = item.get("spanKeys", [])
        item["verifiedIn"] = list(dict.fromkeys([*(item.get("verifiedIn") or []), "v8 confirms whole-unit blank in Viewer/PDF; source and complete PT-BR proposal remain preserved"]))
        item["evidence"] = list(dict.fromkeys([*(item.get("evidence") or []), *evidence]))
        updated_tech.add(item["id"])
    if item.get("page") == 25 and item.get("category") == "human_terminology_editorial_review":
        item["evidence"] = list(dict.fromkeys([*(item.get("evidence") or []), *evidence]))
if updated_tech != tech_ids:
    raise ValueError(f"p.25 technical exceptions not reconciled: {sorted(tech_ids - updated_tech)}")
queue["sourceProposals"] = list(dict.fromkeys([*(queue.get("sourceProposals") or []), PROPOSAL_PATH.relative_to(ROOT).as_posix(), PROPOSAL_MD.relative_to(ROOT).as_posix()]))
queue["updated"] = "2026-10-16"
write_json(QUEUE_PATH, queue)

rows = list(csv.reader(io.StringIO(STATUS_PATH.read_text(encoding="utf-8"), newline="")))
assert len(rows) == 103 and rows[0][0] == "pdf_page"
page25 = next(row for row in rows[1:] if row[0] == "25")
page25[3] = "official_pdf_vs_viewer_visual_reviewed_2026-10-16"
page25[4] = "proposal_v8_9_of_12_viewer_editor_copyfit_v3_pdf_verified_three_whole_unit_diagnostic_blanks_artwork_structure_human_review_pending"
page25[5] = (
    "12 editable proposals; 9 passed Viewer, read-only Editor, Copyfit V3 and one-page PDF. block_84, block_86 and block_87 are blank as whole units only in the v8 PT-BR diagnostic; complete source/proposals are preserved and no English fallback or partial PT-BR appears. Four saved human translations (IDs 320-323) remain unchanged. Fourteen card-art groups, three structure repairs and human review remain open. Zero Payload writes; canonical assets unchanged. See p.025 v8 report."
)
csv_output = io.StringIO(newline="")
csv.writer(csv_output, lineterminator="\n").writerows(rows)
status_bytes = csv_output.getvalue().encode("utf-8")
assert len(list(csv.reader(io.StringIO(status_bytes.decode("utf-8"), newline="")))) == 103
atomic_bytes(STATUS_PATH, status_bytes)

new_goal_bullet = "- **p.25:** proposta v8 cobre 12 unidades editáveis; 9/9 candidatas ativas passaram Viewer, Editor read-only, Copyfit V3 e PDF. block_84, block_86 e block_87 ficam inteiros em branco somente no diagnóstico, sem fallback inglês ou tradução parcial; fontes e propostas completas permanecem preservadas. Quatro traduções humanas foram preservadas; 14 grupos em arte, três reparos estruturais e revisão humana continuam pendentes. Zero Payload writes. Ver [relatório v8](../project-progress/2026-10-16-p025-adventurer-card-proposal-v8.md)."
replace_once(GOAL_PROGRESS,
    "- **p.25:** proposta v7 cobre 12 unidades editáveis; 9/9 candidatos ativos passaram Viewer, Editor read-only e PDF, e três ficam em fallback inglês até reparar limites de unidade/seleção. O raster não mostra colisões; p.83 cabe em uma linha e p.85 em três. Quatro traduções humanas foram preservadas; 14 grupos em arte, três reparos técnicos e a revisão humana seguem pendentes. Zero writes no Payload. Ver [relatório v7](../project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md).",
    new_goal_bullet)
replace_once(GOAL_PROGRESS,
    "p.25 (12 propostas; 9 verificadas e 3 bloqueadas)",
    "p.25 (12 propostas; 9 verificadas em Viewer/Editor/PDF/Copyfit V3 e 3 unidades inteiras em branco somente no diagnóstico)")
replace_once(GOAL_PROGRESS,
    "9/9 candidatas ativas da p.25,",
    "9/9 candidatas ativas da p.25 em Viewer/Editor/PDF/Copyfit V3 (três unidades inteiras em branco somente no diagnóstico),")

state_p25_old = "- **p.25:** proposta v7 cobre 12 unidades editáveis; 9/9 candidatos ativos passaram Viewer, Editor read-only e PDF, e três ficam em fallback inglês até reparar limites de unidade/seleção. O raster não mostra colisões; p.83 cabe em uma linha e p.85 em três. Quatro traduções humanas foram preservadas; 14 grupos em arte, três reparos técnicos e a revisão humana seguem pendentes. Zero writes no Payload. Ver [relatório v7](project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md)."
state_p25_new = "- **p.25:** proposta v8 cobre 12 unidades editáveis; 9/9 candidatas ativas passaram Viewer, Editor read-only, Copyfit V3 e PDF. block_84, block_86 e block_87 ficam inteiros em branco somente no diagnóstico, sem fallback inglês ou tradução parcial; fontes e propostas completas permanecem preservadas. Quatro traduções humanas foram preservadas; 14 grupos em arte, três reparos estruturais e revisão humana continuam pendentes. Zero Payload writes. Ver [relatório v8](project-progress/2026-10-16-p025-adventurer-card-proposal-v8.md)."
replace_once(PROJECT_STATE, state_p25_old, state_p25_new)
replace_once(PROJECT_STATE,
    "p.25 (9 candidatos verificados nas três superfícies, três reparos estruturais e arte pendentes)",
    "p.25 (9 candidatos verificados em Viewer/Editor/Copyfit V3/PDF; três unidades inteiras em branco somente no diagnóstico, três reparos estruturais e arte pendentes)")

replace_once(PROJECT_HANDOFF,
    "p.25 (9 candidatos ativos verificados, três unidades em fallback estrutural e arte/revisão humana pendentes)",
    "p.25 (9 candidatos ativos verificados em Viewer/Editor/Copyfit V3/PDF; três unidades inteiras em branco somente no diagnóstico, com arte/revisão humana pendentes)")
replace_once(PROJECT_HANDOFF, state_p25_old.replace("project-progress/", "docs/project-progress/"), state_p25_new.replace("project-progress/", "docs/project-progress/"))

update_line(PROJECT_README,
    lambda line: "p.25: proposta “Componentes da Carta de Aventureiro” v7" in line,
    "- [2026-10-16 — p.25: proposta “Componentes da Carta de Aventureiro” v8](2026-10-16-p025-adventurer-card-proposal-v8.md): 9/9 candidatos ativos verificados no Viewer/Editor/Copyfit V3/PDF; três unidades inteiras em branco somente no diagnóstico; 14 grupos de arte e revisão humana pendentes.")

translation_lines = TRANSLATIONS_README.read_text(encoding="utf-8").splitlines()
if not any("page-025-adventurer-card-proposal-2026-10-16-v8.md" in line for line in translation_lines):
    insert_index = next((i for i, line in enumerate(translation_lines) if "page-026-item-card-types-proposal-2026-10-16-v1.md" in line), None)
    if insert_index is None:
        raise ValueError("Could not find p.26 proposal entry in translations README.")
    translation_lines.insert(insert_index, "- [`proposals/page-025-adventurer-card-proposal-2026-10-16-v8.md`](proposals/page-025-adventurer-card-proposal-2026-10-16-v8.md): 9/9 active proposals pass Viewer, Editor read-only, Copyfit V3 and PDF; three failed units are blank only as whole units in the diagnostic, with full source and proposals preserved.")
write_text(TRANSLATIONS_README, "\n".join(translation_lines) + "\n")

# Store final receipts and metadata first; the project index points to these verified outputs.
final_proposal = read_json(PROPOSAL_PATH)
assert final_proposal["counts"]["copyfitV3PassedCandidates"] == 9
assert final_proposal["counts"]["diagnosticBlankUnits"] == 3
assert len(list(csv.reader(io.StringIO(STATUS_PATH.read_text(encoding="utf-8"), newline="")))) == 103
assert sha256(SOURCE_DIR / "page_025_dom.json") == source_hashes["page_025_dom.jsonCurrent"]
print(json.dumps({
    "status": "p025_v8_verified_and_recorded",
    "visibleCandidates": len(visible),
    "copyfitV3Passed": len(copyfit_checks),
    "maxRightBottomExcessPt": max_right_bottom,
    "diagnosticBlankUnits": len(blanked),
    "pdfPages": page_count,
    "savedHumanRecordsPreserved": len(saved_records),
    "queueItems": len(queue["items"]),
    "payloadWrites": 0,
    "canonicalChanges": 0,
}, ensure_ascii=False, indent=2))

