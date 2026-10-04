"""Expose six independent, source-anchored turn labels on p.36.

Keep the original block and every line/span ID. The source card-frame width
provides negative space around each centered label, while its ink center and
all glyph bboxes stay unchanged. This is explicit page metadata, not automatic
cross-column paragraph merging.
"""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PATH = ROOT / "apps/web/public/pages/page_036/page_036_dom.json"
TEXTS = ["1st TURN", "2nd TURN", "3rd TURN", "4th TURN", "5th TURN", "6th TURN"]
WIDTH = 74.52


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    block = next(b for b in data["blocks"] if b["id"] == "block_76")
    if data.get("page_number") != 36 or len(block["lines"]) != 6:
        raise ValueError("Unexpected p.36 label block")
    with pymupdf.open(PDF) as document:
        page = document[35]
        traces = page.get_texttrace()
        card_frames = [d["rect"] for d in page.get_drawings()
                       if abs(d["rect"].width - WIDTH) < 0.005
                       and abs(d["rect"].height - 110.16) < 0.005
                       and abs(d["rect"].y0 - 454.312) < 0.005
                       and d["fill"] is not None
                       and max(abs(a-b) for a,b in zip(d["fill"], (0.1366903, 0.1219501, 0.1252918))) < 0.0001]
        if len(card_frames) != 6:
            raise ValueError("Six source card frames changed")
        card_frames.sort(key=lambda r: r.x0)
        for i, line in enumerate(block["lines"]):
            if line["id"] != f"line_76_{i}" or len(line["spans"]) != 1:
                raise ValueError("Label source IDs changed")
            span = line["spans"][0]
            if (span["text"], span["font"], span["size"], span["color"]) != (TEXTS[i], "OptimaLTStd-ExtraBlack", 8.0, "#231f20"):
                raise ValueError(f"Source label style/text changed: {i}")
            found = [t for t in traces if t["font"] == span["font"] and t["size"] == 8
                     and "".join(chr(c[0]) for c in t["chars"]) == TEXTS[i]
                     and abs(t["bbox"][0] - span["bbox"][0]) < 0.005
                     and abs(t["bbox"][2] - span["bbox"][2]) < 0.005]
            if len(found) != 1 or abs(found[0]["bbox"][1] - 562.8166) > 0.005:
                raise ValueError(f"Source label trace changed: {i}")
            center = (line["bbox"][0] + line["bbox"][2]) / 2
            if not card_frames[i].x0 < center < card_frames[i].x1:
                raise ValueError(f"Label no longer matches its source card: {i}")

    units = []
    for i, line in enumerate(block["lines"]):
        center = (line["bbox"][0] + line["bbox"][2]) / 2
        x = center - WIDTH / 2
        line["availableX"] = x
        line["availableWidth"] = WIDTH
        unit_id = f"p36-block-76-turn-{i+1}"
        units.append({
            "id": unit_id, "fixedPosition": True,
            "field": {"id": f"{unit_id}-field", "lineIds": [line["id"]],
                      "bbox": line["bbox"].copy(),
                      "frame": {"x": x, "width": WIDTH, "textAlign": "center", "lineHeight": 1}},
        })
    if block.get("typographicUnits") and block["typographicUnits"] != units:
        raise ValueError("Existing label units differ; preserve and inspect")
    block["typographicUnits"] = units
    updated = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if PATH.read_text(encoding="utf-8") != updated:
        backup = ROOT / "tmp/page36-turn-labels/page_036_dom-before.json"
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            backup.write_bytes(PATH.read_bytes())
        PATH.write_text(updated, encoding="utf-8")
    print("p.36: six independent centered 74.52pt label fields; source centers, bboxes and IDs preserved.")


if __name__ == "__main__":
    main()
