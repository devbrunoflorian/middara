"""Link dice to count+color labels while preserving their source positions.

This audit targets two distinct editor structures:

* ``same-line-count-color``: one bold span contains ``N COLOR `` and the die
  follows it on the same source baseline; anchor after that span.
* ``wrapped-count-color``: the bold ``N COLOR `` span ends a line and its die
  appears at the beginning of the next line before the next text; retain that
  visual anchor and set only the semantic owner reference to the prior span.

Only existing semantic dice sidecars with a validated four-path source drawing
are eligible. Dry-run is the default; ``--apply`` writes only these anchor
references and leaves source geometry, metrics, drawings, and masks untouched.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "apps/web/public/pages"
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
LABEL = re.compile(r"^\s*(\d+)\s+(BLACK|WHITE|PURPLE|ORANGE|GREEN|TEAL|BLUE|RED|GREY|GRAY)\s+$", re.I)
GEOMETRY_TOLERANCE_PT = 0.05
GAP_TOLERANCE_PT = 1.5


def pdf_text_spans(page: fitz.Page) -> list[dict]:
    return [span for block in page.get_text("dict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)["blocks"]
        for line in block.get("lines", []) for span in line["spans"]]


def map_source_span(dom: dict, source_span: dict) -> tuple[int, dict, dict, int, dict]:
    matches = []
    for block_index, block in enumerate(dom["blocks"]):
        for line in block["lines"]:
            for span_index, span in enumerate(line["spans"]):
                if span.get("text") != source_span["text"] or span.get("font") != source_span["font"]:
                    continue
                bbox = span.get("bbox", [])
                if len(bbox) != 4:
                    continue
                delta = max(abs(float(a) - float(b)) for a, b in zip(bbox, source_span["bbox"]))
                if delta <= GEOMETRY_TOLERANCE_PT:
                    matches.append((delta, block_index, block, line, span_index, span))
    if len(matches) != 1:
        raise ValueError(f"Source span did not map uniquely: {source_span['text']!r} {source_span['bbox']}")
    _, block_index, block, line, span_index, span = matches[0]
    return block_index, block, line, span_index, span


def source_drawings_match(element: dict, drawings: list[dict]) -> bool:
    indices = element.get("drawingIndices", [])
    bbox = element.get("bbox", [])
    if len(indices) != 4 or len(bbox) != 4:
        return False
    rect = fitz.Rect(bbox) + (-0.02, -0.02, 0.02, 0.02)
    return all(0 <= index < len(drawings) and rect.contains(drawings[index]["rect"]) for index in indices)


def discover(source: fitz.Document) -> tuple[list[dict], dict[str, int]]:
    matches: list[dict] = []
    summary = {
        "dice": 0,
        "already_linked": 0,
        "same_line_count_color": 0,
        "wrapped_count_color": 0,
        "unmatched_unowned": 0,
    }

    for sidecar_path in sorted(PAGES.glob("page_*/inline_elements.json")):
        page_match = re.fullmatch(r"page_(\d{3})", sidecar_path.parent.name)
        if not page_match:
            continue
        page_number = int(page_match.group(1))
        dom_path = sidecar_path.parent / f"page_{page_number:03d}_dom.json"
        if not dom_path.is_file() or page_number > len(source):
            continue
        sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
        dom = json.loads(dom_path.read_text(encoding="utf-8"))
        page = source[page_number - 1]
        spans = pdf_text_spans(page)
        drawings = page.get_drawings()

        for element in sidecar.get("elements", []):
            symbol_id = element.get("symbolId", "")
            if not symbol_id.startswith("dice."):
                continue
            summary["dice"] += 1
            anchor = element.get("anchor", {})
            if anchor.get("ownerSpanRef"):
                summary["already_linked"] += 1
                continue
            metrics = element.get("metrics", {})
            size = anchor.get("sizePt")
            bbox = element.get("bbox", [])
            if len(bbox) != 4 or not size or "verticalAlignEm" not in metrics or not source_drawings_match(element, drawings):
                summary["unmatched_unowned"] += 1
                continue

            baseline = bbox[3] - metrics["verticalAlignEm"] * size
            expected_color = symbol_id.removeprefix("dice.").upper()
            eligible = []
            for span in spans:
                if span.get("font") != "OptimaLTStd-Bold":
                    continue
                parsed = LABEL.fullmatch(span.get("text", ""))
                if not parsed or parsed.group(2).upper() != expected_color:
                    continue
                _, block, line, span_index, dom_span = map_source_span(dom, span)
                gap = bbox[0] - span["bbox"][2]
                delta_y = baseline - span["origin"][1]
                if 0 <= gap <= GAP_TOLERANCE_PT and abs(delta_y) <= GEOMETRY_TOLERANCE_PT:
                    eligible.append({"family": "same-line-count-color", "span": span, "block": block,
                        "blockIndex": next(i for i, item in enumerate(dom["blocks"]) if item["id"] == block["id"]),
                        "line": line, "spanIndex": span_index, "domSpan": dom_span, "gap": gap})

            if len(eligible) == 1:
                owner = eligible[0]
                if abs(owner["span"]["bbox"][2] - bbox[0]) > GAP_TOLERANCE_PT:
                    continue
                new_anchor = dict(anchor)
                new_anchor.update({
                    "blockId": owner["block"]["id"],
                    "blockIndex": owner["blockIndex"],
                    "lineId": owner["line"]["id"],
                    "spanIndex": owner["spanIndex"],
                    "side": "after",
                    "sizePt": size,
                    "gapPt": round(owner["gap"], 6),
                    "ownerSpanRef": {"lineId": owner["line"]["id"], "spanIndex": owner["spanIndex"]},
                })
                matches.append({"page": page_number, "family": owner["family"], "symbolId": symbol_id,
                    "ownerText": owner["domSpan"]["text"], "lineId": owner["line"]["id"],
                    "spanIndex": owner["spanIndex"], "previousAnchor": anchor, "anchor": new_anchor,
                    "sidecar": sidecar, "path": sidecar_path, "element": element})
                summary["same_line_count_color"] += 1
                continue

            # A wrapped die stays before the next-line text at its PDF x/y.
            # Its reading-order owner is the final count+color span on the
            # immediately preceding DOM line in the same source block.
            current_line_matches = []
            for block_index, block in enumerate(dom["blocks"]):
                if block["id"] != anchor.get("blockId"):
                    continue
                for line_index, line in enumerate(block["lines"]):
                    if line["id"] == anchor.get("lineId"):
                        current_line_matches.append((block_index, block, line_index, line))
            if len(current_line_matches) != 1:
                summary["unmatched_unowned"] += 1
                continue
            block_index, block, line_index, current_line = current_line_matches[0]
            if anchor.get("side") != "before" or anchor.get("spanIndex") != 0 or line_index == 0:
                summary["unmatched_unowned"] += 1
                continue
            current_span_index = anchor["spanIndex"]
            current_span = current_line["spans"][current_span_index]
            current_span_source = next((sp for sp in spans
                if sp.get("text") == current_span.get("text") and sp.get("font") == current_span.get("font")
                and max(abs(float(a)-float(b)) for a,b in zip(sp["bbox"], current_span["bbox"])) <= GEOMETRY_TOLERANCE_PT), None)
            if not current_span_source or abs(baseline - current_span_source["origin"][1]) > GEOMETRY_TOLERANCE_PT:
                summary["unmatched_unowned"] += 1
                continue
            text_gap = current_span_source["bbox"][0] - bbox[2]
            if not 0 <= text_gap <= GAP_TOLERANCE_PT:
                summary["unmatched_unowned"] += 1
                continue

            previous_line = block["lines"][line_index - 1]
            previous_spans = previous_line.get("spans", [])
            if not previous_spans:
                summary["unmatched_unowned"] += 1
                continue
            owner_dom_index = len(previous_spans) - 1
            owner_dom_span = previous_spans[owner_dom_index]
            parsed = LABEL.fullmatch(owner_dom_span.get("text", ""))
            if not parsed or parsed.group(2).upper() != expected_color or owner_dom_span.get("font") != "OptimaLTStd-Bold":
                summary["unmatched_unowned"] += 1
                continue
            owner_source = next((sp for sp in spans
                if sp.get("text") == owner_dom_span.get("text") and sp.get("font") == owner_dom_span.get("font")
                and max(abs(float(a)-float(b)) for a,b in zip(sp["bbox"], owner_dom_span["bbox"])) <= GEOMETRY_TOLERANCE_PT), None)
            baseline_step = baseline - owner_source["origin"][1] if owner_source else 0
            if not owner_source or not 0.75 * size <= baseline_step <= 1.5 * size:
                summary["unmatched_unowned"] += 1
                continue

            new_anchor = dict(anchor)
            new_anchor["ownerSpanRef"] = {"lineId": previous_line["id"], "spanIndex": owner_dom_index}
            matches.append({"page": page_number, "family": "wrapped-count-color", "symbolId": symbol_id,
                "ownerText": owner_dom_span["text"], "lineId": previous_line["id"],
                "spanIndex": owner_dom_index, "previousAnchor": anchor, "anchor": new_anchor,
                "sidecar": sidecar, "path": sidecar_path, "element": element})
            summary["wrapped_count_color"] += 1

    return matches, summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--family", choices=("same-line-count-color", "wrapped-count-color"),
        help="limit dry-run or write to one structural family")
    parser.add_argument("--apply", action="store_true", help="write validated matches; requires --family")
    args = parser.parse_args()
    if args.apply and not args.family:
        parser.error("--apply requires --family so distinct anchor structures are never written as one batch")
    if not PDF.is_file():
        raise FileNotFoundError(PDF)
    with fitz.open(PDF) as source:
        matches, summary = discover(source)

    if args.family:
        matches = [match for match in matches if match["family"] == args.family]
    for match in matches:
        match["element"]["anchor"] = match["anchor"]
    print(json.dumps({"families": {
        "same-line-count-color": summary["same_line_count_color"],
        "wrapped-count-color": summary["wrapped_count_color"],
    }, "summary": summary, "matches": [
        {key: match[key] for key in ("page", "family", "symbolId", "ownerText", "lineId", "spanIndex", "previousAnchor", "anchor")}
        for match in matches
    ]}, ensure_ascii=False, indent=2))
    if not args.apply:
        return

    writes = {match["path"]: match["sidecar"] for match in matches}
    temporaries: list[tuple[Path, Path]] = []
    try:
        for path, sidecar in writes.items():
            temp = path.with_suffix(path.suffix + ".tmp")
            temp.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            temporaries.append((temp, path))
        for temp, path in temporaries:
            os.replace(temp, path)
        print(f"Updated {len(writes)} count+color ownership sidecars.")
    finally:
        for temp, _ in temporaries:
            temp.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
