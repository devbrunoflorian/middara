"""Split page 7 component-list editing units while keeping printed furniture fixed."""

from __future__ import annotations

import json
from pathlib import Path
import re

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_DIR = ROOT / "apps/web/public/pages/page_007"
DOM_PATH = PAGE_DIR / "page_007_dom.json"
FRAMES_PATH = PAGE_DIR / "layout_frames.json"

ITEM_BLOCK_IDS = [f"block_{number}" for number in range(10, 30)]
COMPOUND_BLOCK_IDS = {"block_23", "block_24", "block_25", "block_26"}
SOURCE_STARTS = {
    "block_10": 104.17,
    "block_22": 323.8,
    "block_25": 543.42,
}
FIELD_LABELS = {
    "block_23": "component-list-101-large-cards",
    "block_24": "component-list-370-mini-cards",
    "block_25": "component-list-12-tarot-cards",
    "block_26": "component-list-390-item-cards",
}
BOX_WIDTH_PT = 200.0


def normalized(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    if not PDF_PATH.is_file():
        raise FileNotFoundError(PDF_PATH)

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    frames = json.loads(FRAMES_PATH.read_text(encoding="utf-8"))
    page = pymupdf.open(PDF_PATH)[6]
    source_text = normalized(page.get_text("text"))
    required_source_phrases = (
        "101 Large Cards (5x6 Unique Sized)",
        "370 Mini Cards (Mini American)",
        "12 Tarot Cards",
        "390 Item Cards (Standard Euro)",
    )
    for phrase in required_source_phrases:
        if phrase not in source_text:
            raise ValueError(f"Source PDF no longer contains expected component heading: {phrase}")

    blocks = {block["id"]: block for block in dom["blocks"]}
    if set(ITEM_BLOCK_IDS) - blocks.keys():
        raise ValueError(f"Missing expected page 7 item blocks: {sorted(set(ITEM_BLOCK_IDS) - blocks.keys())}")

    starts = {block_id: blocks[block_id]["lines"][2]["bbox"][0] for block_id in SOURCE_STARTS}
    for block_id, expected in SOURCE_STARTS.items():
        if abs(starts[block_id] - expected) > 0.1:
            raise ValueError(f"Unexpected text start for {block_id}: {starts[block_id]} != {expected}")

    left_x, center_x, right_x = starts["block_10"], starts["block_22"], starts["block_25"]
    column_x = {
        **{f"block_{number}": left_x for number in range(10, 22)},
        **{f"block_{number}": center_x for number in range(22, 25)},
        **{f"block_{number}": right_x for number in range(25, 30)},
    }

    for block_id in ITEM_BLOCK_IDS:
        block = blocks[block_id]
        lines = block.get("lines", [])
        if len(lines) < 3 or lines[0]["id"].endswith("_0") is False or lines[1]["id"].endswith("_1") is False:
            raise ValueError(f"Expected fixed tab/checkbox lines before editable text in {block_id}")

        block["staticEditorLineIndexes"] = [0, 1]
        block["layoutFrame"] = {
            **(block.get("layoutFrame") or {}),
            "x": column_x[block_id],
            "width": BOX_WIDTH_PT,
            "textAlign": "left",
        }
        frames[block_id] = {
            **(frames.get(block_id) or {}),
            "x": column_x[block_id],
            "width": BOX_WIDTH_PT,
            "textAlign": "left",
        }

        if block_id in COMPOUND_BLOCK_IDS:
            units = []
            for line in lines[2:]:
                if not any(span.get("text", "").strip() for span in line.get("spans", [])):
                    continue
                line_bbox = line["bbox"]
                units.append({
                    "id": f"p7-{block_id}-{line['id']}",
                    "field": {
                        "id": line["id"],
                        "lineIds": [line["id"]],
                        "bbox": line_bbox,
                        "frame": {
                            "x": column_x[block_id],
                            "width": BOX_WIDTH_PT,
                            "textAlign": "left",
                        },
                    },
                })
            if not units:
                raise ValueError(f"No editable title/details found for {block_id}")
            block["typographicUnits"] = units
        else:
            block.pop("typographicUnits", None)

    DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    FRAMES_PATH.write_text(json.dumps(frames, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    count_units = sum(len(blocks[block_id].get("typographicUnits", [])) for block_id in COMPOUND_BLOCK_IDS)
    print(
        f"Prepared {len(ITEM_BLOCK_IDS)} component items, {count_units} independent title/detail text units, "
        f"and {BOX_WIDTH_PT:g} pt frames at x={left_x:.2f}/{center_x:.2f}/{right_x:.2f}; "
        "checkboxes and translations are unchanged."
    )


if __name__ == "__main__":
    main()
