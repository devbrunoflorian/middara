#!/usr/bin/env python3
"""Read-only inventory of vertical reflow clearance for extracted typography units."""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
OUTPUT_ROOT = ROOT / "tmp" / "ghost-audit" / "reflow-clearance"
MIN_CLEARANCE_PT = 8.0
FOOTER_MAX_TOP_OFFSET_PT = 55.0
FOOTER_MAX_HEIGHT_PT = 20.0
FOOTER_MIN_WIDTH_PT = 500.0
CSV_FIELDS = [
    "page",
    "block_id",
    "block_bbox",
    "unit_count",
    "unit_summary",
    "frame_x0",
    "frame_x1",
    "component_bottom",
    "obstacle_type",
    "obstacle_id",
    "obstacle_bbox",
    "obstacle_y",
    "vertical_gap_pt",
    "available_shift_after_8pt_pt",
    "classification",
]


def bbox(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        return tuple(float(part) for part in value)  # type: ignore[return-value]
    except (TypeError, ValueError):
        return None


def get_text(block: dict[str, Any], unit: dict[str, Any]) -> str:
    line_ids = set(unit.get("field", {}).get("lineIds", []))
    pieces = []
    for line in block.get("lines", []):
        if line.get("id") not in line_ids:
            continue
        pieces.extend(str(span.get("displayOverride") or span.get("text") or "") for span in line.get("spans", []))
    return " ".join(" ".join(pieces).split())


def frame_span(units: list[dict[str, Any]]) -> tuple[float, float] | None:
    frames = [unit.get("field", {}).get("frame", {}) for unit in units]
    valid = []
    for frame in frames:
        try:
            x = float(frame["x"])
            width = float(frame["width"])
        except (KeyError, TypeError, ValueError):
            continue
        if width > 0:
            valid.append((x, x + width))
    if not valid:
        return None
    return min(x0 for x0, _ in valid), max(x1 for _, x1 in valid)


def find_obstacles(
    page: dict[str, Any],
    source_block: dict[str, Any],
    frame_x0: float,
    frame_x1: float,
) -> list[dict[str, Any]]:
    source_box = bbox(source_block.get("bbox"))
    if source_box is None:
        return []
    component_bottom = source_box[3]
    try:
        page_height = float(page.get("height", 0))
    except (TypeError, ValueError):
        page_height = 0.0
    obstacles: list[dict[str, Any]] = []

    for candidate in page.get("blocks", []):
        if candidate.get("id") == source_block.get("id"):
            continue
        candidate_box = bbox(candidate.get("bbox"))
        if candidate_box is None or candidate_box[0] >= frame_x1 or candidate_box[2] <= frame_x0:
            continue
        if candidate_box[3] <= component_bottom:
            continue
        obstacle_y = max(component_bottom, candidate_box[1])
        obstacles.append({
            "type": "text",
            "id": str(candidate.get("id", "unknown")),
            "bbox": candidate_box,
            "y": obstacle_y,
        })

    for image_index, image in enumerate(page.get("images", [])):
        if image.get("role") != "content":
            continue
        image_box = bbox(image.get("bbox"))
        if image_box is None or image_box[0] >= frame_x1 or image_box[2] <= frame_x0:
            continue
        if image_box[3] <= component_bottom:
            continue
        image_height = image_box[3] - image_box[1]
        image_width = image_box[2] - image_box[0]
        is_page_footer = (
            page_height > 0
            and image_box[1] >= page_height - FOOTER_MAX_TOP_OFFSET_PT
            and 0 < image_height <= FOOTER_MAX_HEIGHT_PT
            and image_width >= FOOTER_MIN_WIDTH_PT
        )
        obstacle_y = max(component_bottom, image_box[1])
        obstacles.append({
            "type": "footer" if is_page_footer else "image",
            "id": f"image_{image_index}",
            "bbox": image_box,
            "y": obstacle_y,
        })

    return sorted(obstacles, key=lambda obstacle: (obstacle["y"], obstacle["type"], obstacle["id"]))


def classify(obstacle: dict[str, Any] | None, gap: float | None) -> tuple[str, float | None]:
    if obstacle is None or gap is None:
        return "needs-visual", None
    available = max(0.0, gap - MIN_CLEARANCE_PT)
    if gap < MIN_CLEARANCE_PT:
        return "copyfit-blocked", available
    if obstacle["type"] == "image":
        return "needs-visual", available
    return "clearance-candidate", available


def build_inventory() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    page_files = sorted(PAGE_ROOT.glob("page_*/page_*_dom.json"))

    for path in page_files:
        try:
            page = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            errors.append({"file": str(path.relative_to(ROOT)), "error": str(error)})
            continue
        page_number = int(page.get("page_number", 0))
        for block in page.get("blocks", []):
            units = block.get("typographicUnits") or []
            if len(units) < 2:
                continue
            block_box = bbox(block.get("bbox"))
            span = frame_span(units)
            if block_box is None or span is None:
                errors.append({"file": str(path.relative_to(ROOT)), "error": f"invalid geometry in {block.get('id')}"})
                continue
            x0, x1 = span
            obstacle = next(iter(find_obstacles(page, block, x0, x1)), None)
            gap = obstacle["y"] - block_box[3] if obstacle else None
            classification, available = classify(obstacle, gap)
            summaries = []
            for unit in units:
                field_box = bbox(unit.get("field", {}).get("bbox"))
                size = None
                if field_box:
                    size = round(field_box[3] - field_box[1], 2)
                summaries.append({
                    "id": unit.get("id"),
                    "text": get_text(block, unit),
                    "bbox_height": size,
                })
            rows.append({
                "page": page_number,
                "block_id": block.get("id", ""),
                "block_bbox": json.dumps([round(value, 3) for value in block_box]),
                "unit_count": len(units),
                "unit_summary": json.dumps(summaries, ensure_ascii=False),
                "frame_x0": round(x0, 3),
                "frame_x1": round(x1, 3),
                "component_bottom": round(block_box[3], 3),
                "obstacle_type": obstacle["type"] if obstacle else "none",
                "obstacle_id": obstacle["id"] if obstacle else "",
                "obstacle_bbox": json.dumps([round(value, 3) for value in obstacle["bbox"]]) if obstacle else "",
                "obstacle_y": round(obstacle["y"], 3) if obstacle else "",
                "vertical_gap_pt": round(gap, 3) if gap is not None else "",
                "available_shift_after_8pt_pt": round(available, 3) if available is not None else "",
                "classification": classification,
            })

    status_counts = Counter(row["classification"] for row in rows)
    pages_by_status: dict[str, set[int]] = defaultdict(set)
    for row in rows:
        pages_by_status[row["classification"]].add(row["page"])
    summary = {
        "pages_found": len(page_files),
        "pages_with_parse_errors": len({error["file"] for error in errors}),
        "component_count": len(rows),
        "pages_with_components": len({row["page"] for row in rows}),
        "classification_counts": dict(sorted(status_counts.items())),
        "pages_by_classification": {key: sorted(values) for key, values in sorted(pages_by_status.items())},
        "min_clearance_pt": MIN_CLEARANCE_PT,
        "classification_note": "clearance-candidate means geometric room exists; it is not text-fit, visual, or page approval; repeated page-footer images are treated as page boundaries",
        "errors": errors,
    }
    return rows, summary


def main() -> None:
    rows, summary = build_inventory()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    with (OUTPUT_ROOT / "components.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    (OUTPUT_ROOT / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"CSV: {OUTPUT_ROOT / 'components.csv'}")
    print(f"Summary: {OUTPUT_ROOT / 'summary.json'}")


if __name__ == "__main__":
    main()
