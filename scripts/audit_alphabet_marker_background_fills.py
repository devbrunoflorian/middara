"""Check paired A-H callout boxes against their rendered viewer backgrounds.

The source PDF vector boxes are white. This audit samples a small interior
patch that avoids the letter glyph and reports boxes whose background.webp
fill is no longer white. It is diagnostic only; it never edits assets.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

import pymupdf
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_DIR = ROOT / "apps/web/public/pages"
SAMPLE_INSET = (0.8, 3.5, 2.5, 5.0)


def is_white(fill: object) -> bool:
    return isinstance(fill, (tuple, list)) and len(fill) == 3 and all(float(v) >= 0.95 for v in fill)


def nearby_labels(page: pymupdf.Page) -> list[tuple[str, pymupdf.Point]]:
    labels = []
    for word in page.get_text("words"):
        text = str(word[4]).strip().upper()
        if text in "ABCDEFGH" and len(text) == 1:
            labels.append((text, pymupdf.Point((word[0] + word[2]) / 2, (word[1] + word[3]) / 2)))
    return labels


def nearest_label(labels: list[tuple[str, pymupdf.Point]], box: pymupdf.Rect) -> tuple[str, float]:
    center = pymupdf.Point((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)
    candidates = [(text, center.distance_to(point)) for text, point in labels]
    return min(candidates, key=lambda item: item[1]) if candidates else ("", math.inf)


def sample_background(image: Image.Image, page: pymupdf.Page, box: pymupdf.Rect) -> tuple[float, float, float]:
    sx = image.width / page.rect.width
    sy = image.height / page.rect.height
    ix0, iy0, ix1, iy1 = SAMPLE_INSET
    rect = (
        round((box.x0 + ix0) * sx),
        round((box.y0 + iy0) * sy),
        round((box.x0 + ix1) * sx),
        round((box.y0 + iy1) * sy),
    )
    pixels = list(image.crop(rect).convert("RGB").getdata())
    if not pixels:
        return (0.0, 0.0, 0.0)
    channels = tuple(sorted(px[channel] for px in pixels) for channel in range(3))
    middle = len(pixels) // 2
    return tuple(float(channel[middle]) for channel in channels)  # type: ignore[return-value]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--out", type=Path, default=ROOT / "tmp/component-audit/alphabet-marker-background-fills.csv")
    args = parser.parse_args()
    rows = []
    with pymupdf.open(args.pdf) as document:
        for page_number, page in enumerate(document, start=1):
            background_path = PAGE_DIR / f"page_{page_number:03d}" / "background.webp"
            if not background_path.is_file():
                continue
            background = Image.open(background_path).convert("RGB")
            labels = nearby_labels(page)
            for drawing in page.get_drawings():
                box = drawing.get("rect")
                if box is None or not is_white(drawing.get("fill")):
                    continue
                if not (8 <= box.width <= 30 and 8 <= box.height <= 30):
                    continue
                if box.x0 < 0 or box.y0 < 0 or box.x1 > page.rect.width or box.y1 > page.rect.height:
                    continue
                label, gap = nearest_label(labels, box)
                if not label or gap > 18:
                    continue
                median = sample_background(background, page, box)
                healthy = all(value >= 232 for value in median)
                rows.append({
                    "page": page_number,
                    "label": label,
                    "box": ",".join(f"{value:.3f}" for value in box),
                    "labelCenterGapPt": round(gap, 3),
                    "safeInteriorMedianRgb": ",".join(str(round(value, 1)) for value in median),
                    "whiteFillPreserved": healthy,
                })

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else ["page", "label", "box"])
        writer.writeheader()
        writer.writerows(rows)
    failures = [row for row in rows if not row["whiteFillPreserved"]]
    summary = {
        "pairedWhiteBoxes": len(rows),
        "backgroundFillFailures": len(failures),
        "affectedPages": sorted({row["page"] for row in failures}),
    }
    print(json.dumps(summary, indent=2))
    for row in failures:
        print(f"p{row['page']:03d} {row['label']} box={row['box']} median={row['safeInteriorMedianRgb']}")
    print(f"CSV: {args.out.resolve()}")


if __name__ == "__main__":
    main()
