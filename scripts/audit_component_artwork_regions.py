"""Book-wide screening inventory for component/artwork regions.

This is deliberately a triage report, not a classifier.  It records the
source-PDF image operations that can represent cards, tokens, maps, and other
physical game components, then relates them to extracted HTML lines and the
explicit overlay targets.  Final decisions still require a source/background
comparison and are written in the companion QA report.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import pymupdf

from apply_component_artwork_overlays import PDF as DEFAULT_PDF, TARGETS


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"


def area(box: tuple[float, float, float, float]) -> float:
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def overlap(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    return max(0.0, x1 - x0) * max(0.0, y1 - y0)


def local_image_info(page: pymupdf.Page) -> list[tuple[float, float, float, float]]:
    result = []
    for info in page.get_image_info():
        box = tuple(float(value) for value in info["bbox"])
        w, h = box[2] - box[0], box[3] - box[1]
        # Ignore full-page/background strips and tiny texture fragments.  The
        # threshold is intentionally permissive so the queue errs toward review.
        if box[0] < 0 or box[1] < 0 or box[2] > page.rect.width or box[3] > page.rect.height:
            continue
        if w >= 35 and h >= 25 and area(box) >= 900:
            if w >= page.rect.width * 0.92 and h >= page.rect.height * 0.92:
                continue
            result.append(box)
    return result


def line_bbox(line: dict) -> tuple[float, float, float, float] | None:
    value = line.get("bbox")
    if not isinstance(value, list) or len(value) != 4:
        return None
    return tuple(float(x) for x in value)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--json-dir", type=Path, default=PAGE_DIR)
    parser.add_argument("--out-dir", type=Path, default=ROOT / "tmp/component-audit")
    args = parser.parse_args()
    explicit_pages = {int(target["page"]) for target in TARGETS}
    explicit_regions = {int(target["page"]): [] for target in TARGETS}
    for target in TARGETS:
        explicit_regions[int(target["page"])].append(target)

    rows: list[dict[str, object]] = []
    with pymupdf.open(args.pdf) as document:
        for page_number in range(1, min(document.page_count, 102) + 1):
            page = document[page_number - 1]
            dom_path = args.json_dir / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
            overlays_path = dom_path.parent / "fidelity_overlays.json"
            dom = json.loads(dom_path.read_text(encoding="utf-8")) if dom_path.is_file() else {}
            lines = [line for block in dom.get("blocks", []) for line in block.get("lines", [])]
            image_boxes = local_image_info(page)
            overlapping_lines = sum(
                1 for line in lines if (bbox := line_bbox(line)) and any(overlap(bbox, image) / max(area(bbox), 1) >= 0.5 for image in image_boxes)
            )
            duplicate_lines = sum(1 for line in lines if line.get("rasterizedDuplicate"))
            overlays = json.loads(overlays_path.read_text(encoding="utf-8")).get("overlays", []) if overlays_path.is_file() else []
            component_overlays = sum(1 for item in overlays if str(item.get("category", "")) in {"item-cards", "discipline-cards", "initiative-cards", "combatant-cards", "diagram"})
            largest = max((area(box) for box in image_boxes), default=0.0)
            rows.append({
                "page": page_number,
                "printedPage": page_number,
                "sourceLocalImageOps": len(image_boxes),
                "sourceLargestLocalImageAreaPt2": round(largest, 1),
                "htmlLines": len(lines),
                "htmlLinesOverlappingImageOps": overlapping_lines,
                "existingRasterizedDuplicateLines": duplicate_lines,
                "componentOverlayRegions": component_overlays,
                "manualOverlayRegions": len(explicit_regions.get(page_number, [])),
                "screeningStatus": "confirmed-overlay" if page_number in explicit_pages else ("needs-visual-review" if len(image_boxes) >= 3 or largest >= 12000 else "low-signal"),
            })

    args.out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.out_dir / "bookwide-component-candidates.csv"
    fields = list(rows[0])
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    summary = {
        "pages": len(rows),
        "confirmedOverlayPages": sum(row["screeningStatus"] == "confirmed-overlay" for row in rows),
        "needsVisualReviewPages": sum(row["screeningStatus"] == "needs-visual-review" for row in rows),
        "lowSignalPages": sum(row["screeningStatus"] == "low-signal" for row in rows),
        "sourceLocalImageOps": sum(int(row["sourceLocalImageOps"]) for row in rows),
        "htmlLinesOverlappingImageOps": sum(int(row["htmlLinesOverlappingImageOps"]) for row in rows),
        "existingRasterizedDuplicateLines": sum(int(row["existingRasterizedDuplicateLines"]) for row in rows),
        "componentOverlayRegions": sum(int(row["componentOverlayRegions"]) for row in rows),
    }
    json_path = args.out_dir / "bookwide-component-candidates-summary.json"
    json_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"CSV: {csv_path.resolve()}")


if __name__ == "__main__":
    main()
