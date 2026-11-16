"""Prepare the first reviewable index-entry batch without writing Payload translations."""
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
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-101-index-entries-proposal-2026-10-16-v1.json"
TARGETS = {
    "page_101_unit_p101-index-000__pt-BR": "Habilidades",
    "page_101_unit_p101-index-001__pt-BR": "A qualquer momento",
    "page_101_unit_p101-index-002__pt-BR": "Fichas",
    "page_101_unit_p101-index-003__pt-BR": "Limitações de Fichas",
    "page_101_unit_p101-index-004__pt-BR": "Dados de Batalha de Abraxis",
    "page_101_unit_p101-index-005__pt-BR": "Conquistas",
    "page_101_unit_p101-index-006__pt-BR": "Ações",
    "page_101_unit_p101-index-007__pt-BR": "Números de Ativação",
    "page_101_unit_p101-index-008__pt-BR": "Grupo Ativo",
    "page_101_unit_p101-index-009__pt-BR": "Modo Aventura",
    "page_101_unit_p101-index-010__pt-BR": "Aventureiros",
    "page_101_unit_p101-index-011__pt-BR": "Mecânicas da Aventura",
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
    rows_by_key = {
        f"{row['keyStem']}__pt-BR": row
        for row in rows_data["rows"]
    }
    missing = [key for key in TARGETS if key not in rows_by_key]
    if missing:
        raise RuntimeError(f"Index row keys missing: {missing}")

    candidates = []
    for span_key, proposal_text in TARGETS.items():
        row = rows_by_key[span_key]
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
        pending_terms = []
        if row["sourceText"] == "Abraxis Battle Dice":
            pending_terms.append("Abraxis Battle Dice → Dados de Batalha de Abraxis: candidato no glossário complementar, aguarda decisão humana.")
        if row["sourceText"] == "Activation Numbers":
            pending_terms.append("Activation Numbers → Números de Ativação: formulação já proposta na p.56, equivalência global ainda não aprovada no glossário.")
        if row["sourceText"] == "Adventure Mode":
            pending_terms.append("Adventure Mode → Modo Aventura: recomendação registrada em glossary-candidates.md, aguarda aprovação global.")
        candidates.append({
            "blockIndex": row["blockIndex"],
            "sourceBlockId": row["blockId"],
            "sourceUnitId": row["id"],
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

    proposal_rel = "docs/translations/proposals/page-101-index-entries-proposal-2026-10-16-v1.json"
    proposal = {
        "proposalId": "p101-index-entries",
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
            "openExceptions": 0,
        },
        "preservation": {
            "existingHumanTranslationCount": 0,
            "existingHumanTranslationSpanKeys": [],
            "existingHumanTranslationDataSha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
            "priorReviewRecordCount": 0,
            "priorReviewRecordsSha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
        },
        "scopeLimits": [
            "Este lote traduz as doze primeiras entradas da coluna esquerda; as outras 177 entradas e o título têm propostas separadas ou continuam em inglês.",
            "Cada entrada conserva a linha DOM, referência de página e regra sólida da fonte. O Viewer cria a regra de forma dinâmica depois do texto traduzido.",
            "Aprovação editorial e validação técnica seguem separadas. Esta proposta não grava nem publica traduções finais.",
            "GET somente leitura em 2026-10-16 confirmou zero traduções e zero revisões da p.101 antes do lote.",
        ],
        "candidates": candidates,
        "note": "Primeiro lote de localização do índice remissivo; os termos em pendingTerms aguardam decisão humana complementar.",
        "revisions": [],
    }

    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    if proposal_rel not in queue.setdefault("sourceProposals", []):
        queue["sourceProposals"].append(proposal_rel)
    queue["updated"] = "2026-10-16"
    if apply:
        PROPOSAL_PATH.write_text(json.dumps(proposal, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        QUEUE_PATH.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidates": len(candidates), "proposal": proposal_rel, "mode": "apply" if apply else "dry-run"}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    main(args.apply)
