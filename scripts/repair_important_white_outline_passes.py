"""Reconstruct the PDF's white outline on red IMPORTANT labels.

The source PDF paints the same label twice: a white 2pt stroke pass, then a
red fill pass. The stroke pass is visual only; keeping it as a second editable
word causes the browser to paint a solid white duplicate. This script changes
only pairs whose page, text, font, size, horizontal ink bounds, colors, and
source-PDF paint traces all match.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "apps/web/public/pages"
DEFAULT_PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")


@dataclass(frozen=True)
class Pair:
    page: int
    block_id: str
    stroke_line_id: str
    stroke_span_index: int
    fill_line_id: str
    fill_span_index: int
    text: str
    bbox: tuple[float, float, float, float]
    size: float
    stroke_span: dict
    fill_span: dict
    block: dict


def pdf_trace_text(trace: dict) -> str:
    return "".join(chr(char[0]) for char in trace.get("chars", [])).rstrip()


def is_white(color: str | None) -> bool:
    return (color or "").lower() in ("#ffffff", "#fff", "white")


def is_source_red(color: tuple[float, float, float]) -> bool:
    return all(abs(actual - expected) <= 0.035 for actual, expected in zip(color, (185 / 255, 29 / 255, 35 / 255)))


def collect_candidates(document: pymupdf.Document) -> tuple[list[Pair], list[tuple[int, str, str, str]]]:
    candidates: list[Pair] = []
    rejected: list[tuple[int, str, str, str]] = []

    for page_number in range(1, len(document) + 1):
        dom_path = PAGES / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        if not dom_path.is_file():
            continue
        data = json.loads(dom_path.read_text(encoding="utf-8"))
        if data.get("page_number") != page_number:
            raise SystemExit(f"Page-number mismatch in {dom_path}")

        traces = document[page_number - 1].get_texttrace()
        label_traces = [trace for trace in traces if pdf_trace_text(trace) == "IMPORTANT:"]

        for block in data.get("blocks", []):
            lines = block.get("lines", [])
            for stroke_line, fill_line in zip(lines, lines[1:]):
                white_spans = [
                    (index, span)
                    for index, span in enumerate(stroke_line.get("spans", []))
                    if span.get("text", "").strip() == "IMPORTANT:"
                    and is_white(span.get("color"))
                    and span.get("font", "").startswith("OptimaLTStd-Black")
                ]
                red_spans = [
                    (index, span)
                    for index, span in enumerate(fill_line.get("spans", []))
                    if span.get("text", "").strip() == "IMPORTANT:"
                    and (span.get("color") or "").lower() == "#b91d23"
                    and span.get("font", "").startswith("OptimaLTStd-Black")
                ]

                for stroke_index, stroke_span in white_spans:
                    for fill_index, fill_span in red_spans:
                        if abs(stroke_span.get("size", 0) - fill_span.get("size", 0)) > 0.05:
                            continue
                        if max(abs(stroke_span["bbox"][axis] - fill_span["bbox"][axis]) for axis in (0, 2)) > 0.05:
                            continue

                        source_fills = [
                            trace for trace in label_traces
                            if trace.get("type") == 0
                            and is_source_red(trace.get("color", (0, 0, 0)))
                            and trace.get("font", "").startswith("OptimaLTStd-Black")
                            and abs(trace.get("size", 0) - fill_span["size"]) <= 0.05
                            and abs(trace["bbox"][0] - fill_span["bbox"][0]) <= 0.1
                            and abs(trace["bbox"][2] - fill_span["bbox"][2]) <= 0.1
                            and abs(trace["bbox"][1] - fill_span["bbox"][1]) <= 2.0
                            and abs(trace["bbox"][3] - fill_span["bbox"][3]) <= 2.0
                        ]
                        source_strokes = [
                            trace for trace in label_traces
                            if trace.get("type") == 1
                            and trace.get("linewidth") is not None
                            and abs(trace["linewidth"] - 2.0) <= 0.05
                            and all(value >= 0.99 for value in trace.get("color", (0, 0, 0)))
                            and trace.get("font", "").startswith("OptimaLTStd-Black")
                            and abs(trace.get("size", 0) - stroke_span["size"]) <= 0.05
                            and abs(trace["bbox"][0] - stroke_span["bbox"][0]) <= 0.1
                            and abs(trace["bbox"][2] - stroke_span["bbox"][2]) <= 0.1
                            and abs(trace["bbox"][1] - stroke_span["bbox"][1]) <= 2.0
                            and abs(trace["bbox"][3] - stroke_span["bbox"][3]) <= 2.0
                        ]
                        if not source_fills or not source_strokes:
                            rejected.append((page_number, block["id"], stroke_line["id"], fill_line["id"]))
                            continue

                        candidates.append(Pair(
                            page=page_number,
                            block_id=block["id"],
                            stroke_line_id=stroke_line["id"],
                            stroke_span_index=stroke_index,
                            fill_line_id=fill_line["id"],
                            fill_span_index=fill_index,
                            text=fill_span["text"],
                            bbox=tuple(fill_span["bbox"]),
                            size=fill_span["size"],
                            stroke_span=stroke_span,
                            fill_span=fill_span,
                            block=block,
                        ))

    return candidates, rejected


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--apply", action="store_true", help="write only source-confirmed paint-pair fixes")
    args = parser.parse_args()
    if not args.pdf.is_file():
        raise SystemExit(f"Reference PDF not found: {args.pdf}")

    with pymupdf.open(args.pdf) as document:
        candidates, rejected = collect_candidates(document)

    print(f"Source-confirmed IMPORTANT paint pairs: {len(candidates)}")
    print(f"Pages: {', '.join(map(str, sorted({pair.page for pair in candidates})))}")
    print(f"Unmatched white/red DOM candidates left untouched: {len(rejected)}")
    for pair in candidates:
        print(f"  p.{pair.page} {pair.block_id} {pair.stroke_line_id}:{pair.stroke_span_index} -> {pair.fill_line_id}:{pair.fill_span_index} ({pair.size:g}pt)")
    if not args.apply:
        return

    changed_pages: set[int] = set()
    stroke_refs_by_block: dict[tuple[int, str], set[str]] = {}
    for pair in candidates:
        if pair.stroke_span.get("renderOnlyStrokePass") is not True:
            pair.stroke_span["renderOnlyStrokePass"] = True
            changed_pages.add(pair.page)
        if pair.fill_span.get("renderTextStrokeWidthPt") != 2.0 or pair.fill_span.get("renderTextStrokeColor") != "#ffffff":
            pair.fill_span["renderTextStrokeWidthPt"] = 2.0
            pair.fill_span["renderTextStrokeColor"] = "#ffffff"
            changed_pages.add(pair.page)
        stroke_refs_by_block.setdefault((pair.page, pair.block_id), set()).add(
            f"{pair.stroke_line_id}:{pair.stroke_span_index}"
        )

    for (page_number, block_id), stroke_refs in stroke_refs_by_block.items():
        block = next(pair.block for pair in candidates if pair.page == page_number and pair.block_id == block_id)
        kept_units = []
        for unit in block.get("typographicSpanUnits", []):
            remaining = [ref for ref in unit.get("spanRefs", []) if ref not in stroke_refs]
            if remaining:
                unit["spanRefs"] = remaining
                kept_units.append(unit)
            else:
                changed_pages.add(page_number)
        if len(kept_units) != len(block.get("typographicSpanUnits", [])) or any(
            any(ref in stroke_refs for ref in unit.get("spanRefs", []))
            for unit in kept_units
        ):
            block["typographicSpanUnits"] = kept_units

    for page_number in sorted(changed_pages):
        dom_path = PAGES / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        data = json.loads(dom_path.read_text(encoding="utf-8"))
        for pair in (candidate for candidate in candidates if candidate.page == page_number):
            block = next(item for item in data["blocks"] if item["id"] == pair.block_id)
            stroke_line = next(line for line in block["lines"] if line["id"] == pair.stroke_line_id)
            fill_line = next(line for line in block["lines"] if line["id"] == pair.fill_line_id)
            stroke_line["spans"][pair.stroke_span_index]["renderOnlyStrokePass"] = True
            fill = fill_line["spans"][pair.fill_span_index]
            fill["renderTextStrokeWidthPt"] = 2.0
            fill["renderTextStrokeColor"] = "#ffffff"
            refs = stroke_refs_by_block.get((page_number, pair.block_id), set())
            units = []
            for unit in block.get("typographicSpanUnits", []):
                kept_refs = [ref for ref in unit.get("spanRefs", []) if ref not in refs]
                if kept_refs:
                    unit["spanRefs"] = kept_refs
                    units.append(unit)
            block["typographicSpanUnits"] = units
        dom_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Updated {len(changed_pages)} page DOMs; only the duplicate white label pass is visual-only.")


if __name__ == "__main__":
    main()
