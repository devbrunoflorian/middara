"""Reconstruct the yellow outline on the printed page-20 folio."""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = Path(
    r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
)
DOM_PATH = ROOT / "apps/web/public/pages/page_020/page_020_dom.json"
PAGE_INDEX = 19
BLOCK_ID = "block_1601"
STROKE_LINE_ID = "line_1601_0"
FILL_LINE_ID = "line_1601_1"
EXPECTED_BBOX = (49.3425, 775.7185, 61.2025, 787.9785)
EXPECTED_TRACE_BBOX = (49.3425, 777.49, 61.2025, 787.49)
STROKE_COLOR = (1.0, 0.9612878561, 0.4567483068)
FILL_COLOR = (0.1366903186, 0.1219501048, 0.1252918243)
STROKE_HEX = "#fff574"


def close_bbox(actual: tuple[float, ...], expected: tuple[float, ...]) -> bool:
    return len(actual) == 4 and all(
        abs(left - right) <= 0.03 for left, right in zip(actual, expected)
    )


def source_folio_passes() -> tuple[dict, dict]:
    if not PDF_PATH.is_file():
        raise FileNotFoundError(f"Source PDF not found: {PDF_PATH}")

    page = pymupdf.open(PDF_PATH)[PAGE_INDEX]
    passes = []
    for span in page.get_texttrace():
        text = "".join(chr(char[0]) for char in span.get("chars", []))
        if text.strip() != "20" or not close_bbox(
            span.get("bbox", ()), EXPECTED_TRACE_BBOX
        ):
            continue
        passes.append(span)

    stroke = [span for span in passes if span.get("type") == 1]
    fill = [span for span in passes if span.get("type") == 0]
    if len(stroke) != 1 or len(fill) != 1:
        raise ValueError(
            f"Expected one source stroke and fill pass for the folio; found "
            f"{len(stroke)} and {len(fill)}"
        )
    if stroke[0].get("linewidth") is None or abs(stroke[0]["linewidth"] - 1.5) > 0.01:
        raise ValueError(f"Unexpected source outline width: {stroke[0].get('linewidth')}")
    for actual, expected in zip(stroke[0].get("color", ()), STROKE_COLOR):
        if abs(actual - expected) > 0.005:
            raise ValueError(f"Unexpected source outline color: {stroke[0].get('color')}")
    for actual, expected in zip(fill[0].get("color", ()), FILL_COLOR):
        if abs(actual - expected) > 0.005:
            raise ValueError(f"Unexpected source fill color: {fill[0].get('color')}")
    return stroke[0], fill[0]


def main() -> None:
    stroke_source, fill_source = source_folio_passes()
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    block = next((item for item in data.get("blocks", []) if item.get("id") == BLOCK_ID), None)
    if block is None or not close_bbox(tuple(block.get("bbox", ())), EXPECTED_BBOX):
        raise ValueError("Page-20 folio block changed; refusing to patch")

    lines = {line.get("id"): line for line in block.get("lines", [])}
    stroke_line = lines.get(STROKE_LINE_ID)
    fill_line = lines.get(FILL_LINE_ID)
    if stroke_line is None or fill_line is None:
        raise ValueError("Expected both extracted folio passes")

    for line_id, line, expected_color in (
        (STROKE_LINE_ID, stroke_line, STROKE_HEX),
        (FILL_LINE_ID, fill_line, "#231f20"),
    ):
        spans = line.get("spans", [])
        if (
            not close_bbox(tuple(line.get("bbox", ())), EXPECTED_BBOX)
            or len(spans) != 1
            or spans[0].get("text") != "20"
            or spans[0].get("font") != "OptimaLTStd-ExtraBlack"
            or spans[0].get("color", "").lower() != expected_color
            or abs(spans[0].get("size", 0) - 10.0) > 0.02
        ):
            raise ValueError(f"Unexpected extracted content in {line_id}")

    stroke_span = stroke_line["spans"][0]
    fill_span = fill_line["spans"][0]
    stroke_span["renderOnlyStrokePass"] = True
    fill_span["renderTextStrokeWidthPt"] = 1.5
    fill_span["renderTextStrokeColor"] = STROKE_HEX

    DOM_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        "Page 20 folio: source trace validated (stroke seq "
        f"{stroke_source['seqno']}, fill seq {fill_source['seqno']}); "
        "mapped the 1.5 pt yellow stroke onto the dark fill"
    )


if __name__ == "__main__":
    main()
