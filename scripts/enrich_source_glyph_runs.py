"""Record exact PDF text-trace fragments when extraction merges baselines.

This keeps one editorial span/ID while allowing the source renderer to paint
each PDF glyph run at its own baseline. Coordinates are read directly from the
reference PDF; ambiguous mappings abort instead of guessing.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps/web/public/pages"
PDF_PATH = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")


def span_key(span: dict) -> tuple:
    return (
        span.get("text", ""),
        span.get("font", ""),
        round(float(span.get("size", 0.0)), 2),
        tuple(round(float(value), 2) for value in span.get("bbox", [])),
    )


def trace_runs(pdf_page, source_span: dict) -> list[dict] | None:
    text = source_span.get("text", "")
    bbox = source_span.get("bbox", [])
    if not text or len(bbox) != 4:
        return None
    x0, y0, x1, y1 = map(float, bbox)
    candidates = []
    for trace in pdf_page.get_texttrace():
        chars = trace.get("chars", [])
        if not chars or trace.get("font") != source_span.get("font"):
            continue
        if abs(float(trace.get("size", 0)) - float(source_span.get("size", 0))) > 0.05:
            continue
        run_text = "".join(chr(char[0]) for char in chars)
        start_x, baseline_y = map(float, chars[0][2])
        if start_x < x0 - 0.2 or start_x > x1 + 0.2 or not (y0 - 2 <= baseline_y <= y1 + 2):
            continue
        if run_text not in text:
            continue
        end_x = max(float(char[3][2]) for char in chars)
        candidates.append({"text": run_text, "x": start_x, "y": baseline_y, "endX": end_x,
            "seq": int(trace.get("seqno", 0))})

    # PDF text traces are ordered in paint sequence; x-sort reconstructs the
    # single extracted span when its source fragments are horizontally adjacent.
    candidates.sort(key=lambda run: (run["x"], run["seq"]))
    chosen = []
    cursor = 0
    for run in candidates:
        if text[cursor:cursor + len(run["text"])] != run["text"]:
            continue
        chosen.append(run)
        cursor += len(run["text"])
        if cursor == len(text):
            break
    if cursor != len(text) or len(chosen) < 2:
        return None
    if len({round(run["y"], 3) for run in chosen}) < 2:
        return None
    for current, following in zip(chosen, chosen[1:]):
        if abs(current["endX"] - following["x"]) > 0.2:
            raise ValueError(f"Non-contiguous source traces in span {text!r}")

    result = []
    cursor = 0
    for index, run in enumerate(chosen):
        end = cursor + len(run["text"])
        next_x = chosen[index + 1]["x"] if index + 1 < len(chosen) else x1
        result.append({
            "start": cursor,
            "end": end,
            "origin": [run["x"], run["y"]],
            "advance": max(0.0, next_x - run["x"]),
        })
        cursor = end
    return result


def enrich_page(document, page_number: int, apply: bool) -> dict:
    page_dir = PAGE_ROOT / f"page_{page_number:03d}"
    dom_path = page_dir / f"page_{page_number:03d}_dom.json"
    compound_path = page_dir / "compound_elements.json"
    dom = json.loads(dom_path.read_text(encoding="utf-8"))
    compounds = json.loads(compound_path.read_text(encoding="utf-8")).get("elements", [])
    compound_blocks = {element["anchor"]["blockId"] for element in compounds}
    pdf_page = document[page_number - 1]
    dictionary_spans = {}
    for block in pdf_page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                dictionary_spans.setdefault(span_key(span), []).append(span)

    additions = []
    for block in dom.get("blocks", []):
        if block.get("id") not in compound_blocks:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                matches = dictionary_spans.get(span_key(span), [])
                if len(matches) != 1:
                    raise ValueError(f"p.{page_number} {block['id']}/{line.get('id')}: ambiguous span map")
                runs = trace_runs(pdf_page, matches[0])
                if runs is None:
                    continue
                current = span.get("sourceGlyphRuns")
                if current is not None and current != runs:
                    raise ValueError(f"p.{page_number} {block['id']}/{line.get('id')}: stored glyph runs differ from PDF")
                if current is None:
                    span["sourceGlyphRuns"] = runs
                    additions.append({"block": block["id"], "line": line.get("id"), "text": span.get("text"), "runs": runs})

    if apply and additions:
        dom_path.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"page": page_number, "multiBaselineSpans": additions if not apply else len(additions)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--page", type=int, action="append", help="Restrict to a page; repeatable.")
    parser.add_argument("--apply", action="store_true", help="Write exact source glyph runs to page DOM JSON.")
    args = parser.parse_args()
    pages = sorted(set(args.page)) if args.page else sorted(
        int(path.parent.name[-3:]) for path in PAGE_ROOT.glob("page_*/compound_elements.json")
        if json.loads(path.read_text(encoding="utf-8")).get("elements")
    )
    with pymupdf.open(PDF_PATH) as document:
        report = [enrich_page(document, page, args.apply) for page in pages]
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "pages": report}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
