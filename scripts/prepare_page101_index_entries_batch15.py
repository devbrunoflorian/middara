"""Prepare p.101 index entries 168–179 as review proposals only."""
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
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-101-index-entries-batch-15-proposal-2026-10-17-v1.json"
PROPOSAL_REL = "docs/translations/proposals/page-101-index-entries-batch-15-proposal-2026-10-17-v1.json"

TARGETS = {
    "index-168": ("Terrenos", []),
    "index-169": ("Arremessar", [
        "Throw é uma entrada isolada apontada para a p.93; confirmar se nomeia uma ação, efeito ou componente específico antes de fixar a terminologia global.",
    ]),
    "index-170": ("Fichas", []),
    "index-171": ("Valor Total de Armadura", []),
    "index-172": ("Totens", []),
    "index-173": ("Em Direção", [
        "Towards é o rótulo direcional da mecânica “Towards & Away” (p.62). Em Direção é uma forma local para o índice; preservar a distinção direcional em usos futuros.",
    ]),
    "index-174": ("Condição Verdadeira", []),
    "index-175": ("Bolsas do Grupo", [
        "Tuck Bags aponta para componentes da p.6; a forma contextual Party Tuck Bag → Bolsa do Grupo é apenas candidata no registro de termos. Confirmar se o plural e a equivalência se aplicam a esta entrada.",
    ]),
    "index-176": ("Tipo", []),
    "index-177": ("Itens Únicos (quadro IMPORTANTE)", [
        "O texto entre parênteses desambigua a referência de índice. Unique Items é usado na p.13; confirmar a capitalização editorial de IMPORTANTE no rótulo.",
    ]),
    "index-178": ("Saque Único", [
        "Loot → Saque é oficial; Unique Loot aparece como categoria nomeada de carta na p.57. Saque Único é proposta contextual e permanece sujeita a confirmação como termo composto.",
    ]),
    "index-179": ("Não Selecionável", [
        "Unselectable → Não Selecionável é candidato registrado para rótulo de estado, ainda sem decisão oficial; manter pendente de confirmação humana.",
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
    source_lines = {
        (block["id"], line["id"]): line
        for block in dom["blocks"] for line in block.get("lines", [])
    }
    rows_by_id = {row["id"]: row for row in rows_data["rows"]}
    missing = [row_id for row_id in TARGETS if row_id not in rows_by_id]
    if missing:
        raise RuntimeError(f"Index row IDs missing: {missing}")

    candidates = []
    for row_id, (proposal_text, pending_terms) in TARGETS.items():
        row = rows_by_id[row_id]
        span_key = f"{row['keyStem']}__pt-BR"
        line = source_lines[(row["blockId"], row["lineId"])]
        style_span = next(span for span in line["spans"] if span.get("text", "").strip())
        x, y, bottom = row["labelBBox"][0], row["labelBBox"][1], row["labelBBox"][3]
        width = max(0, row["numberBBox"][0] - x - 3)
        font = style_span.get("font", "OptimaLTStd")
        size = float(style_span.get("size", 8))
        weight = 700 if re.search(r"bold|demi|heavy|black", font, re.I) else 400
        italic = bool(re.search(r"italic|oblique", font, re.I))
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
                "color": style_span.get("color", "#231f20"),
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
            "sourceText": row["sourceText"],
            "sourcePdfVisualLineCount": 1,
            "sourcePdfLineIds": [row["lineId"]],
            "proposalText": proposal_text,
            "data": data,
            "technicalStatus": "pending_live_viewer_copyfit_v3_editor_pdf",
            "editorialStatus": "pending_human_review",
            "diagnosticRendering": "proposal",
            "pendingTerms": pending_terms,
        })

    proposal = {
        "proposalId": "p101-index-entries-batch-15",
        "version": "1",
        "title": "Próximas entradas do índice — p. 101",
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
            "openExceptions": sum(bool(item[1]) for item in TARGETS.values()),
        },
        "scopeLimits": [
            "Este lote contém somente index-168–index-179; as demais linhas e o título permanecem fora deste lote.",
            "Referências, líderes e geometria permanecem iguais à fonte; o Viewer recompõe cada líder após o rótulo proposto.",
            "Throw, Towards, Tuck Bags, Unique Items, Unique Loot e Unselectable têm notas de revisão terminológica e não são decisões canônicas.",
            "Terrain → Terrenos, Token → Ficha, Totems → Totens e Loot → Saque reutilizam o glossário oficial; as formas infletidas permanecem locais.",
        ],
        "candidates": candidates,
        "note": "Décimo quinto lote incremental do índice. Somente propostas PT-BR locais; sem escrita de tradução final nem alteração de decisão humana.",
        "revisions": [],
    }

    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    if PROPOSAL_REL not in queue.setdefault("sourceProposals", []):
        queue["sourceProposals"].append(PROPOSAL_REL)
    queue["updated"] = "2026-10-17"
    if apply:
        PROPOSAL_PATH.write_text(json.dumps(proposal, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        QUEUE_PATH.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "candidates": len(candidates),
        "openExceptions": proposal["counts"]["openExceptions"],
        "proposal": PROPOSAL_REL,
        "mode": "apply" if apply else "dry-run",
    }, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    main(args.apply)
