"""Create and verify PDF navigation links for the contents and index pages."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

import pymupdf


CONTENTS_SOURCE_PAGES = (3, 101)
REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


def page_number_for_part(part: Path) -> int:
    match = re.fullmatch(r"page-(\d{3})", part.stem)
    if not match:
        raise ValueError(f"Cannot map PDF part to its Rulebook page: {part.name}")
    return int(match.group(1))


def contents_link_specs(
    rulebook_pages: list[int], repository_root: Path = REPOSITORY_ROOT,
) -> list[dict[str, Any]]:
    """Return row link rectangles and zero-based output-page destinations."""
    output_index = {page_number: index for index, page_number in enumerate(rulebook_pages)}
    if len(output_index) != len(rulebook_pages):
        raise ValueError("PDF export contains duplicate Rulebook pages.")

    specs: list[dict[str, Any]] = []
    for source_page in CONTENTS_SOURCE_PAGES:
        source_index = output_index.get(source_page)
        if source_index is None:
            continue
        rows_path = repository_root / "apps" / "web" / "public" / "pages" / f"page_{source_page:03d}" / "contents_rows.json"
        if not rows_path.is_file():
            raise FileNotFoundError(f"Missing contents navigation data: {rows_path}")
        payload = json.loads(rows_path.read_text(encoding="utf-8"))
        rows = payload.get("rows")
        if not isinstance(rows, list):
            raise ValueError(f"Contents rows are invalid in {rows_path.name}.")

        columns: dict[float, list[tuple[float, dict[str, Any]]]] = {}
        for row in rows:
            label_box = row.get("labelBBox")
            if not isinstance(label_box, list) or len(label_box) != 4:
                raise ValueError(f"Row {row.get('id')} has no complete label geometry.")
            label_values = [float(value) for value in label_box]
            if not all(math.isfinite(value) for value in label_values):
                raise ValueError(f"Row {row.get('id')} has non-finite label geometry.")
            center_y = (label_values[1] + label_values[3]) / 2
            columns.setdefault(round(label_values[0], 2), []).append((center_y, row))

        # On the dense p.101 index, adjacent text bboxes overlap slightly.
        # Split clickable areas at the midpoint so one row cannot steal a
        # click intended for the next page reference.
        row_bands: dict[str, tuple[float, float]] = {}
        for column_rows in columns.values():
            ordered = sorted(column_rows, key=lambda item: item[0])
            for index, (center_y, row) in enumerate(ordered):
                label_box = row["labelBBox"]
                top = float(label_box[1])
                bottom = float(label_box[3])
                if index > 0:
                    top = max(top, (ordered[index - 1][0] + center_y) / 2)
                if index + 1 < len(ordered):
                    bottom = min(bottom, (center_y + ordered[index + 1][0]) / 2)
                row_bands[str(row.get("id", ""))] = (top, bottom)

        for row in rows:
            target_page = row.get("targetPage")
            if not isinstance(target_page, int) or target_page not in output_index:
                continue
            label_box = row.get("labelBBox")
            number_box = row.get("numberBBox")
            if not (
                isinstance(label_box, list) and len(label_box) == 4
                and isinstance(number_box, list) and len(number_box) == 4
            ):
                raise ValueError(f"Row {row.get('id')} has no complete label/reference geometry.")
            values = [float(value) for value in (*label_box, *number_box)]
            if not all(math.isfinite(value) for value in values):
                raise ValueError(f"Row {row.get('id')} has non-finite link geometry.")
            rect = pymupdf.Rect(
                min(float(label_box[0]), float(number_box[0])),
                min(float(label_box[1]), float(number_box[1])),
                max(float(label_box[2]), float(number_box[2])),
                max(float(label_box[3]), float(number_box[3])),
            )
            band_top, band_bottom = row_bands[str(row.get("id", ""))]
            rect.y0 = max(rect.y0, band_top)
            rect.y1 = min(rect.y1, band_bottom)
            if rect.is_empty or rect.is_infinite:
                raise ValueError(f"Row {row.get('id')} has an empty or infinite link rectangle.")
            specs.append({
                "rowId": str(row.get("id", "")),
                "sourcePage": source_page,
                "sourceIndex": source_index,
                "targetPage": target_page,
                "targetIndex": output_index[target_page],
                "rect": rect,
            })
    return specs


def add_contents_links(
    document: pymupdf.Document,
    rulebook_pages: list[int],
    repository_root: Path = REPOSITORY_ROOT,
) -> list[dict[str, Any]]:
    specs = contents_link_specs(rulebook_pages, repository_root)
    for spec in specs:
        page = document[int(spec["sourceIndex"])]
        rect: pymupdf.Rect = spec["rect"]
        if not page.rect.contains(rect):
            raise ValueError(
                f"Contents row {spec['rowId']} on p.{spec['sourcePage']} falls outside the exported page."
            )
        page.insert_link({
            "kind": pymupdf.LINK_GOTO,
            "from": rect,
            "page": int(spec["targetIndex"]),
            "to": pymupdf.Point(0, 0),
            "zoom": 0,
        })
    return specs


def verify_contents_links(
    document: pymupdf.Document,
    specs: list[dict[str, Any]],
) -> None:
    for spec in specs:
        source_index = int(spec["sourceIndex"])
        expected_rect: pymupdf.Rect = spec["rect"]
        matches = []
        for link in document[source_index].get_links():
            if link.get("kind") != pymupdf.LINK_GOTO:
                continue
            actual_rect = pymupdf.Rect(link["from"])
            if (
                link.get("page") == int(spec["targetIndex"])
                and all(abs(actual_rect[index] - expected_rect[index]) <= 0.1 for index in range(4))
            ):
                matches.append(link)
        if len(matches) != 1:
            raise ValueError(
                f"Contents row {spec['rowId']} on p.{spec['sourcePage']} has {len(matches)} matching PDF links."
            )
