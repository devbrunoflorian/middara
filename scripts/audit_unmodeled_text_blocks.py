#!/usr/bin/env python3
"""Read-only structural census of text blocks outside multi-unit layout handling."""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
OUTPUT_ROOT = ROOT / "tmp" / "ghost-audit" / "unmodeled-text-blocks"
FIELDS = [
    "page", "block_id", "bbox", "x_anchor", "line_count", "span_count",
    "font_families", "font_sizes_pt", "weight_overrides", "color_count",
    "run_style_count", "mixed_run_lines", "size_family_signature",
    "nearest_text_block", "vertical_gap_pt", "suspected_ghost_lines",
]


def box(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        return tuple(float(part) for part in value)  # type: ignore[return-value]
    except (TypeError, ValueError):
        return None


def cluster_x_anchors(blocks: list[dict[str, Any]], tolerance: float = 2.0) -> dict[str, float]:
    entries = sorted((bbox[0], str(block.get("id", ""))) for block in blocks if (bbox := box(block.get("bbox"))))
    clusters: list[list[tuple[float, str]]] = []
    for entry in entries:
        if not clusters or entry[0] - clusters[-1][-1][0] > tolerance:
            clusters.append([entry])
        else:
            clusters[-1].append(entry)
    return {
        block_id: round(sum(x for x, _ in cluster) / len(cluster), 3)
        for cluster in clusters
        for _, block_id in cluster
    }


def style_key(span: dict[str, Any]) -> tuple[str, float, str, str, int]:
    try:
        size = round(float(span.get("size") or 0), 2)
    except (TypeError, ValueError):
        size = 0.0
    try:
        weight = str(span.get("renderWeightOverride") or "source")
    except TypeError:
        weight = "source"
    return (
        str(span.get("font") or ""),
        size,
        weight,
        str(span.get("color") or ""),
        int(span.get("flags") or 0),
    )


def nearest_text(block: dict[str, Any], blocks: list[dict[str, Any]]) -> tuple[str, float | None]:
    source = box(block.get("bbox"))
    if source is None:
        return "", None
    candidates = []
    for other in blocks:
        if other.get("id") == block.get("id"):
            continue
        other_box = box(other.get("bbox"))
        if other_box is None or other_box[0] >= source[2] or other_box[2] <= source[0]:
            continue
        if other_box[1] < source[3]:
            continue
        candidates.append((other_box[1] - source[3], str(other.get("id", ""))))
    if not candidates:
        return "", None
    gap, block_id = min(candidates)
    return block_id, round(gap, 3)


def build() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    files = sorted(PAGE_ROOT.glob("page_*/page_*_dom.json"))
    pages_with_legacy: set[int] = set()
    signature_counts: Counter[str] = Counter()
    page_x_anchor_counts: dict[int, int] = {}
    stats: Counter[str] = Counter()
    line_counts: Counter[str] = Counter()

    for path in files:
        try:
            page = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            errors.append({"file": str(path.relative_to(ROOT)), "error": str(error)})
            continue
        number = int(page.get("page_number", 0))
        blocks = page.get("blocks", [])
        anchors = cluster_x_anchors(blocks)
        page_x_anchor_counts[number] = len(set(anchors.values()))

        for block in blocks:
            units = block.get("typographicUnits") or []
            if len(units) >= 2:
                continue
            pages_with_legacy.add(number)
            lines = block.get("lines", [])
            spans = [span for line in lines for span in line.get("spans", [])]
            styles = {style_key(span) for span in spans}
            families = sorted({style[0] for style in styles})
            sizes = sorted({style[1] for style in styles})
            weights = sorted({style[2] for style in styles})
            mixed_run_lines = sum(len({style_key(s) for s in line.get("spans", [])}) > 1 for line in lines)
            multiset = []
            for line in lines:
                sig = sorted({(style_key(s)[0], style_key(s)[1]) for s in line.get("spans", [])})
                multiset.append("+".join(f"{font}@{size:g}" for font, size in sig))
            size_family_signature = ";".join(multiset)
            signature_counts[size_family_signature] += 1
            line_bucket = str(len(lines)) if len(lines) <= 8 else "9+"
            line_counts[line_bucket] += 1
            stats["blocks"] += 1
            stats["blocks_with_multiple_sizes"] += len(sizes) > 1
            stats["blocks_with_multiple_families"] += len(families) > 1
            stats["blocks_with_mixed_runs"] += mixed_run_lines > 0
            stats["single_line"] += len(lines) == 1
            stats["multiple_lines"] += len(lines) > 1
            nearest_id, gap = nearest_text(block, blocks)
            rows.append({
                "page": number,
                "block_id": block.get("id", ""),
                "bbox": json.dumps([round(x, 3) for x in box(block.get("bbox"))] if box(block.get("bbox")) else []),
                "x_anchor": anchors.get(str(block.get("id", "")), ""),
                "line_count": len(lines),
                "span_count": len(spans),
                "font_families": json.dumps(families, ensure_ascii=False),
                "font_sizes_pt": json.dumps(sizes),
                "weight_overrides": json.dumps(weights),
                "color_count": len({str(span.get("color") or "") for span in spans}),
                "run_style_count": len(styles),
                "mixed_run_lines": mixed_run_lines,
                "size_family_signature": size_family_signature,
                "nearest_text_block": nearest_id,
                "vertical_gap_pt": gap if gap is not None else "",
                "suspected_ghost_lines": sum(bool(line.get("suspectedGhost")) for line in lines),
            })

    summary = {
        "pages_found": len(files),
        "pages_with_parse_errors": len({error["file"] for error in errors}),
        "pages_with_unmodeled_blocks": len(pages_with_legacy),
        "unmodeled_block_count": len(rows),
        "pages_with_no_multi_unit_component": sum(1 for path in files if not _page_has_multi(path)),
        "counts": dict(sorted(stats.items())),
        "line_count_buckets": dict(sorted(line_counts.items(), key=lambda item: (item[0] == "9+", item[0]))),
        "x_anchor_counts_by_page": page_x_anchor_counts,
        "top_size_family_signatures": [
            {"count": count, "signature": signature}
            for signature, count in signature_counts.most_common(100)
        ],
        "errors": errors,
    }
    return rows, summary


def _page_has_multi(path: Path) -> bool:
    page = json.loads(path.read_text(encoding="utf-8"))
    return any(len(block.get("typographicUnits") or []) >= 2 for block in page.get("blocks", []))


def main() -> None:
    rows, summary = build()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    with (OUTPUT_ROOT / "legacy-blocks.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    (OUTPUT_ROOT / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in summary.items() if key != "top_size_family_signatures" and key != "x_anchor_counts_by_page"}, indent=2, ensure_ascii=False))
    print(f"CSV: {OUTPUT_ROOT / 'legacy-blocks.csv'}")
    print(f"Summary: {OUTPUT_ROOT / 'summary.json'}")


if __name__ == "__main__":
    main()
