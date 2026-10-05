"""Bind page 38's three inline black dice to their owning BLACK labels.

Dry-run by default. This repairs editor ownership and preserves the source
spacing; it does not change the artwork, masks, translated text or database.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_038"
DOM_PATH = PAGE / "page_038_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"

TARGETS = [
    dict(bbox=[418.47412109375,411.87371826171875,428.5440979003906,423.4977111816406],
         blockId="block_30", blockIndex=14, ownerLine="line_30_0", ownerSpan=1,
         placementLine="line_30_0", placementSpan=2, drawingIndices=[159,160,161,162]),
    dict(bbox=[332.3883972167969,451.20361328125,342.4583740234375,462.8276062011719],
         blockId="block_33", blockIndex=16, ownerLine="line_33_1", ownerSpan=3,
         placementLine="line_33_1", placementSpan=4, drawingIndices=[168,169,170,171]),
    dict(bbox=[485.4856262207031,497.542236328125,495.55560302734375,509.1662292480469],
         blockId="block_35", blockIndex=18, ownerLine="line_35_1", ownerSpan=1,
         placementLine="line_35_1", placementSpan=2, drawingIndices=[176,177,178,179]),
]


def source_baseline(page: fitz.Page, span: dict) -> float:
    for block in page.get_text("dict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)["blocks"]:
        for line in block.get("lines", []):
            for candidate in line["spans"]:
                if (candidate["font"] == span["font"] and abs(candidate["size"] - span["size"]) < .02
                    and abs(candidate["bbox"][1] - span["bbox"][1]) < .03
                    and abs(candidate["bbox"][3] - span["bbox"][3]) < .03
                    and candidate["bbox"][0] >= span["bbox"][0] - .05
                    and candidate["bbox"][0] <= span["bbox"][2] + .05):
                    return candidate["origin"][1]
    raise ValueError(f"No PDF baseline for {span['font']} {span['bbox']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the corrected page 38 sidecar")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    changed = []
    with fitz.open(PDF) as source:
        source_page = source[37]
        drawings = source_page.get_drawings()
        for target in TARGETS:
            block = dom["blocks"][target["blockIndex"]]
            if block["id"] != target["blockId"]:
                raise ValueError(f"DOM block moved: {target['blockId']}")
            owner_line = next(line for line in block["lines"] if line["id"] == target["ownerLine"])
            placement_line = next(line for line in block["lines"] if line["id"] == target["placementLine"])
            owner = owner_line["spans"][target["ownerSpan"]]
            placement = placement_line["spans"][target["placementSpan"]]
            if owner["text"] != "BLACK" or placement["text"] != " ":
                raise ValueError(f"Expected BLACK followed by its source space near {target['bbox']}")
            if abs(owner["size"] - 9) > .02 or abs(placement["size"] - 9) > .02:
                raise ValueError(f"Unexpected source typography near {target['bbox']}")
            for drawing_index in target["drawingIndices"]:
                rect = fitz.Rect(target["bbox"]) + (-.02, -.02, .02, .02)
                if not rect.contains(drawings[drawing_index]["rect"]):
                    raise ValueError(f"Source drawing changed at index {drawing_index}")

            element = next((item for item in sidecar["elements"] if item.get("symbolId") == "dice.black"
                and len(item.get("bbox", [])) == 4 and max(abs(a - b) for a, b in zip(item["bbox"], target["bbox"])) < .01), None)
            if element is None:
                raise ValueError(f"No existing dice.black adapter for {target['bbox']}")
            size_pt = element["anchor"]["sizePt"]
            baseline = source_baseline(source_page, owner)
            gap_pt = round(target["bbox"][0] - placement["bbox"][2], 6)
            if gap_pt < 0:
                raise ValueError(f"Source die overlaps its preceding space by {-gap_pt:.4f} pt")
            anchor = {
                "blockId": target["blockId"],
                "blockIndex": target["blockIndex"],
                "lineId": target["placementLine"],
                "spanIndex": target["placementSpan"],
                "side": "after",
                "sizePt": size_pt,
                "gapPt": gap_pt,
                "ownerSpanRef": {"lineId": target["ownerLine"], "spanIndex": target["ownerSpan"]},
            }
            metrics = {
                "widthEm": (target["bbox"][2] - target["bbox"][0]) / size_pt,
                "heightEm": (target["bbox"][3] - target["bbox"][1]) / size_pt,
                "verticalAlignEm": (target["bbox"][3] - baseline) / size_pt,
            }
            changed.append({"symbolId": "dice.black", "bbox": target["bbox"], "anchor": anchor, "metrics": metrics})
            element["anchor"] = anchor
            element["metrics"] = metrics

    print(json.dumps(changed, ensure_ascii=False, indent=2))
    if args.apply:
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Updated {SIDECAR_PATH}")


if __name__ == "__main__":
    main()
