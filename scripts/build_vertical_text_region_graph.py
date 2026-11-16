#!/usr/bin/env python3
"""Group source text lines into vertical alignment tracks for layout triage."""

from __future__ import annotations

import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
OUTPUT_ROOT = ROOT / "tmp" / "ghost-audit" / "text-region-graph"
BAND_HEIGHT_PT = 100.0
BAND_STEP_PT = 50.0
X_START_TOLERANCE_PT = 18.0
TRACK_LINK_TOLERANCE_PT = 24.0
FIELDS = [
    "page", "band_index", "band_y0_pt", "band_y1_pt", "group_id", "track_id",
    "line_count", "block_count", "x_start_median_pt", "x_min_pt", "x_max_pt",
    "distinct_sizes_pt", "min_size_pt", "max_size_pt", "tiny_line_count_under_4pt",
    "sample_text",
]


class UnionFind:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def add(self, value: str) -> None:
        self.parent.setdefault(value, value)

    def find(self, value: str) -> str:
        self.add(value)
        if self.parent[value] != value:
            self.parent[value] = self.find(self.parent[value])
        return self.parent[value]

    def union(self, first: str, second: str) -> None:
        root_a, root_b = self.find(first), self.find(second)
        if root_a != root_b:
            self.parent[root_b] = root_a


def valid_bbox(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        return tuple(float(part) for part in value)  # type: ignore[return-value]
    except (TypeError, ValueError):
        return None


def line_record(page_number: int, block: dict[str, Any], line: dict[str, Any]) -> dict[str, Any] | None:
    box = valid_bbox(line.get("bbox"))
    if box is None:
        return None
    spans = [span for span in line.get("spans", []) if isinstance(span, dict)]
    sizes = [round(float(span.get("size", 0.0) or 0.0), 2) for span in spans]
    text = "".join(str(span.get("text", "")) for span in spans)
    return {
        "page": page_number,
        "block_id": str(block.get("id", "")),
        "line_id": str(line.get("id", "")),
        "unique_id": f"{page_number}:{block.get('id', '')}:{line.get('id', '')}",
        "bbox": box,
        "x_start": box[0],
        "x_end": box[2],
        "y_start": box[1],
        "y_end": box[3],
        "sizes": sizes,
        "text": " ".join(text.split()),
    }


def cluster_by_line_start(
    lines: list[dict[str, Any]], tolerance_pt: float
) -> list[list[dict[str, Any]]]:
    """Greedily group lines whose left edges share a local alignment lane."""
    clusters: list[list[dict[str, Any]]] = []
    centers: list[float] = []
    for line in sorted(lines, key=lambda item: (item["x_start"], item["y_start"])):
        options = [
            (abs(line["x_start"] - center), index)
            for index, center in enumerate(centers)
            if abs(line["x_start"] - center) <= tolerance_pt
        ]
        if not options:
            clusters.append([line])
            centers.append(line["x_start"])
            continue
        _, index = min(options)
        clusters[index].append(line)
        centers[index] = statistics.median(item["x_start"] for item in clusters[index])
    return clusters


def main() -> None:
    all_group_rows: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    page_metrics: list[dict[str, Any]] = []
    for path in sorted(PAGE_ROOT.glob("page_*/page_*_dom.json")):
        try:
            page_data = json.loads(path.read_text(encoding="utf-8"))
            page_number = int(page_data["page_number"])
            height = float(page_data["height"])
            lines = [
                record
                for block in page_data.get("blocks", [])
                for line in block.get("lines", [])
                if (record := line_record(page_number, block, line)) is not None
            ]
            union_find = UnionFind()
            band_groups: list[dict[str, Any]] = []
            band_index = 0
            y_start = 0.0
            previous_band: list[dict[str, Any]] = []
            while y_start < height:
                y_end = min(height, y_start + BAND_HEIGHT_PT)
                active = [line for line in lines if line["y_start"] < y_end and line["y_end"] > y_start]
                clusters = cluster_by_line_start(active, X_START_TOLERANCE_PT)

                current_band: list[dict[str, Any]] = []
                for group_index, cluster in enumerate(clusters):
                    group_id = f"p{page_number:03}-b{band_index:02}-g{group_index:02}"
                    union_find.add(group_id)
                    sizes = sorted({size for line in cluster for size in line["sizes"]})
                    sample_text = " | ".join(line["text"] for line in cluster if line["text"])[:180]
                    group = {
                        "page": page_number,
                        "band_index": band_index,
                        "band_y0_pt": round(y_start, 3),
                        "band_y1_pt": round(y_end, 3),
                        "group_id": group_id,
                        "track_id": "",
                        "line_count": len({line["unique_id"] for line in cluster}),
                        "block_count": len({line["block_id"] for line in cluster}),
                        "x_start_median_pt": round(statistics.median(line["x_start"] for line in cluster), 3),
                        "x_min_pt": round(min(line["x_start"] for line in cluster), 3),
                        "x_max_pt": round(max(line["x_end"] for line in cluster), 3),
                        "distinct_sizes_pt": ",".join(f"{size:g}" for size in sizes),
                        "min_size_pt": round(min(sizes), 2) if sizes else 0,
                        "max_size_pt": round(max(sizes), 2) if sizes else 0,
                        "tiny_line_count_under_4pt": sum(
                            bool(line["sizes"]) and max(line["sizes"]) < 4 for line in cluster
                        ),
                        "sample_text": sample_text,
                    }
                    current_band.append(group)
                    band_groups.append(group)
                if previous_band:
                    # Keep every geometric edge. Connected components are a
                    # coarse navigation aid and may chain across nearby lanes;
                    # they are not approved text boxes or semantic regions.
                    for current in current_band:
                        matches = [
                            previous for previous in previous_band
                            if abs(current["x_start_median_pt"] - previous["x_start_median_pt"])
                            <= TRACK_LINK_TOLERANCE_PT
                        ]
                        for previous in matches:
                            union_find.union(current["group_id"], previous["group_id"])
                previous_band = current_band
                y_start += BAND_STEP_PT
                band_index += 1

            for group in band_groups:
                group["track_id"] = f"p{page_number:03}-track-{union_find.find(group['group_id'])}"
            all_group_rows.extend(band_groups)
            unique_lines = len({line["unique_id"] for line in lines})
            track_groups: dict[str, set[int]] = defaultdict(set)
            for group in band_groups:
                track_groups[group["track_id"]].add(group["band_index"])
            page_metrics.append({
                "page": page_number,
                "line_count": unique_lines,
                "band_group_count": len(band_groups),
                "track_count": len(track_groups),
                "max_bands_per_track": max((len(bands) for bands in track_groups.values()), default=0),
                "bands_with_1_group": sum(sum(g["band_index"] == i for g in band_groups) == 1 for i in range(band_index)),
                "bands_with_2_groups": sum(sum(g["band_index"] == i for g in band_groups) == 2 for i in range(band_index)),
                "bands_with_3plus_groups": sum(sum(g["band_index"] == i for g in band_groups) >= 3 for i in range(band_index)),
            })
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
            errors.append({"file": str(path.relative_to(ROOT)), "error": str(error)})

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    with (OUTPUT_ROOT / "vertical-text-region-groups.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(all_group_rows)
    with (OUTPUT_ROOT / "page-track-summary.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        fields = list(page_metrics[0]) if page_metrics else ["page"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(sorted(page_metrics, key=lambda row: row["page"]))
    summary = {
        "pages_found": len(page_metrics),
        "pages_with_parse_errors": len(errors),
        "unique_source_text_lines": sum(row["line_count"] for row in page_metrics),
        "vertical_band_groups": len(all_group_rows),
        "band_group_line_placements": sum(row["line_count"] for row in all_group_rows),
        "overlapping_band_line_placement_factor": round(
            sum(row["line_count"] for row in all_group_rows)
            / max(sum(row["line_count"] for row in page_metrics), 1), 3
        ),
        "track_tolerance_pt": TRACK_LINK_TOLERANCE_PT,
        "line_start_cluster_tolerance_pt": X_START_TOLERANCE_PT,
        "band_height_pt": BAND_HEIGHT_PT,
        "band_step_pt": BAND_STEP_PT,
        "interpretation": "groups/tracks are text-line geometry only; they do not establish semantic boxes, images, or safe edit frames",
        "errors": errors,
    }
    (OUTPUT_ROOT / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
