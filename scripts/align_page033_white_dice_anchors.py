"""Bind page 33's white dice to their source WHITE labels.

Dry-run by default. The PDF splits the symbols from the text on the same
visual row; this repair changes only sidecar anchors, not artwork or text.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_033"
DOM_PATH = PAGE / "page_033_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"

TARGETS = [
    dict(bbox=[510.0110168457031,324.51849365234375,521.4990234375,337.7774963378906], blockId="block_41", blockIndex=25, ownerLine="line_41_3", ownerSpan=1, placementSpan=2, drawings=[160,161,162,163]),
    dict(bbox=[544.4155883789062,354.00830078125,555.9036254882812,367.2673034667969], blockId="block_43", blockIndex=26, ownerLine="line_43_2", ownerSpan=1, placementSpan=2, drawings=[168,169,170,171]),
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
    parser.add_argument("--apply", action="store_true", help="write corrected anchors to page 33 sidecar")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    changed = []
    with fitz.open(PDF) as source:
        source_page = source[32]
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
            if owner["text"] != "WHITE" or placement["text"] != " ":
                raise ValueError(f"Expected WHITE followed by its source space near {target['bbox']}")
            if owner["font"] != "OptimaLTStd-Bold" or abs(owner["size"] - 9) > .02:
                raise ValueError(f"Unexpected owner typography near {target['bbox']}")
            if placement["font"] != "OptimaLTStd":
                raise ValueError(f"Unexpected source whitespace font near {target['bbox']}")
            source_rect = fitz.Rect(target["bbox"]) + (-.02, -.02, .02, .02)
            for drawing_index in target["drawings"]:
                if not source_rect.contains(drawings[drawing_index]["rect"]):
                    raise ValueError(f"Source drawing changed at index {drawing_index}")

            element = next((item for item in sidecar["elements"] if item.get("symbolId") == "dice.white"
                and len(item.get("bbox", [])) == 4 and max(abs(a - b) for a, b in zip(item["bbox"], target["bbox"])) < .01), None)
            if element is None:
                raise ValueError(f"No existing dice.white adapter for {target['bbox']}")
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
            changed.append({"symbolId": "dice.white", "bbox": target["bbox"], "sourceOwnerBaselinePt": baseline,
                "anchor": anchor, "metricsPreserved": metrics})
            element["anchor"] = anchor

    print(json.dumps(changed, ensure_ascii=False, indent=2))
    if args.apply:
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Updated {SIDECAR_PATH}")


if __name__ == "__main__":
    main()
