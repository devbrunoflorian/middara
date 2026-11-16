from __future__ import annotations

import json
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_PATH = ROOT / "apps/web/public/pages/page_102/page_102_dom.json"
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-102-rating-color-rows-proposal-2026-10-17-v1.json"
QUEUE_PATH = ROOT / "docs/translations/localization-exceptions.json"
PROPOSAL_REL = PROPOSAL_PATH.relative_to(ROOT).as_posix()
COLOR_TERMS = {
    "PURPLE": "ROXO",
    "WHITE": "BRANCO",
    "ORANGE": "LARANJA",
    "TEAL": "TURQUESA",
    "RED": "VERMELHO",
    "GREEN": "VERDE",
    "GREY": "CINZA",
    "BLUE": "AZUL",
}
ROW_BLOCKS = tuple(range(12, 20))


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


page = read_json(PAGE_PATH)
blocks_by_id = {block["id"]: block for block in page["blocks"]}
candidates = []

for block_id, (source_color, target_color) in zip(ROW_BLOCKS, COLOR_TERMS.items(), strict=True):
    block = blocks_by_id[f"block_{block_id}"]
    if len(block.get("lines", [])) != 1 or len(block["lines"][0].get("spans", [])) < 1:
        raise ValueError(f"Unexpected source row structure in block_{block_id}")
    line = block["lines"][0]
    source_text = "".join(span["text"] for span in line["spans"]).rstrip()
    if source_color not in source_text:
        raise ValueError(f"Expected {source_color} in block_{block_id}: {source_text!r}")
    proposal_text = source_text.replace(source_color, target_color, 1)
    primary_span = next(span for span in line["spans"] if span["text"].strip())
    span_key = f"page_102_block_{block_id - 8}__pt-BR"
    candidates.append({
        "blockIndex": block_id - 8,
        "sourceBlockId": f"block_{block_id}",
        "sourceUnitId": None,
        "spanKey": span_key,
        "language": "pt-BR",
        "sourceText": source_text,
        "sourcePdfVisualLineCount": 1,
        "sourcePdfLineIds": [line["id"]],
        "proposalText": proposal_text,
        "data": {
            "schemaVersion": 2,
            "spanKey": span_key,
            "bbox": block["bbox"],
            "textAlign": "left",
            "lineHeight": 1,
            "lineHeightMode": "source",
            "segments": [{
                "text": proposal_text,
                "font": primary_span["font"],
                "size": primary_span["size"],
                "weight": 700,
                "style": "normal",
                "color": primary_span["color"],
                "disableLigatures": True,
            }],
            "managedSourceSymbols": [],
        },
        "technicalStatus": "pending_live_viewer_copyfit_v3_editor_pdf",
        "editorialStatus": "pending_human_review",
        "diagnosticRendering": "proposal",
        "pendingTerms": [
            f"{source_color.title()} → {target_color.title()} reuses the local p.85 draft form; it is not an approved glossary decision."
        ],
        "sourceArtworkNote": "The adjacent colored die is retained from the source artwork; this proposal edits only the row text.",
    })

proposal = {
    "proposalId": "p102-rating-color-rows",
    "version": "1",
    "title": "Classificações de Convicção e Conjuração — rótulos de cores da p.102",
    "page": 102,
    "status": "pending_human_review",
    "sourcePdf": "Rulebook 1p2 Final Version 05-19-23 Optimized.pdf",
    "counts": {
        "candidates": len(candidates),
        "existingHumanTranslationsPreserved": 0,
        "priorReviewRecordsPreserved": 0,
        "finalTranslationWrites": 0,
        "openExceptions": 0,
    },
    "scopeLimits": [
        "Only the eight textual color labels in the p.102 rating list are proposed; the adjacent colored dice artwork, table rows, numerical values, and other page units are unchanged.",
        "The original font, type size, color, coordinates, and row geometry are preserved. Live PageRenderer line count, icon clearance, Editor behavior, and PDF export remain pending.",
        "Color wording follows local usage in the p.85 proposal and remains pending human glossary review.",
        "No human translation, editorial decision, or final PT-BR value was modified.",
    ],
    "candidates": candidates,
    "note": "Incremental p.102 batch after the two title units. All rows are one visual line in the source PDF; Copyfit V3 classification is pending live measurement.",
    "revisions": [],
}

PROPOSAL_PATH.write_text(json.dumps(proposal, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="")

queue_bytes = QUEUE_PATH.read_bytes()
newline = "\r\n" if b"\r\n" in queue_bytes else "\n"
queue = json.loads(queue_bytes.decode("utf-8"))
if PROPOSAL_REL not in queue["sourceProposals"]:
    queue["sourceProposals"].append(PROPOSAL_REL)
queue["updated"] = date.today().isoformat()
queue_text = json.dumps(queue, ensure_ascii=False, indent=2) + "\n"
QUEUE_PATH.write_text(queue_text.replace("\n", newline), encoding="utf-8", newline="")

print(f"Prepared {len(candidates)} p.102 rating color rows in {PROPOSAL_REL}; no Payload writes.")
