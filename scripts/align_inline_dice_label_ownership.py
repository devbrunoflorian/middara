"""Discover and optionally repair the shared separate-label dice pattern.

Family contract: an Optima Bold color label in its own source text span, then a
standalone one-space span, then a four-path dice drawing on the same baseline.
Dry-run by default. --apply updates every validated equivalent occurrence, and
only its page inline-elements sidecar. Combined-span and composite-label cases
are intentionally excluded.
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
COLOR_LABELS = {"BLACK", "WHITE", "PURPLE", "ORANGE", "GREEN", "TEAL", "BLUE", "RED", "GREY", "GRAY"}
BASELINE_TOLERANCE_PT = .05
BBOX_TOLERANCE_PT = .03


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
                if delta <= BBOX_TOLERANCE_PT:
                    matches.append((delta, block_index, block, line, span_index, span))
    if len(matches) != 1:
        raise ValueError(f"Source span did not map uniquely into extracted DOM: {source_span['text']!r} {source_span['bbox']}")
    _, block_index, block, line, span_index, span = matches[0]
    return block_index, block, line, span_index, span


def discover_family(source: fitz.Document) -> tuple[list[dict], dict[str, int]]:
    candidates: list[dict] = []
    summary = {"dice": 0, "already_owned": 0, "matched": 0}
    for sidecar_path in sorted(PAGES.glob("page_*/inline_elements.json")):
        page_match = re.fullmatch(r"page_(\d{3})", sidecar_path.parent.name)
        if not page_match:
            continue
        page_number = int(page_match.group(1))
        dom_path = sidecar_path.parent / f"page_{page_number:03d}_dom.json"
        if not dom_path.exists() or page_number > len(source):
            continue
        sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
        dom = json.loads(dom_path.read_text(encoding="utf-8"))
        page = source[page_number - 1]
        source_spans = pdf_text_spans(page)
        drawings = page.get_drawings()
        for element in sidecar.get("elements", []):
            if not element.get("symbolId", "").startswith("dice."):
                continue
            summary["dice"] += 1
            anchor = element.get("anchor", {})
            if anchor.get("ownerSpanRef"):
                summary["already_owned"] += 1
                continue
            bbox = element.get("bbox", [])
            metrics = element.get("metrics", {})
            if len(bbox) != 4 or not anchor.get("sizePt") or "verticalAlignEm" not in metrics:
                continue
            baseline = bbox[3] - metrics["verticalAlignEm"] * anchor["sizePt"]
            same_baseline = [span for span in source_spans if abs(span["origin"][1] - baseline) <= BASELINE_TOLERANCE_PT]
            previous = [span for span in same_baseline if span["bbox"][2] <= bbox[0] + .15 and span["text"].strip()]
            if not previous:
                continue
            owner = max(previous, key=lambda span: span["bbox"][2])
            label = owner["text"].upper()
            if label.strip() not in COLOR_LABELS:
                continue
            if label != label.strip():
                continue
            if owner["font"] != "OptimaLTStd-Bold":
                continue
            spaces = [span for span in same_baseline if span["text"] == " "
                and span["bbox"][0] >= owner["bbox"][2] - .15
                and span["bbox"][2] <= bbox[0] + .15]
            if not spaces:
                continue
            space = max(spaces, key=lambda span: span["bbox"][2])
            gap_pt = round(bbox[0] - space["bbox"][2], 6)
            if gap_pt < 0:
                continue
            owner_match = map_source_span(dom, owner)
            space_match = map_source_span(dom, space)
            owner_block_index, owner_block, owner_line, owner_span_index, owner_dom_span = owner_match
            space_block_index, space_block, space_line, space_span_index, space_dom_span = space_match
            if (owner_block_index != space_block_index or owner_block["id"] != space_block["id"]
                or owner_line["id"] != space_line["id"]):
                continue
            if (owner_dom_span.get("text") != label or space_dom_span.get("text") != " "
                or anchor.get("blockIndex") != owner_block_index or anchor.get("blockId") != owner_block["id"]):
                continue
            indices = element.get("drawingIndices", [])
            source_rect = fitz.Rect(bbox) + (-.02, -.02, .02, .02)
            if len(indices) != 4 or any(index < 0 or index >= len(drawings) or not source_rect.contains(drawings[index]["rect"]) for index in indices):
                continue
            if abs(owner["origin"][1] - baseline) > BASELINE_TOLERANCE_PT:
                continue
            summary["matched"] += 1
            candidates.append({
                "page": page_number,
                "path": sidecar_path,
                "sidecar": sidecar,
                "element": element,
                "bbox": bbox,
                "symbolId": element["symbolId"],
                "label": label,
                "blockId": owner_block["id"],
                "blockIndex": owner_block_index,
                "lineId": owner_line["id"],
                "ownerSpanIndex": owner_span_index,
                "spaceSpanIndex": space_span_index,
                "gapPt": gap_pt,
                "baselinePt": owner["origin"][1],
                "drawings": indices,
            })
    return candidates, summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="apply every fully validated family match")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)

    with fitz.open(PDF) as source:
        candidates, summary = discover_family(source)
    writes: dict[Path, dict] = {}
    for target in candidates:
        element = target["element"]
        old = element["anchor"]
        element["anchor"] = {
            "blockId": target["blockId"],
            "blockIndex": target["blockIndex"],
            "lineId": target["lineId"],
            "spanIndex": target["spaceSpanIndex"],
            "side": "after",
            "sizePt": old["sizePt"],
            "gapPt": target["gapPt"],
            "ownerSpanRef": {"lineId": target["lineId"], "spanIndex": target["ownerSpanIndex"]},
        }
        writes[target["path"]] = target["sidecar"]

    report = [{key: value for key, value in target.items() if key not in {"path", "sidecar", "element"}}
        | {"anchor": target["element"]["anchor"], "metricsPreserved": target["element"]["metrics"]}
        for target in candidates]
    print(json.dumps({"family": "separate-label-plus-space", "summary": summary, "matches": report}, ensure_ascii=False, indent=2))
    if not args.apply:
        return

    temporaries: list[tuple[Path, Path]] = []
    try:
        for path, sidecar in writes.items():
            temp = path.with_suffix(path.suffix + ".tmp")
            temp.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            temporaries.append((temp, path))
        for temp, path in temporaries:
            os.replace(temp, path)
        print(f"Updated {len(writes)} family-matched sidecars.")
    finally:
        for temp, _ in temporaries:
            if temp.exists():
                temp.unlink()


if __name__ == "__main__":
    main()
