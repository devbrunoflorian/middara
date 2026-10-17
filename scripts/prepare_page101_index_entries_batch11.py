"""Prepare p.101 index entries 120–131 as review proposals only."""
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
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-101-index-entries-batch-11-proposal-2026-10-16-v1.json"
PROPOSAL_REL = "docs/translations/proposals/page-101-index-entries-batch-11-proposal-2026-10-16-v1.json"

TARGETS = {
    "index-120": ("Oponentes", []),
    "index-121": ("Pacote", []),
    "index-122": ("Grupo", ["Party → Grupo acompanha texto humano salvo e Party Stash → Estoque do Grupo, mas Party e Group ainda podem exigir distinção contextual."]),
    "index-123": ("Bolsa do Grupo", ["Party Tuck Bag → Bolsa do Grupo é um composto candidato; confirmar nome e relação com Party/Group."]),
    "index-124": ("Estoque do Grupo", []),
    "index-125": ("Passiva", ["Passive nomeia uma categoria mecânica; confirmar se o rótulo deve ser Passiva ou outro termo do jogo."]),
    "index-126": ("De um Turno", ["Este fragmento está sob o rótulo-fonte sem referência Phases, que não tem unidade editável própria no mapeamento atual; corrigir a estrutura antes de aprovar a sequência."]),
    "index-127": ("De uma Rodada de História", ["A composição sob Phases continua dependente de localizar o cabeçalho-fonte sem referência; Story Round → Rodada de História segue o glossário oficial."]),
    "index-128": ("De uma Ação de Ataque", ["A composição sob Phases continua dependente do cabeçalho sem referência; Attack Action ainda não tem equivalente canônico no glossário."]),
    "index-129": ("De uma Ação de Feitiço", ["A composição sob Phases continua dependente do cabeçalho sem referência; Spell → Feitiço segue o glossário oficial."]),
    "index-130": ("Da Preparação", ["A composição sob Phases continua dependente do cabeçalho sem referência; Setup → Preparação segue o glossário oficial."]),
    "index-131": ("Prancha", ["Plank é um termo de componente/regra; confirmar se Prancha é o equivalente usado no contexto da p.97."]),
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
        "proposalId": "p101-index-entries-batch-11",
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
            "Este lote contém as entradas index-120–index-131. As demais linhas e o título permanecem em inglês até lotes próprios.",
            "Referências e líderes sólidos permanecem iguais à fonte; o Viewer recompõe cada líder após o rótulo proposto.",
            "Party, Party Tuck Bag, Passive, os fragmentos de Phases e Plank ficam marcados para revisão; o rótulo Phases não tem unidade com referência no mapeamento atual.",
            "Story Round → Rodada de História, Setup → Preparação e Party Stash → Estoque do Grupo reutilizam formas do glossário/documento; os demais termos continuam como propostas locais.",
        ],
        "candidates": candidates,
        "note": "Décimo primeiro lote incremental do índice. A ausência do cabeçalho Phases como unidade editável foi mantida explícita na fila, sem ocultar a fonte.",
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
