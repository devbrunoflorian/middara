#!/usr/bin/env python3
"""Add editorial label + explanation units for reviewed callout relationships.

The confirmed p.13 New Story Flag callout remains one visual block (and keeps
its pencil/flag semantics); its short label and explanatory sentence become
independently translatable fields inside that existing block.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps/web/public/pages"
CASES = [
    (13, "block_19", "p13-new-story-flag", "line_19_0", ["line_19_1", "line_19_2"]),
]


def line_text(line: dict[str, Any]) -> str:
    return "".join(
        str(span.get("displayOverride") or span.get("text", ""))
        for span in line.get("spans", [])
        if not span.get("renderOnlyStrokePass")
    )


def make_field(block: dict[str, Any], lines: list[dict[str, Any]], unit_id: str) -> dict[str, Any]:
    boxes = [line.get("bbox") or block["bbox"] for line in lines]
    first = lines[0]
    return {
        "id": f"{unit_id}-field",
        "lineIds": [str(line["id"]) for line in lines],
        "bbox": [
            min(float(box[0]) for box in boxes),
            min(float(box[1]) for box in boxes),
            max(float(box[2]) for box in boxes),
            max(float(box[3]) for box in boxes),
        ],
        "frame": {
            "x": float(first.get("availableX", first["bbox"][0])),
            "width": float(first.get("availableWidth", block["bbox"][2] - block["bbox"][0])),
            "textAlign": "left",
            "lineHeight": 1.1,
        },
    }


def build_units(page_number: int, block: dict[str, Any], unit_prefix: str,
                label_line_id: str, body_line_ids: list[str]) -> list[dict[str, Any]]:
    lines = block.get("lines", [])
    by_id = {str(line.get("id")): line for line in lines}
    if block.get("suspectedGhost") or block.get("rasterizedDuplicate"):
        raise ValueError(f"p.{page_number} {block['id']} is an artifact/duplicate block")
    if block.get("listMarkerLineIndexes") or block.get("listFlowItem"):
        raise ValueError(f"p.{page_number} {block['id']} has list ownership; classify separately")
    if block.get("preserveLegacySpanOverrides"):
        raise ValueError(f"p.{page_number} {block['id']} preserves legacy overrides")
    if label_line_id not in by_id or any(line_id not in by_id for line_id in body_line_ids):
        raise ValueError(f"p.{page_number} {block['id']} is missing a reviewed source line")

    label_line = by_id[label_line_id]
    body_lines = [by_id[line_id] for line_id in body_line_ids]
    if line_text(label_line).strip() != "New Story Flag:":
        raise ValueError(f"p.{page_number} {label_line_id} no longer contains the expected label")
    body_text = " ".join("".join(line_text(line) for line in body_lines).split())
    if body_text != "Mark the Story Flag Experienced Guide on the Adventure Sheet.":
        raise ValueError(f"p.{page_number} {block['id']} body text no longer matches the reviewed phrase")
    assigned = [label_line_id, *body_line_ids]
    if len(assigned) != len(set(assigned)):
        raise ValueError(f"p.{page_number} {block['id']} line ownership overlaps")
    unassigned_text_lines = [line.get("id") for line in lines
                             if line.get("id") not in assigned and line_text(line).strip()]
    if unassigned_text_lines:
        raise ValueError(f"p.{page_number} {block['id']} has unassigned source text: {unassigned_text_lines}")
    if any(line.get("suspectedGhost") or line.get("rasterizedDuplicate") for line in lines):
        raise ValueError(f"p.{page_number} {block['id']} contains ghost/artifact lines")

    label_id = f"{unit_prefix}-label"
    body_id = f"{unit_prefix}-body"
    return [
        {"id": label_id, "label": "Label", "kind": "paragraph",
         "field": make_field(block, [label_line], label_id)},
        {"id": body_id, "label": "Explanation", "kind": "paragraph",
         "field": make_field(block, body_lines, body_id)},
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the reviewed unit metadata")
    args = parser.parse_args()
    summary = []
    for page_number, block_id, unit_prefix, label_line_id, body_line_ids in CASES:
        path = PAGE_ROOT / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        page = json.loads(path.read_text(encoding="utf-8"))
        block = next((item for item in page.get("blocks", []) if item.get("id") == block_id), None)
        if block is None:
            raise SystemExit(f"p.{page_number} is missing {block_id}")
        units = build_units(page_number, block, unit_prefix, label_line_id, body_line_ids)
        existing = block.get("typographicUnits")
        if existing is not None and existing != units:
            raise ValueError(f"p.{page_number} {block_id} has a conflicting unit contract; inspect before changing")
        summary.append({"page": page_number, "block": block_id,
                        "labelLines": units[0]["field"]["lineIds"],
                        "bodyLines": units[1]["field"]["lineIds"],
                        "units": [unit["id"] for unit in units],
                        "action": "already-present" if existing is not None else "add"})
        if args.apply and existing is None:
            block["typographicUnits"] = units
            path.write_text(json.dumps(page, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"apply": args.apply, "blocks": len(summary), "units": len(summary) * 2,
                      "cases": summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
