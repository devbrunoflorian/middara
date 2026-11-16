#!/usr/bin/env python3
"""Combine text, style, gutter and image-bbox features per page for triage."""

from __future__ import annotations

import csv
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
INPUT_ROOT = ROOT / "tmp" / "ghost-audit" / "page-gutters"
STYLE_CSV = ROOT / "tmp" / "ghost-audit" / "style-unit-separation" / "block-style-separation.csv"
OUTPUT_ROOT = ROOT / "tmp" / "ghost-audit" / "page-zones"
FIELDS = [
    "page", "width_pt", "height_pt", "text_blocks", "text_lines", "text_spans",
    "full_width_text_blocks", "blocks_with_existing_edit_units", "mixed_size_blocks_without_units",
    "same_baseline_mixed_size_blocks_without_units", "rich_text_style_blocks_without_units",
    "background_image_bboxes", "content_image_bboxes", "content_images_under_1pct",
    "content_images_1_to_5pct", "content_images_5_to_20pct", "content_images_at_least_20pct",
    "content_bbox_area_median_pct", "content_bbox_area_max_pct", "gutter_candidate_count",
    "candidate_axes_with_image_bbox_intersection", "max_candidate_persistence_bands",
    "candidate_axis_min_pt", "candidate_axis_max_pt", "candidate_axis_span_pt",
    "axes_within_5pt_of_411_27pt",
]


def bbox(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        return tuple(float(part) for part in value)  # type: ignore[return-value]
    except (TypeError, ValueError):
        return None


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    styles_by_page: dict[int, list[dict[str, str]]] = defaultdict(list)
    for row in read_csv(STYLE_CSV):
        styles_by_page[int(row["page"])].append(row)
    gutters_by_page: dict[int, list[dict[str, str]]] = defaultdict(list)
    for row in read_csv(INPUT_ROOT / "gutter-candidates-all.csv"):
        gutters_by_page[int(row["page"])].append(row)

    matrix: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    image_bbox_signatures: dict[tuple[float, float, float, float], dict[str, Any]] = {}
    for path in sorted(PAGE_ROOT.glob("page_*/page_*_dom.json")):
        try:
            page = json.loads(path.read_text(encoding="utf-8"))
            number = int(page["page_number"])
            width, height = float(page["width"]), float(page["height"])
            area = width * height
            blocks = page.get("blocks", [])
            style_rows = styles_by_page.get(number, [])
            gutters = gutters_by_page.get(number, [])

            background_count = 0
            content_areas: list[float] = []
            for image in page.get("images", []):
                if image.get("role") == "background":
                    background_count += 1
                    continue
                if image.get("role") != "content":
                    continue
                image_box = bbox(image.get("bbox"))
                if image_box is None:
                    continue
                image_area = max(0.0, image_box[2] - image_box[0]) * max(0.0, image_box[3] - image_box[1])
                content_areas.append(image_area / area)
                signature = tuple(round(value, 1) for value in image_box)
                record = image_bbox_signatures.setdefault(signature, {"pages": set(), "occurrences": 0, "max_area_pct": 0.0})
                record["pages"].add(number)
                record["occurrences"] += 1
                record["max_area_pct"] = max(record["max_area_pct"], image_area / area * 100)

            line_count = sum(len(block.get("lines", [])) for block in blocks)
            span_count = sum(
                len(line.get("spans", []))
                for block in blocks for line in block.get("lines", [])
            )
            full_width = 0
            for block in blocks:
                block_box = bbox(block.get("bbox"))
                if block_box and (block_box[2] - block_box[0]) / width >= 0.7:
                    full_width += 1

            style_counts = Counter(row["classification"] for row in style_rows)
            axes = [float(row["x0"]) for row in gutters]
            matrix.append({
                "page": number,
                "width_pt": round(width, 3),
                "height_pt": round(height, 3),
                "text_blocks": len(blocks),
                "text_lines": line_count,
                "text_spans": span_count,
                "full_width_text_blocks": full_width,
                "blocks_with_existing_edit_units": style_counts.get("units_already_defined", 0),
                "mixed_size_blocks_without_units": sum(
                    row["classification"] in {"inline_and_cross_line_size_mix", "same_baseline_mixed_sizes", "cross_line_size_changes"}
                    for row in style_rows
                ),
                "same_baseline_mixed_size_blocks_without_units": sum(
                    row["classification"] in {"inline_and_cross_line_size_mix", "same_baseline_mixed_sizes"}
                    for row in style_rows
                ),
                "rich_text_style_blocks_without_units": sum(
                    row["classification"] == "same_baseline_rich_text_style" for row in style_rows
                ),
                "background_image_bboxes": background_count,
                "content_image_bboxes": len(content_areas),
                "content_images_under_1pct": sum(value < 0.01 for value in content_areas),
                "content_images_1_to_5pct": sum(0.01 <= value < 0.05 for value in content_areas),
                "content_images_5_to_20pct": sum(0.05 <= value < 0.20 for value in content_areas),
                "content_images_at_least_20pct": sum(value >= 0.20 for value in content_areas),
                "content_bbox_area_median_pct": round(statistics.median(content_areas) * 100, 4) if content_areas else 0.0,
                "content_bbox_area_max_pct": round(max(content_areas, default=0.0) * 100, 3),
                "gutter_candidate_count": len(gutters),
                "candidate_axes_with_image_bbox_intersection": sum(
                    int(row["content_image_bboxes_crossing_corridor"]) > 0 for row in gutters
                ),
                "max_candidate_persistence_bands": max((int(row["coactive_bands"]) for row in gutters), default=0),
                "candidate_axis_min_pt": round(min(axes), 3) if axes else "",
                "candidate_axis_max_pt": round(max(axes), 3) if axes else "",
                "candidate_axis_span_pt": round(max(axes) - min(axes), 3) if len(axes) > 1 else 0.0,
                "axes_within_5pt_of_411_27pt": sum(abs(axis - 411.27) <= 5 for axis in axes),
            })
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
            errors.append({"file": str(path.relative_to(ROOT)), "error": str(error)})

    matrix.sort(key=lambda row: row["page"])
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    with (OUTPUT_ROOT / "page-zone-signatures.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(matrix)

    repeated_images = []
    for box, record in image_bbox_signatures.items():
        if len(record["pages"]) < 5 or record["max_area_pct"] < 0.1:
            continue
        repeated_images.append({
            "bbox_x0": box[0], "bbox_y0": box[1], "bbox_x1": box[2], "bbox_y1": box[3],
            "page_count": len(record["pages"]), "occurrence_count": record["occurrences"],
            "max_bbox_area_pct": round(record["max_area_pct"], 3),
            "pages": ",".join(str(page) for page in sorted(record["pages"])),
        })
    repeated_images.sort(key=lambda row: (row["page_count"], row["max_bbox_area_pct"]), reverse=True)
    with (OUTPUT_ROOT / "repeated-content-image-bboxes.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        fields = ["bbox_x0", "bbox_y0", "bbox_x1", "bbox_y1", "page_count", "occurrence_count", "max_bbox_area_pct", "pages"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(repeated_images)

    summary = {
        "pages_found": len(matrix),
        "pages_with_parse_errors": len(errors),
        "text_blocks": sum(row["text_blocks"] for row in matrix),
        "text_lines": sum(row["text_lines"] for row in matrix),
        "text_spans": sum(row["text_spans"] for row in matrix),
        "gutter_candidates": sum(row["gutter_candidate_count"] for row in matrix),
        "pages_with_content_image_bboxes": sum(row["content_image_bboxes"] > 0 for row in matrix),
        "pages_with_at_least_one_content_image_bbox_5pct_of_page": sum(row["content_images_5_to_20pct"] + row["content_images_at_least_20pct"] > 0 for row in matrix),
        "pages_with_many_small_content_image_bboxes_gt_100": sum(row["content_images_under_1pct"] > 100 for row in matrix),
        "unique_content_image_bbox_signatures_rounded_0_1pt": len(image_bbox_signatures),
        "bbox_signatures_repeated_on_5plus_pages": len(repeated_images),
        "most_repeated_image_bbox_signatures": repeated_images[:10],
        "interpretation": "geometry inventory only; content image bboxes may be fragments, and no metric establishes visible shape or safe layout frame",
        "errors": errors,
    }
    (OUTPUT_ROOT / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
