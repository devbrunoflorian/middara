"""Restore page 14 text blocks that the duplicate detector hid incorrectly."""

from __future__ import annotations

import json
from pathlib import Path
import re

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
DOM_PATH = ROOT / "apps/web/public/pages/page_014/page_014_dom.json"
TARGETS = {
    "block_23": ("line_23_0", "Read the Encounter Intro aloud."),
    "block_27": ("line_27_0", "Setting up"),
    "block_47": ("line_47_0", "Reading Encounters"),
}


def normalized(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def source_match(page: pymupdf.Page, text: str, bbox: list[float]) -> pymupdf.Rect:
    candidates = page.search_for(text)
    matching = [
        rect for rect in candidates
        if abs(rect.x0 - bbox[0]) <= 0.12
        and abs(rect.y0 - bbox[1]) <= 0.12
        and rect.x1 <= bbox[2] + 0.12
        and bbox[2] - rect.x1 <= 3.1
        and abs(rect.y1 - bbox[3]) <= 0.12
    ]
    if not matching:
        raise ValueError(f"PDF source does not confirm {text!r} at expected bbox {bbox}")
    return matching[0]


def main() -> None:
    if not PDF_PATH.is_file():
        raise FileNotFoundError(PDF_PATH)

    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    blocks = {block["id"]: block for block in data["blocks"]}
    page = pymupdf.open(PDF_PATH)[13]
    updated = 0

    for block_id, (line_id, expected_text) in TARGETS.items():
        block = blocks[block_id]
        lines = {line["id"]: line for line in block.get("lines", [])}
        line = lines[line_id]
        actual_text = normalized("".join(span.get("text", "") for span in line.get("spans", [])))
        if actual_text != expected_text:
            raise ValueError(f"{block_id}/{line_id} changed: {actual_text!r}")
        source_bbox = source_match(page, expected_text, line["bbox"])

        # The source text is painted over the page texture, not baked into the
        # background image. A ghost marker therefore suppresses real content.
        if block.get("suspectedGhost") is not False:
            block["suspectedGhost"] = False
            updated += 1
        if line.get("suspectedGhost") is not False:
            line["suspectedGhost"] = False
            updated += 1
        print(
            f"{block_id}/{line_id}: restored {expected_text!r}; "
            f"PDF ink bbox={[round(value, 3) for value in source_bbox]}"
        )

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Cleared {updated} false ghost flags; source text, bboxes, spans, and styles were preserved.")


if __name__ == "__main__":
    main()
