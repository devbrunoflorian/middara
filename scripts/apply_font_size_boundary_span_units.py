#!/usr/bin/env python3
"""Manifest every remaining source font-size boundary as an edit unit.

This is metadata-only: source blocks, line order, bboxes and legacy translation
keys stay unchanged.  A unit never crosses a rounded source font-size change;
same-size fragments can join across adjacent lines when their column geometry
is continuous.  Existing semantic units remain in place and receive inline
size-boundary units when they contain mixed editable sizes.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
OUT = ROOT / "tmp" / "font-size-boundaries"
MIN_EDIT_SIZE = 6.0


def fragments(block: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for line_index, line in enumerate(block.get("lines", [])):
        current: dict[str, Any] | None = None
        for span_index, span in enumerate(line.get("spans", [])):
            if not str(span.get("text", "")).strip():
                continue
            size = round(float(span.get("size", 0.0)), 2)
            # Sub-6pt traces are decorative/image artifacts in this PDF, not
            # editable prose.  The source remains available to the renderer;
            # they simply must not create thousands of fake edit units.
            if size < MIN_EDIT_SIZE:
                continue
            if current is None or current["size"] != size:
                if current is not None:
                    result.append(current)
                current = {
                    "lineIndex": line_index,
                    "lineId": str(line.get("id", f"line_{line_index}")),
                    "firstSpanIndex": span_index,
                    "lastSpanIndex": span_index,
                    "spanRefs": [f"{line.get('id', f'line_{line_index}')}:{span_index}"],
                    "size": size,
                    "bbox": list(span.get("bbox", line.get("bbox", block.get("bbox", [])))),
                    "text": str(span.get("text", "")),
                }
            else:
                current["lastSpanIndex"] = span_index
                current["spanRefs"].append(f"{line.get('id', f'line_{line_index}')}:{span_index}")
                box = span.get("bbox", current["bbox"])
                current["bbox"] = [
                    min(current["bbox"][0], box[0]), min(current["bbox"][1], box[1]),
                    max(current["bbox"][2], box[2]), max(current["bbox"][3], box[3]),
                ]
                current["text"] += str(span.get("text", ""))
        if current is not None:
            result.append(current)
    return result


def joinable(group: dict[str, Any], fragment: dict[str, Any]) -> bool:
    last = group["fragments"][-1]
    if fragment["lineIndex"] <= last["lineIndex"] or fragment["size"] != group["size"]:
        return False
    vertical_gap = fragment["bbox"][1] - last["bbox"][1]
    if vertical_gap < 0 or vertical_gap > max(2.0, group["size"] * 1.30):
        return False
    left_delta = abs(fragment["bbox"][0] - last["bbox"][0])
    return left_delta <= max(2.0, group["size"] * 1.5)


def groups(block: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for fragment in fragments(block):
        eligible = [group for group in result if joinable(group, fragment)]
        if eligible:
            group = min(eligible, key=lambda item: abs(fragment["bbox"][1] - item["fragments"][-1]["bbox"][1]))
            group["fragments"].append(fragment)
        else:
            result.append({"size": fragment["size"], "fragments": [fragment]})
    return result


def unit_id(page: int, block: dict[str, Any], index: int, size: float) -> str:
    block_id = re.sub(r"[^a-z0-9-]+", "-", str(block.get("id", "")).casefold()).strip("-")
    return f"p{page}-{block_id}-font-size-{size:g}pt-unit-{index:02d}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write typographicSpanUnits into mixed-size blocks")
    args = parser.parse_args()

    rows: list[dict[str, Any]] = []
    changed_blocks = 0
    added_units = 0
    for dom_path in sorted(PAGE_ROOT.glob("page_*/page_*_dom.json")):
        page = int(dom_path.parent.name.split("_")[1])
        data = json.loads(dom_path.read_text(encoding="utf-8"))
        changed = False
        for block in data.get("blocks", []):
            # Semantic typography units define the major fields (for example a
            # heading and its body), but they do not necessarily split inline
            # 9 pt/10 pt runs inside one field.  Keep those fields and add the
            # independent span units below so every editable size remains a
            # selectable boundary.
            if block.get("creditUnits") or block.get("creditUnit") or block.get("typographicSpanUnits"):
                continue
            sizes = {
                round(float(span.get("size", 0.0)), 2)
                for line in block.get("lines", [])
                for span in line.get("spans", [])
                if str(span.get("text", "")).strip()
                and round(float(span.get("size", 0.0)), 2) >= MIN_EDIT_SIZE
            }
            if len(sizes) < 2:
                continue
            candidate_groups = groups(block)
            if len(candidate_groups) < 2:
                continue
            units = []
            for index, group in enumerate(candidate_groups):
                refs = [ref for fragment in group["fragments"] for ref in fragment["spanRefs"]]
                units.append({"id": unit_id(page, block, index, group["size"]), "spanRefs": refs})
            rows.append({
                "page": page,
                "blockId": block.get("id", ""),
                "sourceSizesPt": sorted(sizes),
                "unitCount": len(units),
                "unitIds": [unit["id"] for unit in units],
            })
            if args.apply:
                block["typographicSpanUnits"] = units
                changed = True
                changed_blocks += 1
                added_units += len(units)
        if args.apply and changed:
            dom_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "font-size-boundary-span-units.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "apply": args.apply,
        "blocks": len(rows),
        "pages": len({row["page"] for row in rows}),
        "units": sum(row["unitCount"] for row in rows),
        "changedBlocks": changed_blocks,
        "addedUnits": added_units,
        "report": str((OUT / "font-size-boundary-span-units.json").resolve()),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
