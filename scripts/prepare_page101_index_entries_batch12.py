"""Prepare p.101 index entries 132–143 as review proposals only."""
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
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-101-index-entries-batch-12-proposal-2026-10-16-v1.json"
PROPOSAL_REL = "docs/translations/proposals/page-101-index-entries-batch-12-proposal-2026-10-16-v1.json"

TARGETS = {
    "index-132": ("Área de Jogo", [
        "Play Area → Área de Jogo é uma proposta local; o composto Área de Jogo do Aventureiro aparece na proposta da p.35, ainda sem aprovação terminológica global.",
    ]),
    "index-133": ("Proteção", [
        "Protection é um nome mecânico/tag na p.93; Proteção é proposta local e ainda não consta do glossário aprovado.",
    ]),
    "index-134": ("Empurrar, Puxar e Comandar", [
        "Push/Pull/Command → Empurrar/Puxar/Comandar acompanha a proposta local da p.40, ainda pendente de aprovação humana.",
    ]),
    "index-135": ("Alcances", [
        "Range(s) → Alcance(s) aparece como proposta na p.43, mas a terminologia do conceito mecânico segue pendente.",
    ]),
    "index-136": ("Reequipar", [
        "A decisão humana aprovada Re-Equip Action → Ação de Reequipar apoia o composto, mas não resolve automaticamente o rótulo isolado Re-Equip; revisar como entrada de índice.",
    ]),
    "index-137": ("Do Tabuleiro", [
        "Fragmento filho de Removing; o rótulo-pai não tem entrada de índice mapeada. Manter a relação estrutural explícita e revisar a forma isolada.",
    ]),
    "index-138": ("Do Jogo", [
        "Fragmento filho de Removing; o rótulo-pai não tem entrada de índice mapeada. Manter a relação estrutural explícita e revisar a forma isolada.",
    ]),
    "index-139": ("Resistências", [
        "Resistance(s) é um nome mecânico/tag na p.93; Resistência(s) é proposta local e ainda não consta do glossário aprovado.",
    ]),
    "index-140": ("Resolução de um Ataque ou Feitiço", [
        "Spell → Feitiço segue o glossário oficial; Attack/Ataque como nome mecânico continua sem equivalência aprovada no glossário.",
    ]),
    "index-141": ("Reespecialização", [
        "Re-Specing nomeia a mudança das Disciplinas do Aventureiro na p.87; Reespecialização é uma proposta contextual, ainda sem decisão terminológica humana.",
    ]),
    "index-142": ("Restaurar Aventureiros", []),
    "index-143": ("Recompensas", [
        "Rewards é substantivo e reutiliza Recompensa(s) em texto humano aprovado na p.18; confirmar o rótulo como termo de índice. A decisão rejeitada reward → receber recompensa refere-se à forma verbal e não é aplicada aqui.",
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
            "proposalText": proposal_text,
            "data": data,
            "technicalStatus": "pending_live_viewer_copyfit_v3_editor_pdf",
            "editorialStatus": "pending_human_review",
            "diagnosticRendering": "proposal",
            "pendingTerms": pending_terms,
        })

    proposal = {
        "proposalId": "p101-index-entries-batch-12",
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
            "Este lote contém as entradas index-132–index-143. As demais linhas e o título permanecem em inglês até lotes próprios.",
            "Referências e líderes sólidos permanecem iguais à fonte; o Viewer recompõe cada líder após o rótulo proposto.",
            "Play Area, Protection, Push/Pull/Command, Range(s), os fragmentos de Removing, Resistance(s), Attack e Re-Specing ficam marcados para revisão. A decisão de Re-Equip Action não canoniza automaticamente o rótulo isolado Re-Equip.",
            "Setup e Restore → Restaurar, Adventurers → Aventureiros e Spell → Feitiço reutilizam o glossário oficial. Recompensas segue uso humano aprovado como substantivo na p.18; a decisão rejeitada para o verbo reward não é generalizada.",
        ],
        "candidates": candidates,
        "note": "Décimo segundo lote incremental do índice. Os fragmentos de From Board/From Game permanecem associados estruturalmente ao pai Removing, que não tem entrada independente mapeada.",
        "revisions": [],
    }

    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    if PROPOSAL_REL not in queue.setdefault("sourceProposals", []):
        queue["sourceProposals"].append(PROPOSAL_REL)
    queue["updated"] = "2026-10-16"
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
