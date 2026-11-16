#!/usr/bin/env python3
"""Split high-confidence heading/body size boundaries without changing legacy keys.

The source JSON keeps its original block and array index.  This adds the
existing ``typographicUnits`` metadata used by the renderer, so a heading and
its body get separate edit targets while old block-level translation keys keep
working as a fallback.  Inline rich-text runs inside the body remain intact.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
OUT = ROOT / "tmp" / "font-size-boundaries"


def nonempty_spans(line: dict[str, Any]) -> list[dict[str, Any]]:
    return [span for span in line.get("spans", []) if str(span.get("text", "")).strip()]


def dominant_size(line: dict[str, Any]) -> tuple[float | None, float, collections.Counter[float]]:
    spans = nonempty_spans(line)
    if not spans:
        return None, 0.0, collections.Counter()
    counts: collections.Counter[float] = collections.Counter()
    for span in spans:
        size = round(float(span.get("size", 0.0)), 2)
        counts[size] += len(str(span.get("text", "")))
    size, chars = counts.most_common(1)[0]
    return size, float(chars), counts


def bbox_union(lines: list[dict[str, Any]], block: dict[str, Any]) -> list[float]:
    boxes = [line.get("bbox", block.get("bbox", [])) for line in lines]
    return [
        min(float(box[0]) for box in boxes),
        min(float(box[1]) for box in boxes),
        max(float(box[2]) for box in boxes),
        max(float(box[3]) for box in boxes),
    ]


def field(block: dict[str, Any], lines: list[dict[str, Any]], unit_id: str) -> dict[str, Any]:
    first = lines[0]
    return {
        "id": f"{unit_id}-field",
        "lineIds": [str(line.get("id", "")) for line in lines],
        "bbox": bbox_union(lines, block),
        "frame": {
            "x": float(first.get("availableX", first["bbox"][0])),
            "width": float(first.get("availableWidth", block["bbox"][2] - block["bbox"][0])),
            "textAlign": "left",
            "lineHeight": 1,
        },
    }


def candidate(page: int, block: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str, float, float] | None:
    if block.get("suspectedGhost") or block.get("rasterizedDuplicate"):
        return None
    if block.get("typographicUnits") or block.get("creditUnits") or block.get("creditUnit"):
        return None
    if block.get("typographicSpanUnits"):
        return None

    lines = [line for line in block.get("lines", []) if nonempty_spans(line)]
    if len(lines) < 3:
        return None
    if any(line.get("suspectedGhost") or line.get("rasterizedDuplicate") for line in lines):
        return None

    first = lines[0]
    first_size, first_chars, first_sizes = dominant_size(first)
    body = lines[1:]
    body_sizes = [dominant_size(line)[0] for line in body]
    body_sizes = [size for size in body_sizes if size is not None]
    if first_size is None or not body_sizes:
        return None
    body_counts = collections.Counter(body_sizes)
    body_size, body_line_count = body_counts.most_common(1)[0]
    body_fraction = body_line_count / len(body_sizes)
    if first_size < 11.0 or first_size - body_size < 1.0 or body_fraction < 0.75:
        return None
    if len(first_sizes) != 1:
        return None

    heading_text = "".join(str(span.get("text", "")) for span in first.get("spans", [])).strip()
    if len(heading_text) < 5 or len(heading_text) > 120 or not re.search(r"[A-Za-z]", heading_text):
        return None
    if heading_text.casefold() in {"card", "exit", "spawning"}:
        return None

    # A heading/body boundary is strongest when the body has a stable normal
    # size; smaller bold/italic runs inside those lines stay in the body unit.
    body_dominant_lines = [line for line in body if dominant_size(line)[0] == body_size]
    if len(body_dominant_lines) < 2:
        return None
    return [first], body, heading_text, first_size, body_size


def make_units(page: int, block: dict[str, Any], heading: list[dict[str, Any]], body: list[dict[str, Any]], heading_size: float, body_size: float) -> list[dict[str, Any]]:
    block_id = re.sub(r"[^a-z0-9-]+", "-", str(block.get("id", "")).casefold()).strip("-")
    heading_id = f"p{page}-{block_id}-heading-size-{heading_size:g}pt"
    body_id = f"p{page}-{block_id}-body-size-{body_size:g}pt"
    return [
        {"id": heading_id, "field": field(block, heading, heading_id)},
        {"id": body_id, "field": field(block, body, body_id)},
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write validated typographicUnits into the page JSONs")
    args = parser.parse_args()

    rows: list[dict[str, Any]] = []
    for dom_path in sorted(PAGE_ROOT.glob("page_*/page_*_dom.json")):
        page = int(dom_path.parent.name.split("_")[1])
        data = json.loads(dom_path.read_text(encoding="utf-8"))
        changed = False
        for block in data.get("blocks", []):
            found = candidate(page, block)
            if not found:
                continue
            heading, body, heading_text, heading_size, body_size = found
            units = make_units(page, block, heading, body, heading_size, body_size)
            existing = block.get("typographicUnits")
            if existing is not None and existing != units:
                raise SystemExit(f"p.{page} {block.get('id')} has a conflicting typographicUnits definition")
            rows.append({
                "page": page,
                "blockId": block.get("id", ""),
                "heading": heading_text,
                "headingSizePt": heading_size,
                "bodySizePt": body_size,
                "headingLineIds": [line.get("id", "") for line in heading],
                "bodyLineIds": [line.get("id", "") for line in body],
            })
            if args.apply and existing is None:
                block["typographicUnits"] = units
                changed = True
        if args.apply and changed:
            dom_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "heading-body-candidates.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "apply": args.apply,
        "candidates": len(rows),
        "pages": len({row["page"] for row in rows}),
        "pagesList": sorted({row["page"] for row in rows}),
        "report": str((OUT / "heading-body-candidates.json").resolve()),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
