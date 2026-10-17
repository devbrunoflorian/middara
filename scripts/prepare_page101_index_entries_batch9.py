"""Prepare p.101 index entries 096–107 as review proposals only."""
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
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-101-index-entries-batch-9-proposal-2026-10-16-v1.json"
PROPOSAL_REL = "docs/translations/proposals/page-101-index-entries-batch-9-proposal-2026-10-16-v1.json"

TARGETS = {
    "index-096": ("Cartas Ocultas", []),
    "index-097": ("Texto Oculto", []),
    "index-098": ("Ícones", []),
    "index-099": ("Ícones Escaláveis", ["Scaling Icons → Ícones Escaláveis é candidato contextual na p.3; confirmar o nome da mecânica."]),
    "index-100": ("Imunidades", ["Immunities → Imunidades é uma equivalência candidata para a mecânica; confirmar a forma canônica."]),
    "index-101": ("Trilha de Iniciativa", ["Initiative Track → Trilha de Iniciativa aparece como proposta local na p.3; ainda não foi aprovado no glossário."]),
    "index-102": ("Múltiplas Cartas de Iniciativa", ["Multiple Initiative Cards descreve cartas posicionadas em momentos distintos; confirmar a forma nominal do título."]),
    "index-103": ("Ferimentos", []),
    "index-104": ("Limites de Itens", []),
    "index-105": ("Níveis de Item", ["Item Tiers → Níveis de Item é uma proposta composta; Tier ainda não tem equivalente aprovado."]),
    "index-106": ("Saque de Itens", ["Loot → Saque segue o glossário oficial; a composição Item Loot → Saque de Itens ainda requer revisão de uso."]),
    "index-107": ("Saltos", ["Jumping pode nomear a ação ou a categoria de teste; confirmar se o título fica Saltos, Salto ou Saltar."]),
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
        "proposalId": "p101-index-entries-batch-9",
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
            "Este lote contém as entradas index-096–index-107. As demais linhas e o título permanecem em inglês até lotes próprios.",
            "Referências e líderes sólidos permanecem iguais à fonte; o Viewer recompõe cada líder após o rótulo proposto.",
            "Scaling Icons, Immunities, Initiative Track, Multiple Initiative Cards, Item Tiers, Item Loot e Jumping ficam marcados para decisão humana complementar.",
            "Cartas Ocultas, Texto Oculto e Ferimentos reutilizam formas já presentes em conteúdo humano salvo; Item → Item e Loot → Saque vêm do glossário oficial.",
        ],
        "candidates": candidates,
        "note": "Nono lote incremental do índice. Itens sem conflito terminológico ficam disponíveis para revisão enquanto as pendências permanecem marcadas.",
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
