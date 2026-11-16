"""Separate p.35's right-column Loot Deck prose from its left-column E marker.

Preserve the source block/line/span IDs and existing translation keys. Add
paragraph editor units using the current schema; the E unit stays anchored
when the right-column heading reflows. Only source-reviewed frame metadata
changes. No Payload records are touched.
"""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PATH = ROOT / "apps/web/public/pages/page_035/page_035_dom.json"
CONTENT = [
    ("COMBATANT LOOT DECK:", "OptimaLTStd-Bold", 9.0, "#ffffff"),
    ("The Combatant Loot deck is shuffled and placed on the table before ", "OptimaLTStd", 10.0, "#ffffff"),
    ("each Encounter. When an opponent is Defeated, players will draw ", "OptimaLTStd", 10.0, "#ffffff"),
    ("from this deck.", "OptimaLTStd", 10.0, "#ffffff"),
    ("E", "OptimaLTStd-Bold", 9.0, "#231f20"),
]


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    block = next(b for b in data["blocks"] if b["id"] == "block_26")
    lines = block["lines"]
    if data.get("page_number") != 35 or len(lines) != 5:
        raise ValueError("Unexpected p.35 legend block")
    with pymupdf.open(PDF) as doc:
        traces = doc[34].get_texttrace()
        for i, (text, font, size, color) in enumerate(CONTENT):
            line = lines[i]
            span = line["spans"][0]
            if line["id"] != f"line_26_{i}" or (span["text"], span["font"], span["size"], span["color"]) != (text, font, size, color):
                raise ValueError(f"Source DOM content changed: line_26_{i}")
            found = [t for t in traces if t["font"] == font and t["size"] == size
                     and "".join(chr(c[0]) for c in t["chars"]) == text
                     and abs(t["bbox"][0] - span["bbox"][0]) < 0.005
                     and abs(t["bbox"][2] - span["bbox"][2]) < 0.005]
            if len(found) != 1 or abs(found[0]["bbox"][1] - span["bbox"][1]) > 2:
                raise ValueError(f"Source PDF content/position changed: line_26_{i}")
        if any(abs(lines[i+1]["bbox"][1] - lines[i]["bbox"][1] - 11) > 0.005 for i in (1, 2)):
            raise ValueError("Source body leading changed")

    x = lines[0]["bbox"][0]
    right = max(line["bbox"][2] for line in lines[:4])
    for line in lines[:4]:
        line["availableX"] = x
        line["availableWidth"] = right - x
    marker = lines[4]
    marker["availableX"] = marker["bbox"][0]
    marker["availableWidth"] = marker["bbox"][2] - marker["bbox"][0]

    units = []
    for name, selected, fixed, leading in [
        ("loot-deck-heading", lines[:1], False, 1),
        ("loot-deck-body", lines[1:4], False, 1.1),
        ("marker-e", lines[4:], True, 1),
    ]:
        bbox = [min(l["bbox"][0] for l in selected), min(l["bbox"][1] for l in selected),
                max(l["bbox"][2] for l in selected), max(l["bbox"][3] for l in selected)]
        unit_id = f"p35-block-26-{name}"
        units.append({
            "id": unit_id,
            "field": {"id": f"{unit_id}-field", "lineIds": [l["id"] for l in selected],
                      "bbox": bbox, "frame": {"x": bbox[0], "width": bbox[2] - bbox[0] if fixed else right - bbox[0],
                                              "textAlign": "left", "lineHeight": leading}},
            **({"fixedPosition": True} if fixed else {}),
        })
    if block.get("typographicUnits") and block["typographicUnits"] != units:
        raise ValueError("Existing paragraph fields differ; preserve and inspect")
    block["typographicUnits"] = units
    updated = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if PATH.read_text(encoding="utf-8") != updated:
        backup = ROOT / "tmp/page35-legend/page_035_dom-before.json"
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            backup.write_bytes(PATH.read_bytes())
        PATH.write_text(updated, encoding="utf-8")
    print("p.35: separate heading/body/E fields; prose width 293.962 pt, marker 4.5 pt; source IDs and content preserved.")


if __name__ == "__main__":
    main()
