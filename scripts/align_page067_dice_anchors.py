"""Bind page 67's two black dice to the BLACK labels that own them.

Dry-run by default. The source PDF and DOM are read-only; --apply updates only
the page 67 inline-elements sidecar and preserves each occurrence's metrics.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_067"
DOM_PATH = PAGE / "page_067_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"

TARGETS = [
    dict(bbox=[579.6500854492188,330.643310546875,591.1381225585938,343.9023132324219],
         blockId="block_19", blockIndex=11, lineId="line_19_2", ownerSpan=1, placementSpan=2,
         oldLineId="line_19_3", oldSpan=0, drawings=[141,142,143,144]),
    dict(bbox=[523.9898681640625,435.3125915527344,535.4779052734375,448.57159423828125],
         blockId="block_20", blockIndex=12, lineId="line_20_6", ownerSpan=1, placementSpan=2,
         oldLineId="line_20_7", oldSpan=1, drawings=[151,152,153,154]),
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
    parser.add_argument("--apply", action="store_true", help="write corrected anchors to page 67 sidecar")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    changed = []
    with fitz.open(PDF) as source:
        source_page = source[66]
        drawings = source_page.get_drawings()
        source_spans = [span for block in source_page.get_text("dict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)["blocks"]
            for line in block.get("lines", []) for span in line["spans"]]
        for target in TARGETS:
            block = dom["blocks"][target["blockIndex"]]
            if block["id"] != target["blockId"]:
                raise ValueError(f"DOM block moved: {target['blockId']}")
            line = next(line for line in block["lines"] if line["id"] == target["lineId"])
            owner, placement = line["spans"][target["ownerSpan"]], line["spans"][target["placementSpan"]]
            if owner["text"] != "BLACK" or placement["text"] != " ":
                raise ValueError(f"Expected BLACK followed by its source space near {target['bbox']}")
            if owner["font"] != "OptimaLTStd-Bold" or abs(owner["size"] - 8.8477) > .02:
                raise ValueError(f"Unexpected BLACK typography near {target['bbox']}")
            if placement["font"] != "OptimaLTStd":
                raise ValueError(f"Unexpected source whitespace font near {target['bbox']}")
            source_rect = fitz.Rect(target["bbox"]) + (-.02, -.02, .02, .02)
            for drawing_index in target["drawings"]:
                if not source_rect.contains(drawings[drawing_index]["rect"]):
                    raise ValueError(f"Source drawing changed at index {drawing_index}")

            element = next((item for item in sidecar["elements"] if item.get("symbolId") == "dice.black"
                and len(item.get("bbox", [])) == 4 and max(abs(a - b) for a, b in zip(item["bbox"], target["bbox"])) < .01), None)
            if element is None:
                raise ValueError(f"No existing dice.black adapter for {target['bbox']}")
            anchor = element["anchor"]
            if (anchor.get("lineId"), anchor.get("spanIndex"), anchor.get("side")) != (target["oldLineId"], target["oldSpan"], "before"):
                raise ValueError(f"Unexpected current anchor for {target['bbox']}: {anchor}")

            size_pt = anchor["sizePt"]
            baseline = source_baseline(source_spans, owner)
            gap_pt = round(target["bbox"][0] - placement["bbox"][2], 6)
            if gap_pt < 0:
                raise ValueError(f"Source die overlaps its preceding space by {-gap_pt:.4f} pt")
            new_anchor = {
                "blockId": target["blockId"],
                "blockIndex": target["blockIndex"],
                "lineId": target["lineId"],
                "spanIndex": target["placementSpan"],
                "side": "after",
                "sizePt": size_pt,
                "gapPt": gap_pt,
                "ownerSpanRef": {"lineId": target["lineId"], "spanIndex": target["ownerSpan"]},
            }
            metrics = element.get("metrics")
            if not metrics or min(metrics.get("widthEm", 0), metrics.get("heightEm", 0)) <= 0:
                raise ValueError(f"Missing source-render metrics for {target['bbox']}")
            changed.append({"symbolId": "dice.black", "bbox": target["bbox"], "sourceOwnerBaselinePt": baseline,
                "anchor": new_anchor, "metricsPreserved": metrics})
            element["anchor"] = new_anchor

    print(json.dumps(changed, ensure_ascii=False, indent=2))
    if args.apply:
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Updated {SIDECAR_PATH}")


if __name__ == "__main__":
    main()
