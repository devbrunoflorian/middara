"""Find source spans painted at coincident bboxes across the 102 page JSONs.

This is a read-only screening tool for overprint/outline layers and duplicate
text candidates. Coincident spans can be intentional visual styling; the CSV
never classifies or suppresses them.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JSON_DIR = ROOT / "apps/web/public/pages"
DEFAULT_OUTPUT = ROOT / "tmp/ghost-audit/coincident-text-passes.csv"


def bbox_key(bbox: list[float]) -> tuple[float, float, float, float]:
    return tuple(round(float(value), 2) for value in bbox)  # type: ignore[return-value]


def scan_page(path: Path, page_number: int) -> list[dict[str, str | int]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    spans_by_bbox: dict[tuple[float, float, float, float], list[dict]] = defaultdict(list)
    for block in data.get("blocks", []):
        for line in block.get("lines", []):
            for span_index, span in enumerate(line.get("spans", [])):
                bbox = span.get("bbox")
                if not bbox or len(bbox) != 4:
                    continue
                entry = {
                    "blockId": block.get("id", ""),
                    "lineId": line.get("id", ""),
                    "spanIndex": span_index,
                    "text": str(span.get("text", "")),
                    "font": str(span.get("font", "")),
                    "size": span.get("size", ""),
                    "flags": span.get("flags", ""),
                    "color": str(span.get("color", "")),
                }
                spans_by_bbox[bbox_key(bbox)].append(entry)

    rows = []
    for bbox, spans in spans_by_bbox.items():
        if len(spans) < 2:
            continue
        texts = [item["text"] for item in spans]
        same_text = len(set(texts)) == 1
        rows.append({
            "page": page_number,
            "bbox": ",".join(f"{value:.2f}" for value in bbox),
            "spanCount": len(spans),
            "sameText": str(same_text).lower(),
            "texts": " | ".join(texts),
            "colors": " | ".join(item["color"] for item in spans),
            "fonts": " | ".join(item["font"] for item in spans),
            "sizes": " | ".join(str(item["size"]) for item in spans),
            "flags": " | ".join(str(item["flags"]) for item in spans),
            "locations": " | ".join(
                f"{item['blockId']}/{item['lineId']}/span{item['spanIndex']}" for item in spans
            ),
            "reviewStatus": "review-required",
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-dir", type=Path, default=DEFAULT_JSON_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--pages", help="Optional comma-separated 1-based page numbers")
    args = parser.parse_args()

    selected = {int(value) for value in args.pages.split(",")} if args.pages else None
    rows: list[dict[str, str | int]] = []
    missing = []
    for page_number in range(1, 103):
        if selected is not None and page_number not in selected:
            continue
        page_dir = args.json_dir / f"page_{page_number:03d}"
        path = page_dir / f"page_{page_number:03d}_dom.json"
        if not path.is_file():
            missing.append(page_number)
            continue
        rows.extend(scan_page(path, page_number))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "page", "bbox", "spanCount", "sameText", "texts", "colors", "fonts", "sizes",
        "flags", "locations", "reviewStatus",
    ]
    with args.out.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    pages_with_hits = len({row["page"] for row in rows})
    print(f"Coincident-bbox groups: {len(rows)} across {pages_with_hits} pages")
    if missing:
        print(f"Missing page JSONs: {missing}")
    print(f"Report: {args.out.resolve()}")


if __name__ == "__main__":
    main()
