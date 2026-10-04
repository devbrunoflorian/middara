"""Restore p.29's two white flourishes and Scrying card's dark bottom band.

These are fixed, word-free PDF vector regions. Source crops are shared by EN
and PT-BR. Two numeric stroke/fill pairs retain their source DOM provenance;
the existing renderer stroke fields prevent rendering the stroke as a fill.
"""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_DIR = ROOT / "apps/web/public/pages/page_029"
SIDECAR = PAGE_DIR / "fidelity_overlays.json"
SCALE = 4
AUDIT_ID = "2026-10-04-page29-fixed-artwork-v1"
EVIDENCE = "docs/project-progress/2026-10-04-page29-fixed-artwork.md"

# Quarter-point bounds align to the source raster's global pixel grid at 4x.
# Each crop contains its audited vector path and no live DOM line.
TARGETS = [
    {
        "region": "left-white-flourish",
        "bbox": [86.25, 575.25, 113.0, 597.75],
        "vectorBBox": [87.085, 575.893, 112.103, 596.797],
        "fill": [1.0, 1.0, 1.0],
    },
    {
        "region": "right-white-flourish",
        "bbox": [708.25, 575.25, 735.0, 597.75],
        "vectorBBox": [709.155, 575.893, 734.173, 596.797],
        "fill": [1.0, 1.0, 1.0],
    },
    {
        "region": "scrying-bottom-band",
        "bbox": [412.25, 770.5, 521.0, 784.5],
        "vectorBBox": [412.441, 770.824, 520.676, 784.128],
        "fill": [0.1366903, 0.1219501, 0.1252918],
    },
]

PAINT_TARGETS = [
    {
        "block": "block_36", "strokeLine": "line_36_0", "fillLine": "line_36_1",
        "text": "+1", "font": "Cinzel-Regular", "size": 7.9548,
        "bbox": [610.4713, 674.9630, 617.4238, 685.6860],
        "traceBBox": [610.4713, 676.9672, 617.4238, 684.9221],
        "strokeHex": "#231f20", "fillHex": "#ffffff", "strokeWidth": 1.193,
        "strokeRgb": [0.1366903, 0.1219501, 0.1252918], "fillRgb": [1.0, 1.0, 1.0],
    },
    {
        "block": "block_53", "strokeLine": "line_53_0", "fillLine": "line_53_1",
        "text": "29", "font": "OptimaLTStd-ExtraBlack", "size": 10.0,
        "bbox": [758.2938, 775.7185, 770.1538, 787.9785],
        "traceBBox": [758.2938, 777.4900, 770.1538, 787.4900],
        "strokeHex": "#fff574", "fillHex": "#231f20", "strokeWidth": 1.5,
        "strokeRgb": [1.0, 0.9612879, 0.4567483], "fillRgb": [0.1366903, 0.1219501, 0.1252918],
    },
]


def close_values(actual, expected, tolerance: float = 0.005) -> bool:
    return len(actual) == len(expected) and all(abs(a - b) < tolerance for a, b in zip(actual, expected))


def validate_paint_pairs(page: pymupdf.Page, data: dict) -> list[tuple[dict, dict, dict]]:
    traces = page.get_texttrace()
    result = []
    for target in PAINT_TARGETS:
        block = next((b for b in data["blocks"] if b["id"] == target["block"]), None)
        if block is None:
            raise ValueError(f"Missing paint-pair block: {target['block']}")
        spans = []
        for line_id, color in [(target["strokeLine"], target["strokeHex"]), (target["fillLine"], target["fillHex"])]:
            line = next((l for l in block["lines"] if l["id"] == line_id), None)
            if line is None or len(line["spans"]) != 1 or not close_values(line["bbox"], target["bbox"]):
                raise ValueError(f"Paint-pair geometry changed: {line_id}")
            span = line["spans"][0]
            if (span["text"] != target["text"] or span["font"] != target["font"]
                    or span["color"].lower() != color or abs(span["size"] - target["size"]) > 0.005):
                raise ValueError(f"Paint-pair span changed: {line_id}")
            spans.append(span)
        found = [t for t in traces if t["font"] == target["font"]
                 and "".join(chr(c[0]) for c in t["chars"]) == target["text"]
                 and close_values(t["bbox"], target["traceBBox"])]
        if len(found) != 2:
            raise ValueError(f"Expected exactly two source paint passes: {target['text']}")
        for role, color in [(1, target["strokeRgb"]), (0, target["fillRgb"])]:
            passes = [t for t in found if t["type"] == role]
            if len(passes) != 1 or not close_values(passes[0]["color"], color, 0.0001):
                raise ValueError(f"Source paint pass changed: {target['text']} role={role}")
            if role == 1 and abs(passes[0].get("linewidth", 0) - target["strokeWidth"]) > 0.0001:
                raise ValueError(f"Source stroke width changed: {target['text']}")
        result.append((target, spans[0], spans[1]))
    return result


def main() -> None:
    page_data = json.loads((PAGE_DIR / "page_029_dom.json").read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR.read_text(encoding="utf-8")) if SIDECAR.exists() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise ValueError("Invalid p.29 overlay sidecar")

    with pymupdf.open(PDF) as document:
        page = document[28]
        if abs(page.rect.width - 820.346) > 0.01 or abs(page.rect.height - 820.346) > 0.01:
            raise ValueError(f"Unexpected source page dimensions: {page.rect}")
        drawings = page.get_drawings()
        paint_pairs = validate_paint_pairs(page, page_data)

        # Validate all targets before writing any asset.
        for target in TARGETS:
            matches = [drawing for drawing in drawings if
                       max(abs(a - b) for a, b in zip(drawing["rect"], target["vectorBBox"])) < 0.005]
            if len(matches) != 1 or matches[0]["fill"] is None:
                raise ValueError(f"Source vector changed: {target['region']}")
            if max(abs(a - b) for a, b in zip(matches[0]["fill"], target["fill"])) > 0.0001:
                raise ValueError(f"Source vector fill changed: {target['region']}")
            crop = pymupdf.Rect(target["bbox"])
            if not crop.contains(matches[0]["rect"]):
                raise ValueError(f"Crop truncates source vector: {target['region']}")
            for block in page_data["blocks"]:
                for line in block.get("lines", []):
                    if crop.intersects(pymupdf.Rect(line["bbox"])):
                        raise ValueError(f"Crop intersects DOM text: {target['region']} {block['id']}/{line['id']}")

        for target in TARGETS:
            filename = f"fidelity-overlay-component-page29-{target['region']}.png"
            pix = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), clip=pymupdf.Rect(target["bbox"]), alpha=False)
            # Avoid rescaling fractional clip extents into a different page frame.
            actual_bbox = [pix.x / SCALE, pix.y / SCALE,
                           (pix.x + pix.width) / SCALE, (pix.y + pix.height) / SCALE]
            if actual_bbox != target["bbox"]:
                raise ValueError(f"Crop is not on the raster grid: {actual_bbox}")
            pix.save(PAGE_DIR / filename)
            url = f"/pages/page_029/{filename}"
            sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
            sidecar["overlays"].append({
                "url": url,
                "bbox": actual_bbox,
                "widthPx": pix.width,
                "heightPx": pix.height,
                "language": "en",
                "languageInvariant": True,
                "auditId": AUDIT_ID,
                "category": "fixed-artwork",
                "sourcePdfPage": 29,
                "region": target["region"],
                "evidenceRef": EVIDENCE,
            })
            print(f"{target['region']}: {pix.width}x{pix.height} bbox={actual_bbox}")

    for target, stroke, fill in paint_pairs:
        stroke["renderOnlyStrokePass"] = True
        stroke["sourcePaintRole"] = "stroke-only"
        stroke["sourcePaintAuditId"] = AUDIT_ID
        fill["renderTextStrokeWidthPt"] = target["strokeWidth"]
        fill["renderTextStrokeColor"] = target["strokeHex"]
        fill["sourcePaintRole"] = "fill-with-source-stroke"
        fill["sourcePaintAuditId"] = AUDIT_ID

    dom_path = PAGE_DIR / "page_029_dom.json"
    updated = json.dumps(page_data, ensure_ascii=False, indent=2) + "\n"
    if dom_path.read_text(encoding="utf-8") != updated:
        backup = ROOT / "tmp/page29-fixed-artwork/page_029_dom-before.json"
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            backup.write_bytes(dom_path.read_bytes())
        dom_path.write_text(updated, encoding="utf-8")

    SIDECAR.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("3 source crops registered for EN/PT-BR; 2 source stroke/fill pairs mapped; zero ghosts suppressed.")


if __name__ == "__main__":
    main()
