#!/usr/bin/env python3
"""Add editorial Body + Example units for reviewed, simple Example paragraphs.

The manifest intentionally excludes p.22 (list/hierarchy plus legacy body unit),
p.50 and p.78 (already accepted), and p.100 (rasterized Note variant). Each
selected existing visual block is split only at a reviewed Example marker; the
original block remains the parent and all source lines are partitioned once.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps/web/public/pages"

# page, block, Example start line id, expected marker/prefix, stable topic slug
CASES = [
    (24, "block_52", "line_52_5", "Example:", "discipline-learning"),
    (32, "block_43", "line_43_5", "Example:", "discipline-levels"),
    (40, "block_37", "line_37_6", "Example:", "free-movement"),
    (42, "block_13", "line_13_5", "Example:", "hindering-terrain"),
    (42, "block_18", "line_18_2", "Example:", "break-attack"),
    (44, "block_13", "line_13_5", "Example:", "damage-redistribution"),
    (46, "block_14", "line_14_4", "Example:", "encounter-action"),
    (58, "block_23", "line_23_5", "Example:", "activation-numbers"),
    (62, "block_16", "line_16_3", "Example:", "ai-target-priority"),
    (62, "block_20", "line_20_3", "Example:", "within-range"),
    (102, "block_8", "line_8_6", "Example:", "conviction-value"),
]


def line_text(line: dict[str, Any]) -> str:
    return "".join(str(span.get("displayOverride") or span.get("text", ""))
                   for span in line.get("spans", []) if not span.get("renderOnlyStrokePass"))


def nonempty(line: dict[str, Any]) -> bool:
    return bool(line_text(line).strip())


def field(block: dict[str, Any], lines: list[dict[str, Any]], unit_id: str) -> dict[str, Any]:
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


def make_units(page_number: int, block: dict[str, Any], start_line_id: str,
               expected_prefix: str, topic: str) -> list[dict[str, Any]]:
    lines = block.get("lines", [])
    start = next((i for i, line in enumerate(lines) if line.get("id") == start_line_id), None)
    if start is None:
        raise ValueError(f"p.{page_number} {block['id']} is missing {start_line_id}")
    if not line_text(lines[start]).lstrip().startswith(expected_prefix):
        raise ValueError(f"p.{page_number} {start_line_id} no longer begins with {expected_prefix!r}")
    if start == 0:
        raise ValueError(f"p.{page_number} {block['id']} has no body before its Example")
    if block.get("suspectedGhost") or block.get("rasterizedDuplicate"):
        raise ValueError(f"p.{page_number} {block['id']} is a ghost/artifact block")
    if block.get("listMarkerLineIndexes") or block.get("listFlowItem"):
        raise ValueError(f"p.{page_number} {block['id']} has list ownership; classify separately")
    if block.get("preserveLegacySpanOverrides"):
        raise ValueError(f"p.{page_number} {block['id']} preserves legacy overrides")
    if any(line.get("suspectedGhost") or line.get("rasterizedDuplicate") for line in lines):
        raise ValueError(f"p.{page_number} {block['id']} contains ghost/artifact source lines")

    before = [line for line in lines[:start] if nonempty(line)]
    example = [line for line in lines[start:] if nonempty(line)]
    if not before or not example:
        raise ValueError(f"p.{page_number} {block['id']} has an empty editorial unit")
    if any(line_text(line).strip() in {"•", "·", "▪", "■", "●", "○", "◦", "▫", "‣", "⁃"}
           for line in lines):
        raise ValueError(f"p.{page_number} {block['id']} contains a standalone list marker")

    prefix = f"p{page_number}-{topic}"
    return [
        {"id": f"{prefix}-body", "label": "Body", "kind": "paragraph",
         "field": field(block, before, f"{prefix}-body")},
        {"id": f"{prefix}-example", "label": "Example", "kind": "paragraph",
         "field": field(block, example, f"{prefix}-example")},
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write reviewed unit metadata")
    args = parser.parse_args()
    grouped: dict[int, list[tuple[str, str, str, str]]] = {}
    for case in CASES:
        grouped.setdefault(case[0], []).append(case[1:])

    summary = []
    for page_number, page_cases in grouped.items():
        path = PAGE_ROOT / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        page = json.loads(path.read_text(encoding="utf-8"))
        by_id = {block.get("id"): block for block in page.get("blocks", [])}
        for block_id, line_id, marker, topic in page_cases:
            block = by_id.get(block_id)
            if block is None:
                raise SystemExit(f"p.{page_number} is missing {block_id}")
            units = make_units(page_number, block, line_id, marker, topic)
            existing = block.get("typographicUnits")
            if existing is not None and existing != units:
                raise SystemExit(f"p.{page_number} {block_id} has an existing unit contract; inspect before changing it")
            summary.append({
                "page": page_number,
                "block": block_id,
                "bodyLines": units[0]["field"]["lineIds"],
                "exampleLines": units[1]["field"]["lineIds"],
                "units": [unit["id"] for unit in units],
            })
            if args.apply and existing is None:
                block["typographicUnits"] = units
        if args.apply:
            path.write_text(json.dumps(page, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"apply": args.apply, "blocks": len(summary), "units": len(summary) * 2,
                      "pages": sorted(grouped), "cases": summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
