"""Inventory source-PDF alphabet callout boxes and nearby A-H labels."""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

import pymupdf

from apply_component_artwork_overlays import PDF as DEFAULT_PDF
from apply_component_artwork_overlays import TARGETS


ROOT = Path(__file__).resolve().parents[1]


def is_white(value: object) -> bool:
    return isinstance(value, (tuple, list)) and len(value) == 3 and all(float(v) >= 0.95 for v in value)


def distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def inside(point: tuple[float, float], box: list[float]) -> bool:
    return box[0] <= point[0] <= box[2] and box[1] <= point[1] <= box[3]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--out-dir", type=Path, default=ROOT / "tmp/component-audit")
    args = parser.parse_args()
    overlay_targets = [(int(t["page"]), [float(v) for v in t["bbox"]]) for t in TARGETS]
    rows: list[dict[str, object]] = []
    with pymupdf.open(args.pdf) as document:
        for page_number, page in enumerate(document, start=1):
            boxes: list[tuple[float, float, float, float]] = []
            for drawing in page.get_drawings():
                rect = drawing.get("rect")
                if rect is None or not is_white(drawing.get("fill")):
                    continue
                if 8 <= rect.width <= 30 and 8 <= rect.height <= 30 and rect.x0 >= 0 and rect.y0 >= 0 and rect.x1 <= page.rect.width and rect.y1 <= page.rect.height:
                    boxes.append((rect.x0, rect.y0, rect.x1, rect.y1))
            words = []
            for word in page.get_text("words"):
                text = str(word[4]).strip().upper()
                if text in set("ABCDEFGH"):
                    words.append((text, tuple(float(v) for v in word[:4])))
            for index, box in enumerate(boxes, start=1):
                centre = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
                candidates = [(text, bbox, distance(centre, ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2))) for text, bbox in words]
                candidates.sort(key=lambda item: item[2])
                label, label_box, gap = candidates[0] if candidates and candidates[0][2] <= 18 else ("", (), "")
                covered = any(page_number == target_page and inside(centre, target_box) for target_page, target_box in overlay_targets)
                rows.append({
                    "page": page_number,
                    "markerIndex": index,
                    "box": ",".join(f"{v:.2f}" for v in box),
                    "boxCenter": ",".join(f"{v:.2f}" for v in centre),
                    "fill": "white",
                    "nearestLabel": label,
                    "nearestLabelBBox": ",".join(f"{v:.2f}" for v in label_box) if label_box else "",
                    "centerGapPt": round(float(gap), 2) if gap != "" else "",
                    "coveredByComponentOverlay": covered,
                    "status": "covered-by-component-overlay" if covered else ("paired-candidate" if label else "box-without-nearby-label"),
                })
    args.out_dir.mkdir(parents=True, exist_ok=True)
    path = args.out_dir / "alphabet-marker-audit.csv"
    fields = list(rows[0]) if rows else []
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    summary = {
        "markerBoxes": len(rows),
        "pagesWithBoxes": len({row["page"] for row in rows}),
        "coveredByComponentOverlay": sum(bool(row["coveredByComponentOverlay"]) for row in rows),
        "pairedCandidates": sum(row["status"] == "paired-candidate" for row in rows),
        "boxesWithoutNearbyLabel": sum(row["status"] == "box-without-nearby-label" for row in rows),
    }
    (args.out_dir / "alphabet-marker-audit-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"CSV: {path.resolve()}")


if __name__ == "__main__":
    main()
