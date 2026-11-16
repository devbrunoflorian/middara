#!/usr/bin/env python3
"""Summarize candidate geometry across pages without approving layout frames."""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
INPUT_ROOT = ROOT / "tmp" / "ghost-audit" / "page-gutters"
OUTPUT_ROOT = INPUT_ROOT
FIELDS = [
    "page", "width_pt", "height_pt", "candidate_count", "signal_class",
    "max_coactive_bands", "max_left_lines", "max_right_lines",
    "max_candidate_gutter_pt", "axis_min_pt", "axis_max_pt", "axis_span_pt",
    "candidates_with_image_bbox_intersection", "max_image_bbox_intersections",
]
REFERENCE_AXIS_PT = 411.27
REFERENCE_AXIS_TOLERANCE_PT = 5.0


def main() -> None:
    grouped: dict[int, list[dict[str, str]]] = defaultdict(list)
    with (INPUT_ROOT / "gutter-candidates-all.csv").open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            grouped[int(row["page"])].append(row)

    matrix: list[dict[str, Any]] = []
    parse_errors: list[str] = []
    for path in sorted(PAGE_ROOT.glob("page_*/page_*_dom.json")):
        try:
            page_data = json.loads(path.read_text(encoding="utf-8"))
            number = int(page_data["page_number"])
            candidates = grouped.get(number, [])
            count = len(candidates)
            signal = "no_text_corridor_candidate" if count == 0 else "single_text_corridor_candidate" if count == 1 else "multiple_text_corridor_candidates"
            axes = [float(row["x0"]) for row in candidates]
            image_intersections = [int(row["content_image_bboxes_crossing_corridor"]) for row in candidates]
            matrix.append({
                "page": number,
                "width_pt": round(float(page_data["width"]), 3),
                "height_pt": round(float(page_data["height"]), 3),
                "candidate_count": count,
                "signal_class": signal,
                "max_coactive_bands": max((int(row["coactive_bands"]) for row in candidates), default=0),
                "max_left_lines": max((int(row["left_coactive_lines"]) for row in candidates), default=0),
                "max_right_lines": max((int(row["right_coactive_lines"]) for row in candidates), default=0),
                "max_candidate_gutter_pt": max((float(row["gutter_width_pt"]) for row in candidates), default=0.0),
                "axis_min_pt": round(min(axes), 3) if axes else "",
                "axis_max_pt": round(max(axes), 3) if axes else "",
                "axis_span_pt": round(max(axes) - min(axes), 3) if len(axes) > 1 else 0.0,
                "candidates_with_image_bbox_intersection": sum(value > 0 for value in image_intersections),
                "max_image_bbox_intersections": max(image_intersections, default=0),
            })
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
            parse_errors.append(f"{path.relative_to(ROOT)}: {error}")

    matrix.sort(key=lambda row: row["page"])
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    with (OUTPUT_ROOT / "page-gutter-matrix.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(matrix)

    class_counts = Counter(row["signal_class"] for row in matrix)
    candidate_histogram = Counter(str(row["candidate_count"]) for row in matrix)
    aligned_pages = sorted({
        int(row["page"])
        for row in matrix
        if row["axis_min_pt"] != ""
        and any(abs(float(candidate["x0"]) - REFERENCE_AXIS_PT) <= REFERENCE_AXIS_TOLERANCE_PT
                for candidate in grouped.get(int(row["page"]), []))
    })
    summary = {
        "pages_in_matrix": len(matrix),
        "pages_with_parse_errors": len(parse_errors),
        "candidate_rows_all": sum(row["candidate_count"] for row in matrix),
        "provisional_signal_classes": dict(sorted(class_counts.items())),
        "candidate_count_histogram": dict(sorted(candidate_histogram.items(), key=lambda item: int(item[0]))),
        "pages_with_any_candidate_image_bbox_intersection": sum(row["candidates_with_image_bbox_intersection"] > 0 for row in matrix),
        "pages_with_axis_within_5pt_of_page13_reference": len(aligned_pages),
        "page13_reference_axis_pt": REFERENCE_AXIS_PT,
        "reference_axis_tolerance_pt": REFERENCE_AXIS_TOLERANCE_PT,
        "reference_axis_matches_are_unverified_candidates": aligned_pages,
        "interpretation": "signal classes describe scanner output only; they are not page-layout or frame approval",
        "errors": parse_errors,
    }
    (OUTPUT_ROOT / "page-gutter-matrix-summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
