"""Bind page 45's white/orange dice to their preceding source labels.

Dry-run by default. It keeps the existing paths and per-occurrence metrics;
--apply changes only the page 45 inline-elements sidecar.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_045"
DOM_PATH = PAGE / "page_045_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"

TARGETS = [
    dict(symbol="dice.white", bbox=[240.94760131835938,439.90350341796875,252.43560791015625,453.1625061035156], blockId="block_10", blockIndex=8, ownerLine="line_10_1", ownerSpan=5, placementSpan=6, ownerText="WHITE", drawings=[118,119,120,121]),
    dict(symbol="dice.orange", bbox=[361.94012451171875,451.0830078125,373.4281005859375,464.3420104980469], blockId="block_10", blockIndex=8, ownerLine="line_10_3", ownerSpan=5, placementSpan=6, ownerText="FINESSE : ORANGE", drawings=[122,123,124,125]),
    dict(symbol="dice.orange", bbox=[340.8502197265625,464.0830078125,352.33819580078125,477.3420104980469], blockId="block_10", blockIndex=8, ownerLine="line_10_6", ownerSpan=1, placementSpan=2, ownerText="ORANGE", drawings=[130,131,132,133]),
    dict(symbol="dice.orange", bbox=[156.6667022705078,624.0988159179688,168.1547088623047,637.3578491210938], blockId="block_14", blockIndex=12, ownerLine="line_14_1", ownerSpan=1, placementSpan=2, ownerText="ORANGE", drawings=[138,139,140,141]),
]


def source_baseline(spans: list[dict], span: dict) -> float:
    for candidate in spans:
        if (candidate["font"] == span["font"] and abs(candidate["size"] - span["size"]) < .02
            and abs(candidate["bbox"][1] - span["bbox"][1]) < .03
            and abs(candidate["bbox"][3] - span["bbox"][3]) < .03
            and candidate["bbox"][0] >= span["bbox"][0] - .05
            and candidate["bbox"][0] <= span["bbox"][2] + .05):
            return candidate["origin"][1]
    raise ValueError(f"No PDF baseline for {span['font']} {span['bbox']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write corrected anchors to page 45 sidecar")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    changed = []
    with fitz.open(PDF) as source:
        source_page = source[44]
        drawings = source_page.get_drawings()
        source_spans = [span for block in source_page.get_text("dict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)["blocks"]
            for line in block.get("lines", []) for span in line["spans"]]
        for target in TARGETS:
            block = dom["blocks"][target["blockIndex"]]
            if block["id"] != target["blockId"]:
                raise ValueError(f"DOM block moved: {target['blockId']}")
            line = next(line for line in block["lines"] if line["id"] == target["ownerLine"])
            owner = line["spans"][target["ownerSpan"]]
            placement = line["spans"][target["placementSpan"]]
            if owner["text"] != target["ownerText"] or placement["text"] != " ":
                raise ValueError(f"Unexpected owner or source space near {target['bbox']}")
            if owner["font"] != "OptimaLTStd-Bold" or abs(owner["size"] - 9) > .02:
                raise ValueError(f"Unexpected owner typography near {target['bbox']}")
            if placement["font"] != "OptimaLTStd":
                raise ValueError(f"Unexpected source whitespace font near {target['bbox']}")
            source_rect = fitz.Rect(target["bbox"]) + (-.02, -.02, .02, .02)
            for drawing_index in target["drawings"]:
                if not source_rect.contains(drawings[drawing_index]["rect"]):
                    raise ValueError(f"Source drawing changed at index {drawing_index}")

            element = next((item for item in sidecar["elements"] if item.get("symbolId") == target["symbol"]
                and len(item.get("bbox", [])) == 4 and max(abs(a - b) for a, b in zip(item["bbox"], target["bbox"])) < .01), None)
            if element is None:
                raise ValueError(f"No existing {target['symbol']} adapter for {target['bbox']}")
            size_pt = element["anchor"]["sizePt"]
            baseline = source_baseline(source_spans, owner)
            gap_pt = round(target["bbox"][0] - placement["bbox"][2], 6)
            if gap_pt < 0:
                raise ValueError(f"Source die overlaps its preceding space by {-gap_pt:.4f} pt")
            anchor = {
                "blockId": target["blockId"],
                "blockIndex": target["blockIndex"],
                "lineId": target["ownerLine"],
                "spanIndex": target["placementSpan"],
                "side": "after",
                "sizePt": size_pt,
                "gapPt": gap_pt,
                "ownerSpanRef": {"lineId": target["ownerLine"], "spanIndex": target["ownerSpan"]},
            }
            metrics = element.get("metrics")
            if not metrics or min(metrics.get("widthEm", 0), metrics.get("heightEm", 0)) <= 0:
                raise ValueError(f"Missing source-render metrics for {target['bbox']}")
            changed.append({"symbolId": target["symbol"], "bbox": target["bbox"], "sourceOwnerBaselinePt": baseline,
                "anchor": anchor, "metricsPreserved": metrics})
            element["anchor"] = anchor

    print(json.dumps(changed, ensure_ascii=False, indent=2))
    if args.apply:
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Updated {SIDECAR_PATH}")


if __name__ == "__main__":
    main()
