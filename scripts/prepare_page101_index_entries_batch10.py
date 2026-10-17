"""Prepare p.101 index entries 108–119 as review proposals only."""
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
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-101-index-entries-batch-10-proposal-2026-10-16-v1.json"
PROPOSAL_REL = "docs/translations/proposals/page-101-index-entries-batch-10-proposal-2026-10-16-v1.json"

TARGETS = {
    "index-108": ("Miniaturas de Base Grande", ["Large Base Figures → Miniaturas de Base Grande aplica Figures → Miniaturas; confirmar a composição do nome do componente."]),
    "index-109": ("Sair do Grupo", ["Leaving the Party pode distinguir Party de Group; confirmar a forma já usada para esta mecânica."]),
    "index-110": ("Linha de Visão", ["Line of Sight → Linha de Visão aparece em propostas locais, inclusive na p.62, mas ainda não foi aprovado no glossário."]),
    "index-111": ("Saque", []),
    "index-112": ("Nível de Saque (LVL)", ["Loot Level → Nível de Saque permanece candidato local; confirmar também se o acrônimo da fonte LVL deve ser preservado."]),
    "index-113": ("HP Máximo", ["Maximum HP → HP Máximo depende da decisão pendente para Health (HP) entre Saúde, HP e Pontos de Vida/PV."]),
    "index-114": ("Saque de Monstro", ["Loot → Saque segue o glossário oficial; Monster Loot → Saque de Monstro aparece em propostas locais, mas o composto não foi aprovado."]),
    "index-115": ("Movimento", []),
    "index-116": ("Movimento Livre", ["Free Movement nomeia uma mecânica específica; confirmar o equivalente antes de canonizar."]),
    "index-117": ("Mover na Diagonal", ["Moving Diagonally pode ser título verbal ou nome da ação; confirmar a forma editorial."]),
    "index-118": ("Mais Próximo", []),
    "index-119": ("Objetivos", []),
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
            "proposalText": proposal_text,
            "data": data,
            "technicalStatus": "pending_live_viewer_copyfit_v3_editor_pdf",
            "editorialStatus": "pending_human_review",
            "diagnosticRendering": "proposal",
            "pendingTerms": pending_terms,
        })

    proposal = {
        "proposalId": "p101-index-entries-batch-10",
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
            "Este lote contém as entradas index-108–index-119. As demais linhas e o título permanecem em inglês até lotes próprios.",
            "Referências e líderes sólidos permanecem iguais à fonte; o Viewer recompõe cada líder após o rótulo proposto.",
            "Large Base Figures, Leaving the Party, Line of Sight, Loot Level, Maximum HP, Monster Loot, Free Movement e Moving Diagonally ficam marcados para decisão humana complementar.",
            "Loot → Saque, Figures → Miniaturas e Objectives → Objetivos seguem o glossário oficial; as formas compostas ou mecânicas ainda não estão canonizadas.",
        ],
        "candidates": candidates,
        "note": "Décimo lote incremental do índice. Itens sem conflito terminológico ficam disponíveis para revisão enquanto as pendências permanecem marcadas.",
        "revisions": [],
    }

    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    if PROPOSAL_REL not in queue.setdefault("sourceProposals", []):
        queue["sourceProposals"].append(PROPOSAL_REL)
    queue["updated"] = "2026-10-16"
    if apply:
        PROPOSAL_PATH.write_text(json.dumps(proposal, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        QUEUE_PATH.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidates": len(candidates), "openExceptions": proposal["counts"]["openExceptions"], "proposal": PROPOSAL_REL, "mode": "apply" if apply else "dry-run"}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    main(args.apply)
