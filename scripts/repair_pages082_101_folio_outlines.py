"""Restore exact dark-fill/gold-stroke folio paint on p.82–101.

Each affected source PDF folio contains a gold type-1 stroke pass followed by a
dark type-0 fill pass. The page DOM stores both passes as text spans, but the
browser previously filled both and covered the gold outline. This guarded
repair recognizes only the printed folio, validates operation counts against
the PDF, preserves duplicate source draws, and maps the fill/outline roles to
the renderer's stroke properties.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
FIRST_PAGE = 82
LAST_PAGE = 101
AUDIT_ID = "2026-10-04-p082-101-folio-outline-v1"
GOLD = "#fff574"
DARK = "#231f20"
FONT = "OptimaLTStd-ExtraBlack"
STROKE_WIDTH = 1.5
GOLD_SOURCE_RGB = (1.0, 0.9612878561, 0.4567483068)
DARK_SOURCE_RGB = (0.1366903186, 0.1219501048, 0.1252918243)


def close_bbox(left: list[float], right: list[float], tolerance: float = 0.03) -> bool:
    return len(left) == len(right) == 4 and all(
        abs(float(a) - float(b)) <= tolerance for a, b in zip(left, right)
    )


def same_rgb(actual: tuple[float, ...], expected: tuple[float, ...]) -> bool:
    return len(actual) == 3 and all(abs(a - b) <= 0.002 for a, b in zip(actual, expected))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the verified stroke/fill mapping to p.82–101 DOM files")
    parser.add_argument("--pdf", type=Path, default=PDF)
    args = parser.parse_args()
    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)

    validated: list[tuple[int, Path, dict, list[dict], list[dict]]] = []
    with pymupdf.open(args.pdf) as document:
        for page_number in range(FIRST_PAGE, LAST_PAGE + 1):
            path = ROOT / f"apps/web/public/pages/page_{page_number:03d}/page_{page_number:03d}_dom.json"
            dom = json.loads(path.read_text(encoding="utf-8"))
            if dom.get("page_number") != page_number:
                raise SystemExit(f"p.{page_number}: DOM page number mismatch")

            gold_spans: list[dict] = []
            dark_spans: list[dict] = []
            for block in dom.get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        bbox = span.get("bbox", [])
                        if (
                            span.get("text") == str(page_number)
                            and span.get("font") == FONT
                            and len(bbox) == 4
                            and float(bbox[1]) >= 770
                        ):
                            color = span.get("color", "").lower()
                            if color == GOLD:
                                gold_spans.append(span)
                            elif color == DARK:
                                dark_spans.append(span)

            if not gold_spans or len(gold_spans) != len(dark_spans):
                raise SystemExit(f"p.{page_number}: no balanced, uniquely styled folio span pairs")
            gold_boxes = sorted(tuple(round(float(value), 2) for value in span["bbox"]) for span in gold_spans)
            dark_boxes = sorted(tuple(round(float(value), 2) for value in span["bbox"]) for span in dark_spans)
            if gold_boxes != dark_boxes:
                raise SystemExit(f"p.{page_number}: source outline/fill bboxes differ")

            traces = []
            for trace in document[page_number - 1].get_texttrace():
                text = "".join(chr(char[0]) for char in trace.get("chars", []))
                bbox = trace.get("bbox", (0, 0, 0, 0))
                if text == str(page_number) and trace.get("font") == FONT and bbox[1] >= 760:
                    traces.append(trace)
            stroke_traces = [trace for trace in traces if trace.get("type") == 1]
            fill_traces = [trace for trace in traces if trace.get("type") == 0]
            if len(stroke_traces) != len(gold_spans) or len(fill_traces) != len(dark_spans):
                raise SystemExit(
                    f"p.{page_number}: DOM has {len(gold_spans)} outline/{len(dark_spans)} fill passes; "
                    f"PDF has {len(stroke_traces)} outline/{len(fill_traces)} fill passes"
                )
            if len(gold_spans) not in (1, 2):
                raise SystemExit(f"p.{page_number}: unexpected folio source draw count {len(gold_spans)}")
            if any(trace.get("linewidth") != STROKE_WIDTH or not same_rgb(trace.get("color", ()), GOLD_SOURCE_RGB) for trace in stroke_traces):
                raise SystemExit(f"p.{page_number}: source outline color or width changed")
            if any(not same_rgb(trace.get("color", ()), DARK_SOURCE_RGB) for trace in fill_traces):
                raise SystemExit(f"p.{page_number}: source fill color changed")

            validated.append((page_number, path, dom, gold_spans, dark_spans))

    for page_number, path, dom, gold_spans, dark_spans in validated:
        changed = False
        for span in gold_spans:
            if not span.get("renderOnlyStrokePass") or span.get("sourcePaintRole") != "stroke-only":
                changed = True
            span["renderOnlyStrokePass"] = True
            span["sourcePaintRole"] = "stroke-only"
            span["sourcePaintAuditId"] = AUDIT_ID
        for span in dark_spans:
            if span.get("renderTextStrokeWidthPt") != STROKE_WIDTH or span.get("renderTextStrokeColor") != GOLD:
                changed = True
            span["renderTextStrokeWidthPt"] = STROKE_WIDTH
            span["renderTextStrokeColor"] = GOLD
            span["sourcePaintRole"] = "fill-with-source-stroke"
            span["sourcePaintAuditId"] = AUDIT_ID
        if changed:
            print(f"p.{page_number}: verified {len(gold_spans)} source outline/fill pair(s)")
            if args.apply:
                path.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"Validated p.{FIRST_PAGE}–{LAST_PAGE} folios against source type-1/type-0 paint operators; "
        + ("changes applied" if args.apply else "dry run only")
    )


if __name__ == "__main__":
    main()
