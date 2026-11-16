#!/usr/bin/env python3
"""Read-only candidates for page-local text gutters and vertical axes."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
OUTPUT_ROOT = ROOT / "tmp" / "ghost-audit" / "page-gutters"
MIN_GUTTER_PT = 6.0
OUTER_MARGIN_PT = 24.0
MAX_BLOCK_WIDTH_RATIO = 0.78
Y_BAND_HEIGHT_PT = 100.0
Y_BAND_STEP_PT = 50.0
MIN_BLOCKS_EACH_SIDE = 2
MIN_LINES_EACH_SIDE = 5
MIN_COACTIVE_BANDS = 2
AXIS_CLUSTER_TOLERANCE_PT = 10.0
FIELDS = [
    "page", "x0", "x_start", "x_end", "gutter_width_pt", "left_blocks", "right_blocks",
    "coactive_bands", "left_coactive_lines", "right_coactive_lines", "vertical_start", "vertical_end",
    "content_image_bboxes_crossing_corridor",
    "candidate_rank_note",
]


def bbox(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        return tuple(float(part) for part in value)  # type: ignore[return-value]
    except (TypeError, ValueError):
        return None


def empty_gaps(boxes: list[tuple[float, float, float, float]], width: float) -> list[tuple[float, float]]:
    edges = sorted({x for item in boxes for x in (item[0], item[2])})
    gaps: list[tuple[float, float]] = []
    for left, right in zip(edges, edges[1:]):
        if right - left < MIN_GUTTER_PT:
            continue
        if left < OUTER_MARGIN_PT or right > width - OUTER_MARGIN_PT:
            continue
        if any(box_left < right and box_right > left for box_left, _, box_right, _ in boxes):
            continue
        if gaps and abs(gaps[-1][1] - left) < 0.01:
            gaps[-1] = (gaps[-1][0], right)
        else:
            gaps.append((left, right))
    return gaps


def find_candidates(page: dict[str, Any]) -> list[dict[str, Any]]:
    width, height = float(page["width"]), float(page["height"])
    blocks: list[tuple[str, tuple[float, float, float, float], list[tuple[float, float, float, float]]]] = []
    for block in page.get("blocks", []):
        block_box = bbox(block.get("bbox"))
        if block_box is None or block_box[2] - block_box[0] > width * MAX_BLOCK_WIDTH_RATIO:
            continue
        line_boxes = [line_box for line in block.get("lines", []) if (line_box := bbox(line.get("bbox")))]
        blocks.append((str(block.get("id", "")), block_box, line_boxes))

    raw: list[dict[str, Any]] = []
    y = OUTER_MARGIN_PT
    while y + Y_BAND_HEIGHT_PT <= height - OUTER_MARGIN_PT:
        y_end = y + Y_BAND_HEIGHT_PT
        active = [item for item in blocks if item[1][1] < y_end and item[1][3] > y]
        for x_start, x_end in empty_gaps([item[1] for item in active], width):
            left = [item for item in active if item[1][2] <= x_start + 0.01]
            right = [item for item in active if item[1][0] >= x_end - 0.01]
            left_lines = [line for item in left for line in item[2] if line[0] < x_start and line[2] <= x_start + 0.01 and line[1] < y_end and line[3] > y]
            right_lines = [line for item in right for line in item[2] if line[0] >= x_end - 0.01 and line[1] < y_end and line[3] > y]
            if len(left) < MIN_BLOCKS_EACH_SIDE or len(right) < MIN_BLOCKS_EACH_SIDE:
                continue
            if len(left_lines) < MIN_LINES_EACH_SIDE or len(right_lines) < MIN_LINES_EACH_SIDE:
                continue
            raw.append({
                "x0": (x_start + x_end) / 2,
                "x_start": x_start,
                "x_end": x_end,
                "width": x_end - x_start,
                "y_start": y,
                "y_end": y_end,
                "left": len(left),
                "right": len(right),
                "left_lines": len(left_lines),
                "right_lines": len(right_lines),
            })
        y += Y_BAND_STEP_PT

    clusters: list[list[dict[str, Any]]] = []
    for item in sorted(raw, key=lambda value: (value["x0"], value["y_start"])):
        matching = next((cluster for cluster in clusters
            if abs(sum(x["x0"] for x in cluster) / len(cluster) - item["x0"]) <= AXIS_CLUSTER_TOLERANCE_PT
            and all(x["y_start"] != item["y_start"] for x in cluster)), None)
        if matching is None:
            clusters.append([item])
        else:
            matching.append(item)

    candidates = []
    for cluster in clusters:
        bands = sorted(cluster, key=lambda item: item["y_start"])
        if len(bands) < MIN_COACTIVE_BANDS:
            continue
        common_x_start = max(item["x_start"] for item in bands)
        common_x_end = min(item["x_end"] for item in bands)
        if common_x_end - common_x_start < MIN_GUTTER_PT:
            continue
        vertical_start = min(item["y_start"] for item in bands)
        vertical_end = max(item["y_end"] for item in bands)
        image_crossings = 0
        for image in page.get("images", []):
            if image.get("role") != "content":
                continue
            image_box = bbox(image.get("bbox"))
            if image_box and image_box[0] < common_x_end and image_box[2] > common_x_start \
                    and image_box[1] < vertical_end and image_box[3] > vertical_start:
                image_crossings += 1
        candidates.append({
            "page": int(page.get("page_number", 0)),
            "x0": round((common_x_start + common_x_end) / 2, 3),
            "x_start": round(common_x_start, 3),
            "x_end": round(common_x_end, 3),
            "gutter_width_pt": round(common_x_end - common_x_start, 3),
            "left_blocks": max(item["left"] for item in bands),
            "right_blocks": max(item["right"] for item in bands),
            "coactive_bands": len(bands),
            "left_coactive_lines": max(item["left_lines"] for item in bands),
            "right_coactive_lines": max(item["right_lines"] for item in bands),
            "vertical_start": round(vertical_start, 3),
            "vertical_end": round(vertical_end, 3),
            "content_image_bboxes_crossing_corridor": image_crossings,
            "candidate_rank_note": "common empty text-bbox corridor across overlapping vertical bands; visual review required",
        })
    return sorted(candidates, key=lambda row: (
        row["coactive_bands"], min(row["left_blocks"], row["right_blocks"]), row["gutter_width_pt"]
    ), reverse=True)


def main() -> None:
    files = sorted(PAGE_ROOT.glob("page_*/page_*_dom.json"))
    rows: list[dict[str, Any]] = []
    top_rows: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    pages_with_candidates = set()
    for path in files:
        try:
            page = json.loads(path.read_text(encoding="utf-8"))
            candidates = find_candidates(page)
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
            errors.append({"file": str(path.relative_to(ROOT)), "error": str(error)})
            continue
        if candidates:
            pages_with_candidates.add(int(page.get("page_number", 0)))
            rows.extend(candidates)
            top_rows.extend(candidates[:5])

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    with (OUTPUT_ROOT / "gutter-candidates-all.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    with (OUTPUT_ROOT / "gutter-candidates.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(top_rows)
    summary = {
        "pages_found": len(files),
        "pages_with_parse_errors": len({error["file"] for error in errors}),
        "pages_with_candidates": len(pages_with_candidates),
        "candidate_rows_all": len(rows),
        "candidate_rows_top5_per_page": len(top_rows),
        "parameters": {
            "min_gutter_pt": MIN_GUTTER_PT,
            "outer_margin_pt": OUTER_MARGIN_PT,
            "max_block_width_ratio": MAX_BLOCK_WIDTH_RATIO,
            "y_band_height_pt": Y_BAND_HEIGHT_PT,
            "y_band_step_pt": Y_BAND_STEP_PT,
            "min_blocks_each_side": MIN_BLOCKS_EACH_SIDE,
            "min_lines_each_side": MIN_LINES_EACH_SIDE,
            "min_coactive_bands": MIN_COACTIVE_BANDS,
            "axis_cluster_tolerance_pt": AXIS_CLUSTER_TOLERANCE_PT,
        },
        "interpretation": "candidate axes are text-bbox corridors only; not verified columns or safe edit frames",
        "errors": errors,
    }
    (OUTPUT_ROOT / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"CSV: {OUTPUT_ROOT / 'gutter-candidates.csv'}")


if __name__ == "__main__":
    main()
