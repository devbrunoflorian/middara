"""Normalize rendered line boxes when a large inline glyph distorts the line.

PyMuPDF's line bbox is the union of every glyph, so an oversized symbol or
callout character can expand the line vertically. The browser then positions
ordinary body text from that expanded top edge and collides it with adjacent
lines. This script keeps the source spans untouched and narrows only the
rendering bbox to the dominant text-size spans when the union is a clear
outlier. It is diagnostic by default; pass --apply to update page DOM JSON.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "apps/web/public/pages"


def usable_spans(line: dict) -> list[dict]:
    return [
        span for span in line.get("spans", [])
        if str(span.get("text", "")).strip()
        and float(span.get("size", 0)) >= 4
        and not any(kind in str(span.get("font", "")).lower() for kind in ("dingbat", "webding", "wingding"))
    ]


def dominant_text_box(line: dict) -> tuple[float, list[float], int] | None:
    spans = usable_spans(line)
    if not spans:
        return None
    weights = Counter()
    for span in spans:
        weights[round(float(span["size"]), 1)] += len(str(span["text"]).strip())
    size = max(weights, key=lambda candidate: (weights[candidate], candidate))
    dominant = [span for span in spans if abs(float(span["size"]) - size) < 0.2]
    text_length = sum(len(str(span["text"]).strip()) for span in dominant)
    if not dominant:
        return None
    bbox = [
        min(float(span["bbox"][0]) for span in dominant),
        min(float(span["bbox"][1]) for span in dominant),
        max(float(span["bbox"][2]) for span in dominant),
        max(float(span["bbox"][3]) for span in dominant),
    ]
    return size, bbox, text_length


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pages", help="comma-separated 1-based pages; defaults to all available pages")
    parser.add_argument("--apply", action="store_true", help="update line bbox y-coordinates in page DOM JSON")
    parser.add_argument("--out", type=Path, default=ROOT / "tmp/component-audit/mixed-font-line-geometry.csv")
    args = parser.parse_args()
    selected = {int(value) for value in args.pages.split(",")} if args.pages else None
    rows: list[dict[str, object]] = []
    for page_number in range(1, 103):
        if selected is not None and page_number not in selected:
            continue
        path = PAGES / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        if not path.is_file():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        page_changed = False
        for block in data.get("blocks", []):
            for line in block.get("lines", []):
                if line.get("rasterizedDuplicate"):
                    continue
                current = line.get("bbox")
                candidate = dominant_text_box(line)
                if not isinstance(current, list) or len(current) != 4 or candidate is None:
                    continue
                size, text_box, text_length = candidate
                # Short labels and symbols retain their original full geometry.
                if size < 6 or text_length < 8:
                    continue
                top_delta = text_box[1] - float(current[1])
                bottom_delta = float(current[3]) - text_box[3]
                if max(top_delta, bottom_delta) <= 2.25:
                    continue
                rows.append({
                    "page": page_number,
                    "block": block.get("id", ""),
                    "line": line.get("id", ""),
                    "dominantSizePt": size,
                    "dominantTextChars": text_length,
                    "oldY": f"{float(current[1]):.3f},{float(current[3]):.3f}",
                    "newY": f"{text_box[1]:.3f},{text_box[3]:.3f}",
                    "trimTopPt": round(top_delta, 3),
                    "trimBottomPt": round(bottom_delta, 3),
                    "text": "".join(str(span.get("text", "")) for span in usable_spans(line) if abs(float(span.get("size", 0)) - size) < 0.2).strip()[:140],
                })
                if args.apply:
                    current[1] = text_box[1]
                    current[3] = text_box[3]
                    page_changed = True
        if args.apply and page_changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8-sig") as stream:
        fields = list(rows[0]) if rows else ["page", "block", "line"]
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"candidateLines={len(rows)} applied={args.apply} pages={sorted({int(row['page']) for row in rows})}")
    for row in rows:
        print(f"p{int(row['page']):03} {row['line']} y={row['oldY']} -> {row['newY']} trim={row['trimTopPt']},{row['trimBottomPt']} text={row['text']}")
    print(f"CSV: {args.out.resolve()}")


if __name__ == "__main__":
    main()
