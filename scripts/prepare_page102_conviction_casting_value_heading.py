"""Prepare the remaining live heading proposal on p.102 without final writes."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "apps/web/public/pages/page_102"
DOM_PATH = FOLDER / "page_102_dom.json"
PDF_PATH = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
BACKGROUND_PATH = FOLDER / "background.webp"
QUEUE_PATH = ROOT / "docs/translations/localization-exceptions.json"
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-102-conviction-casting-value-heading-proposal-2026-10-17-v1.json"
PROPOSAL_REL = "docs/translations/proposals/page-102-conviction-casting-value-heading-proposal-2026-10-17-v1.json"
SOURCE_BLOCK_ID = "block_27"
PROPOSAL_TEXT = "Valor de Convicção e Conjuração"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def main(apply: bool) -> None:
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    block_index = next((index for index, block in enumerate(dom["blocks"]) if block["id"] == SOURCE_BLOCK_ID), None)
    if block_index is None:
        raise RuntimeError(f"Source block not found: {SOURCE_BLOCK_ID}")
    block = dom["blocks"][block_index]
    source_text = " ".join("".join(span.get("text", "") for span in line.get("spans", [])) for line in block["lines"]).strip()
    if source_text != "Conviction and Casting Value":
        raise RuntimeError(f"Unexpected source text for {SOURCE_BLOCK_ID}: {source_text!r}")
    line = next(line for line in block["lines"] if any(span.get("text", "").strip() for span in line.get("spans", [])))
    style_span = next(span for span in line["spans"] if span.get("text", "").strip())
    span_key = f"page_102_block_{block_index}__pt-BR"
    bbox = block["bbox"]
    font = style_span.get("font", "Cinzel-Regular")
    size = float(style_span.get("size", 18))
    weight = 700 if any(part in font.casefold() for part in ("bold", "demi", "heavy", "black")) else 400
    italic = any(part in font.casefold() for part in ("italic", "oblique"))
    candidate = {
        "blockIndex": block_index,
        "sourceBlockId": SOURCE_BLOCK_ID,
        "sourceUnitId": None,
        "spanKey": span_key,
        "language": "pt-BR",
        "sourceText": source_text,
        "sourcePdfVisualLineCount": len(block["lines"]),
        "sourcePdfLineIds": [line["id"] for line in block["lines"]],
        "proposalText": PROPOSAL_TEXT,
        "data": {
            "schemaVersion": 2,
            "spanKey": span_key,
            "bbox": bbox,
            "textAlign": "left",
            "lineHeight": 1,
            "lineHeightMode": "source",
            "segments": [{
                "text": PROPOSAL_TEXT,
                "font": font,
                "size": size,
                "weight": weight,
                "style": "italic" if italic else "normal",
                "color": style_span.get("color", "#231f20"),
                "disableLigatures": True,
            }],
            "managedSourceSymbols": [],
        },
        "technicalStatus": "pending_live_viewer_copyfit_v3_editor_pdf",
        "editorialStatus": "pending_human_review",
        "diagnosticRendering": "proposal",
        "pendingTerms": [
            "Conviction → Convicção follows the official glossary. Casting → Conjuração follows the current p.102 candidate wording and remains a local term awaiting editorial confirmation.",
        ],
    }
    proposal = {
        "proposalId": "p102-conviction-casting-value-heading",
        "version": "1",
        "title": "Valor de Convicção e Conjuração — cabeçalho da p.102",
        "page": 102,
        "status": "pending_human_review",
        "sourcePdf": PDF_PATH.name,
        "sourceHashes": {
            "sourcePdf": sha256(PDF_PATH),
            "background": sha256(BACKGROUND_PATH),
            "pageDom": sha256(DOM_PATH),
        },
        "counts": {
            "candidates": 1,
            "existingHumanTranslationsPreserved": 0,
            "priorReviewRecordsPreserved": 0,
            "finalTranslationWrites": 0,
            "openExceptions": 1,
        },
        "scopeLimits": [
            "Somente o cabeçalho block_27 foi proposto. O texto de regras, tabela, cores e símbolos permanece fora deste recorte.",
            "Fonte Cinzel-Regular, tamanho, posição e caixa originais foram preservados; a contagem PT-BR e o copyfit V3 ainda precisam de medição no Viewer/Editor/PDF.",
            "Conjuração é coerente com as propostas adjacentes da página, mas permanece forma local sujeita a revisão terminológica.",
            "Nenhuma tradução humana, revisão anterior ou texto final foi alterado.",
        ],
        "candidates": [candidate],
        "note": "Próxima unidade incremental após completar os 189 rótulos do índice da p.101; proposta pendente de medição técnica e revisão humana.",
        "revisions": [],
    }
    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    if PROPOSAL_REL not in queue.setdefault("sourceProposals", []):
        queue["sourceProposals"].append(PROPOSAL_REL)
    queue["updated"] = "2026-10-17"
    if apply:
        PROPOSAL_PATH.write_text(json.dumps(proposal, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        QUEUE_PATH.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidate": candidate["spanKey"], "proposal": PROPOSAL_REL,
        "mode": "apply" if apply else "dry-run", "finalWrites": proposal["counts"]["finalTranslationWrites"]}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    main(args.apply)
