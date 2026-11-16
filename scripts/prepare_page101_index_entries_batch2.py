"""Prepare the next twelve p.101 index entries as review proposals only."""
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
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-101-index-entries-batch-2-proposal-2026-10-16-v1.json"
PROPOSAL_REL = "docs/translations/proposals/page-101-index-entries-batch-2-proposal-2026-10-16-v1.json"

TARGETS = {
    "index-012": ("Etapas de IA", []),
    "index-013": ("Aliados", []),
    "index-014": ("Outro", []),
    "index-015": ("Alternativo", ["Alternate → Alternativo é candidato local para a categoria de Combatente; confirmar forma e flexão no glossário." ]),
    "index-016": ("Armadura", []),
    "index-017": ("Perfuração", ["Armor Piercing → Perfuração de Armadura é candidata local no rascunho da p.92; confirmar o termo antes de canonizar a entrada isolada Piercing."]),
    "index-018": ("Redução de Dano", []),
    "index-019": ("Ação de Ataque", []),
    "index-020": ("Avareza", ["Avarice é nome de Tag de Combatente; Avareza é proposta lexical provisória, pendente de decisão humana sobre nomes de Tags."]),
    "index-021": ("Afastar-se", []),
    "index-022": ("BACKSTAB", ["BACKSTAB é nome de Tag preservado em inglês na proposta da p.50; manter a forma até decisão humana sobre nomes de Tags."]),
    "index-023": ("Recompensas", []),
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
        "proposalId": "p101-index-entries-batch-2",
        "version": "1",
        "title": "Entradas seguintes do índice — p. 101",
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
            "openExceptions": 4,
        },
        "scopeLimits": [
            "Este lote contém as entradas 13–24 da ordem do índice. As entradas restantes e o título são independentes e continuam em inglês até seus lotes.",
            "Referências e líderes sólidos permanecem iguais à fonte; o Viewer recompõe cada líder depois do texto traduzido.",
            "Termos de Tag ainda pendentes ficam explicitamente marcados; a proposta não grava traduções finais, rascunhos humanos nem decisões editoriais.",
            "AI Steps → Etapas de IA e Bounty → Recompensa reaproveitam decisões complementares humanas aprovadas no Payload.",
        ],
        "candidates": candidates,
        "note": "Segundo lote incremental do índice. Pendências terminológicas são registradas sem bloquear as demais unidades.",
        "revisions": [],
    }

    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    if PROPOSAL_REL not in queue.setdefault("sourceProposals", []):
        queue["sourceProposals"].append(PROPOSAL_REL)
    queue["updated"] = "2026-10-16"
    if apply:
        PROPOSAL_PATH.write_text(json.dumps(proposal, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        QUEUE_PATH.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidates": len(candidates), "proposal": PROPOSAL_REL, "mode": "apply" if apply else "dry-run"}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    main(args.apply)
