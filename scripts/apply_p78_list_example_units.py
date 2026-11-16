#!/usr/bin/env python3
"""Model reviewed p.78 bullet items as body + Example editorial units.

The list marker remains on the visual parent. This script changes only the
three remaining reviewed body/Example splits on p.78; it does not create
translation records, alter source text, or derive line boundaries from gaps.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_PATH = ROOT / "apps/web/public/pages/page_078/page_078_dom.json"
CASES = [
    ("block_18", "gigas-grip-equip-1hand"),
    ("block_20", "gigas-grip-combat-dice"),
    ("block_21", "gigas-grip-equipment-legality"),
]
MARKERS = {"•", "·", "▪", "■", "●", "○", "◦", "▫", "‣", "⁃"}


def text_of(line: dict[str, Any]) -> str:
    return "".join(
        str(span.get("displayOverride") or span.get("text", ""))
        for span in line.get("spans", [])
        if not span.get("renderOnlyStrokePass")
    )


def visible_text(line: dict[str, Any]) -> str:
    return "".join(
        str(span.get("displayOverride") or span.get("text", ""))
        for span in line.get("spans", [])
        if not span.get("renderOnlyStrokePass")
        and (span.get("semanticSymbolId") or span.get("pictogramSvgPath") or str(span.get("text", "")).strip())
    ).strip()


def make_field(block: dict[str, Any], lines: list[dict[str, Any]], unit_id: str) -> dict[str, Any]:
    if not lines:
        raise ValueError(f"{unit_id}: an editorial unit has no source lines")
    boxes = [line.get("bbox") or block["bbox"] for line in lines]
    x = float(next((line["bbox"][0] for line in lines if visible_text(line)), lines[0]["bbox"][0]))
    right = float(block["bbox"][2])
    if right <= x:
        raise ValueError(f"{unit_id}: text frame has no usable width")
    return {
        "id": "body" if unit_id.endswith("-body") else "example",
        "lineIds": [str(line["id"]) for line in lines],
        "bbox": [
            min(float(box[0]) for box in boxes),
            min(float(box[1]) for box in boxes),
            max(float(box[2]) for box in boxes),
            max(float(box[3]) for box in boxes),
        ],
        "frame": {"x": x, "width": right - x, "textAlign": "left", "lineHeight": 1.1},
    }


def make_units(block: dict[str, Any], slug: str) -> list[dict[str, Any]]:
    lines = block.get("lines", [])
    if len(lines) < 3:
        raise ValueError(f"{block.get('id')}: too few source lines for body + Example")
    marker = text_of(lines[0]).replace("\t", " ").strip()
    if marker not in MARKERS:
        raise ValueError(f"{block.get('id')}: expected a standalone bullet at source line 0, got {marker!r}")
    starts = [i for i, line in enumerate(lines) if text_of(line).lstrip().startswith("Example:")]
    if len(starts) != 1 or starts[0] <= 1:
        raise ValueError(f"{block.get('id')}: expected one Example after the body, found {starts}")
    if block.get("suspectedGhost") or block.get("rasterizedDuplicate") or block.get("preserveLegacySpanOverrides"):
        raise ValueError(f"{block.get('id')}: block has a legacy/artifact exception")
    if any(line.get("suspectedGhost") or line.get("rasterizedDuplicate") for line in lines):
        raise ValueError(f"{block.get('id')}: source contains an artifact line")
    start = starts[0]
    body_lines = lines[1:start]
    example_lines = lines[start:]
    if not any(visible_text(line) for line in body_lines) or not any(visible_text(line) for line in example_lines):
        raise ValueError(f"{block.get('id')}: body or Example is empty")

    prefix = f"p78-{slug}"
    return [
        {"id": f"{prefix}-body", "label": "Body", "kind": "paragraph",
         "field": make_field(block, body_lines, f"{prefix}-body")},
        {"id": f"{prefix}-example", "label": "Example", "kind": "paragraph",
         "field": make_field(block, example_lines, f"{prefix}-example")},
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the reviewed unit metadata")
    args = parser.parse_args()
    data = json.loads(PAGE_PATH.read_text(encoding="utf-8"))
    by_id = {block.get("id"): block for block in data.get("blocks", [])}
    summary = []
    for block_id, slug in CASES:
        block = by_id.get(block_id)
        if block is None:
            raise SystemExit(f"p.78 is missing {block_id}")
        units = make_units(block, slug)
        if block.get("typographicUnits") is not None and block["typographicUnits"] != units:
            raise SystemExit(f"{block_id} already has a different unit contract; inspect before changing it")
        if block.get("listMarkerLineIndexes") not in (None, [0]):
            raise SystemExit(f"{block_id} has unexpected list marker indexes: {block.get('listMarkerLineIndexes')}")
        summary.append({
            "block": block_id,
            "listMarkerLineIndexes": [0],
            "units": [{"id": unit["id"], "lineIds": unit["field"]["lineIds"],
                       "frame": unit["field"]["frame"]} for unit in units],
        })
        if args.apply:
            block["listMarkerLineIndexes"] = [0]
            block["typographicUnits"] = units
    if args.apply:
        PAGE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"apply": args.apply, "blocks": summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
