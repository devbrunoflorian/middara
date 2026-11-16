"""Bind page 52's wrapped black dice to their source BLACK labels.

Dry-run by default. This changes only inline-element anchors/metrics; it does
not modify source artwork, translated text, masks or the database.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_052"
DOM_PATH = PAGE / "page_052_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"

TARGETS = [
    dict(bbox=[244.1573944091797,333.24859619140625,255.64540100097656,346.5075988769531], blockId="block_20", blockIndex=6, ownerLine="line_20_3", ownerSpan=1, placementSpan=2, drawings=[116,117,118,119]),
    dict(bbox=[230.74749755859375,371.91790771484375,242.23550415039062,385.1769104003906], blockId="block_20", blockIndex=6, ownerLine="line_20_7", ownerSpan=1, placementSpan=2, drawings=[120,121,122,123]),
    dict(bbox=[236.82479858398438,499.6029968261719,248.31280517578125,512.8619995117188], blockId="block_23", blockIndex=9, ownerLine="line_23_0", ownerSpan=1, placementSpan=2, drawings=[138,139,140,141]),
    dict(bbox=[365.6448059082031,510.60302734375,377.1327819824219,523.862060546875], blockId="block_23", blockIndex=9, ownerLine="line_23_2", ownerSpan=1, placementSpan=2, drawings=[142,143,144,145]),
    dict(bbox=[228.4949951171875,532.60302734375,239.98300170898438,545.862060546875], blockId="block_23", blockIndex=9, ownerLine="line_23_5", ownerSpan=1, placementSpan=2, drawings=[146,147,148,149]),
    dict(bbox=[322.1334228515625,582.61083984375,333.62139892578125,595.869873046875], blockId="block_25", blockIndex=11, ownerLine="line_25_1", ownerSpan=3, placementSpan=4, drawings=[150,151,152,153]),
    dict(bbox=[232.5041046142578,605.61083984375,243.9921112060547,618.869873046875], blockId="block_25", blockIndex=11, ownerLine="line_25_4", ownerSpan=1, placementSpan=2, drawings=[154,155,156,157]),
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
    parser.add_argument("--apply", action="store_true", help="write corrected anchors to page 52 sidecar")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    changed = []
    with fitz.open(PDF) as source:
        source_page = source[51]
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
            if owner["text"] != "BLACK" or placement["text"] != " ":
                raise ValueError(f"Expected BLACK followed by its source space near {target['bbox']}")
            if abs(owner["size"] - 9) > .02:
                raise ValueError(f"Unexpected source typography near {target['bbox']}")
            if placement["font"] != "OptimaLTStd" or placement["text"] != " ":
                raise ValueError(f"Expected a regular Optima source space near {target['bbox']}")

            source_rect = fitz.Rect(target["bbox"]) + (-.02, -.02, .02, .02)
            for drawing_index in target["drawings"]:
                if not source_rect.contains(drawings[drawing_index]["rect"]):
                    raise ValueError(f"Source drawing changed at index {drawing_index}")

            element = next((item for item in sidecar["elements"] if item.get("symbolId") == "dice.black"
                and len(item.get("bbox", [])) == 4 and max(abs(a - b) for a, b in zip(item["bbox"], target["bbox"])) < .01), None)
            if element is None:
                raise ValueError(f"No existing dice.black adapter for {target['bbox']}")
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
            changed.append({"symbolId": "dice.black", "bbox": target["bbox"], "sourceOwnerBaselinePt": baseline,
                "anchor": anchor, "metricsPreserved": metrics})
            element["anchor"] = anchor

    print(json.dumps(changed, ensure_ascii=False, indent=2))
    if args.apply:
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Updated {SIDECAR_PATH}")


if __name__ == "__main__":
    main()
