"""Prepare the eight index labels missed by p.101's original row extractor."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "apps/web/public/pages/page_101"
ROWS_PATH = FOLDER / "contents_rows.json"
DOM_PATH = FOLDER / "page_101_dom.json"
PDF_PATH = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
BACKGROUND_PATH = FOLDER / "background.webp"
QUEUE_PATH = ROOT / "docs/translations/localization-exceptions.json"
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-101-index-entries-batch-17-proposal-2026-10-24-v1.json"
PROPOSAL_REL = "docs/translations/proposals/page-101-index-entries-batch-17-proposal-2026-10-24-v1.json"
REFERENCE_EXCEPTION_ID = "P101-SOURCE-INDEX-BACK-REFERENCE-1"

TARGETS = {
    "index-189": ("Itens com a Tag DOUBLE", [
        "DOUBLE é o identificador da Tag no contexto da p.27; Tag ainda é uma escolha terminológica humana pendente. A forma é provisória e não canoniza a tradução de Tag.",
    ]),
    "index-190": ("Encerrar todas as Ações e Habilidades", []),
    "index-191": ("Materiais", []),
    "index-192": ("Valores", [
        "A linha de referência adjacente exibe 'Back' em vez de um número de página. O destino não foi inferido; a ocorrência permanece na exceção P101-SOURCE-INDEX-BACK-REFERENCE-1.",
    ]),
    "index-193": ("Obter", []),
    "index-194": ("Fases", []),
    "index-195": ("Remover", []),
    "index-196": ("Aprimoramentos", [
        "Aprimoramento é consistente com Item Upgrade → Aprimoramento de Item; a forma genérica de Upgrade continua candidata, não canonizada.",
    ]),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def main(apply: bool) -> None:
    rows_data = json.loads(ROWS_PATH.read_text(encoding="utf-8"))
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    rows_by_id = {row["id"]: row for row in rows_data["rows"]}
    missing_rows = [row_id for row_id in TARGETS if row_id not in rows_by_id]
    if missing_rows:
        raise RuntimeError(f"Index row IDs missing: {missing_rows}")
    source_lines = {
        (block["id"], line["id"]): line
        for block in dom["blocks"] for line in block.get("lines", [])
    }
    blocks = {block["id"]: block for block in dom["blocks"]}
    candidates = []
    for row_id, (proposal_text, pending_terms) in TARGETS.items():
        row = rows_by_id[row_id]
        span_key = f"{row['keyStem']}__pt-BR"
        line = source_lines[(row["blockId"], row["lineId"])]
        source_text = row["sourceText"]
        style_span = next(span for span in line["spans"] if span.get("text", "").strip())
        x, y, bottom = row["labelBBox"][0], row["labelBBox"][1], row["labelBBox"][3]
        width = float(row["labelWidthPt"])
        font = style_span.get("font", "OptimaLTStd")
        size = float(style_span.get("size", 8))
        weight = 700 if re.search(r"bold|demi|heavy|black", font, re.I) else 400
        italic = bool(re.search(r"italic|oblique", font, re.I))
        color = style_span.get("color", "#231f20")
        data = {
            "schemaVersion": 2,
            "spanKey": span_key,
            "bbox": [x, y, x + width, bottom],
            "textAlign": "left",
            "lineHeight": 1,
            "lineHeightMode": "source",
            "segments": [{
                "text": proposal_text,
                "font": font,
                "size": size,
                "weight": weight,
                "style": "italic" if italic else "normal",
                "color": color,
                "disableLigatures": True,
            }],
            "managedSourceSymbols": [],
        }
        candidates.append({
            "blockIndex": row["blockIndex"],
            "sourceBlockId": row["blockId"],
            "sourceUnitId": row_id,
            "spanKey": span_key,
            "language": "pt-BR",
            "sourceText": source_text,
            "sourcePdfVisualLineCount": 1,
            "sourcePdfLineIds": [row["lineId"]],
            "proposalText": proposal_text,
            "data": data,
            "technicalStatus": "pending_live_viewer_copyfit_v3_editor_pdf",
            "editorialStatus": "pending_human_review",
            "diagnosticRendering": "proposal",
            "pendingTerms": pending_terms,
        })

    if len(candidates) != 8:
        raise RuntimeError(f"Expected eight additional index labels, found {len(candidates)}.")

    proposal = {
        "proposalId": "p101-index-entries-batch-17",
        "version": "1",
        "title": "Rótulos de índice omitidos pela extração — p. 101",
        "page": 101,
        "status": "pending_human_review",
        "sourcePdf": PDF_PATH.name,
        "sourceHashes": {
            "sourcePdf": sha256(PDF_PATH),
            "background": sha256(BACKGROUND_PATH),
            "pageDom": sha256(DOM_PATH),
            "contentsRows": sha256(ROWS_PATH),
        },
        "counts": {
            "candidates": len(candidates),
            "existingHumanTranslationsPreserved": 0,
            "priorReviewRecordsPreserved": 0,
            "finalTranslationWrites": 0,
            "openExceptions": 1,
        },
        "scopeLimits": [
            "O lote cobre somente os oito rótulos de índice ausentes identificados no PDF-fonte; as 189 chaves existentes permanecem estáveis.",
            "Texto, símbolos, números de página, fontes e tamanhos originais não são publicados nem aprovados por este lote.",
            "DOUBLE preserva o identificador de Tag referido na p.27; a tradução de Tag continua pendente de decisão humana.",
            "A referência 'Back' ao lado de Values permanece em exceção sem destino inferido.",
            "Todos os candidatos exigem medição Copyfit V3 no PageRenderer e permanecem pendentes de revisão humana.",
        ],
        "candidates": candidates,
        "note": "Décimo sétimo lote incremental do índice. O arquivo contém propostas locais e não escreve traduções finais no Payload.",
        "revisions": [],
    }

    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    if PROPOSAL_REL not in queue.setdefault("sourceProposals", []):
        queue["sourceProposals"].append(PROPOSAL_REL)
    existing = next((item for item in queue.setdefault("items", [])
                     if item.get("id") == REFERENCE_EXCEPTION_ID), None)
    back_row = rows_by_id["index-192"]
    back_line = source_lines[(back_row["blockId"], "line_9_217")]
    back_box = back_row["numberBBox"]
    reference_exception = {
        "id": REFERENCE_EXCEPTION_ID,
        "page": 101,
        "spanKey": back_row["keyStem"] + "__pt-BR",
        "sourceBlockId": back_row["blockId"],
        "sourceLineId": back_line["id"],
        "bboxPt": [[back_box[0], back_box[1], back_box[2], back_box[3]]],
        "category": "source_index_reference_anomaly",
        "status": "open",
        "priority": 2,
        "sourceText": "Back",
        "reason": "A referência impressa ao lado de Values é a palavra 'Back', sem número de página. O PDF-fonte e o PageDOM a registram como texto separado na mesma linha visual; nenhum destino é inferido e o texto-fonte permanece preservado.",
        "diagnosticRendering": "Keep the source reference isolated and unchanged until its intended page is identified; do not parse it as a navigation target or translate it as the interface command 'Voltar'.",
        "evidence": [
            "PDF-fonte oficial, p.101 (índice), linha Values; PageDOM block_9/line_9_217 registra 'Back' separadamente.",
            "A proposta index-192 traduz somente Values → Valores. A anomalia continua visível e aberta para revisão humana.",
        ],
    }
    if existing is None:
        queue["items"].append(reference_exception)
    elif existing != reference_exception:
        raise RuntimeError(f"Existing exception {REFERENCE_EXCEPTION_ID} differs; refusing to overwrite it.")
    queue["updated"] = "2026-10-24"

    if apply:
        if PROPOSAL_PATH.exists():
            current = json.loads(PROPOSAL_PATH.read_text(encoding="utf-8"))
            if current != proposal:
                raise RuntimeError(f"Proposal already exists with different contents: {PROPOSAL_PATH}")
        else:
            PROPOSAL_PATH.write_text(json.dumps(proposal, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        QUEUE_PATH.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "candidates": len(candidates),
        "openExceptions": 1,
        "proposal": PROPOSAL_REL,
        "mode": "apply" if apply else "dry-run",
    }, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    main(args.apply)
