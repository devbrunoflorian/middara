"""Prepare the previously uncovered p.101 index entries 000–011."""
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
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-101-index-entries-batch-1-proposal-2026-10-17-v1.json"
PROPOSAL_REL = "docs/translations/proposals/page-101-index-entries-batch-1-proposal-2026-10-17-v1.json"

TARGETS = {
    "index-000": ("Habilidades", [
        "Ability → Habilidade é usado de forma recorrente nas propostas, mas não consta como decisão no glossário oficial; confirmar a forma global.",
    ]),
    "index-001": ("A qualquer momento", []),
    "index-002": ("Fichas", []),
    "index-003": ("Limitações das Fichas", []),
    "index-004": ("Dados de Batalha de Abraxis", [
        "Abraxis Battle Dice → Dados de Batalha de Abraxis é candidato registrado na p.85, sem decisão oficial. Preservar como proposta local e aguardar revisão do nome do modo/recurso.",
    ]),
    "index-005": ("Conquistas", []),
    "index-006": ("Ações", []),
    "index-007": ("Números de Ativação", [
        "Activation Numbers aponta para a mecânica de ativação da p.56; Números de Ativação é uma equivalência local ainda não incluída no glossário.",
    ]),
    "index-008": ("Grupo Ativo", [
        "Active Group aponta para a organização do grupo na p.10; Grupo Ativo é proposta contextual e permanece sujeita a revisão terminológica.",
    ]),
    "index-009": ("Modo Aventura", [
        "Adventure Mode → Modo Aventura é a recomendação atual do registro de candidatos, mas o termo ainda não é oficial; conservar esta forma apenas na proposta local.",
    ]),
    "index-010": ("Aventureiros", []),
    "index-011": ("Mecânicas de Aventura", [
        "Adventure Mechanics → Mecânicas de Aventura é proposta de rótulo de seção baseada na p.10; confirmar em conjunto com os nomes de modo e fases.",
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
        "proposalId": "p101-index-entries-batch-1",
        "version": "1",
        "title": "Entradas iniciais do índice — p. 101",
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
            "Este lote inicial cobre as doze entradas index-000–index-011, cuja ausência foi identificada ao conferir a cobertura dos lotes já conectados.",
            "Referências, líderes, fontes, tamanhos e frames seguem a geometria extraída; copyfit PT-BR continua pendente de medição no PageRenderer/Editor/PDF.",
            "Ability, Abraxis Battle Dice, Activation Numbers, Active Group, Adventure Mode e Adventure Mechanics permanecem propostas terminológicas locais.",
            "Token → Ficha e Adventurers → Aventureiros reutilizam formas oficiais; as demais escolhas não alteram o glossário.",
        ],
        "candidates": candidates,
        "note": "Lote inicial preparado retroativamente para cobrir as entradas index-000–index-011 que faltavam; somente propostas locais, sem escrita final nem alteração de decisão humana.",
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
