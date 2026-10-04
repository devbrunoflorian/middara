"""Repair outlined combatant tags and curved stat labels on p.72.

The PDF paints COMMAND / INTELLIGENT as a dark stroke pass plus an orange or
green fill. Keep the colored text editable and transfer the stroke to it.
HEALTH and DEFENSE are printed along arcs above their scaling icons; extraction
splits these labels into individually positioned letters which the browser
cannot faithfully render as normal straight text. Preserve those source
letters for Admin/translation data and restore the visible labels from exact
source-PDF crops.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = 72
AUDIT_ID = "2026-10-04-p072-tags-and-curved-stat-labels-v1"
PAGE_DIR = ROOT / "apps/web/public/pages/page_072"
DOM = PAGE_DIR / "page_072_dom.json"
SIDECAR = PAGE_DIR / "fidelity_overlays.json"

STROKE_PASSES = {
    ("block_70", "line_70_3", 3): "COMMAND",
    ("block_70", "line_70_4", 2): "INTELLIGENT",
    ("block_71", "line_71_0", 0): "COMMAND",
    ("block_71", "line_71_3", 1): "COMMAND",
    ("block_72", "line_72_0", 0): "COMMAND ",
    ("block_92", "line_92_0", 0): "INTELLIGENT ",
    ("block_93", "line_93_0", 1): "INTELLIGENT ",
}
FILL_PASSES = {
    ("block_70", "line_70_4", 0): ("COMMAND", "#f8951d"),
    ("block_70", "line_70_5", 0): ("INTELLIGENT", "#b5d333"),
    ("block_71", "line_71_1", 0): ("COMMAND", "#f8951d"),
    ("block_71", "line_71_4", 0): ("COMMAND", "#f8951d"),
    ("block_72", "line_72_1", 0): ("COMMAND ", "#f8951d"),
    ("block_92", "line_92_1", 0): ("INTELLIGENT ", "#b5d333"),
    ("block_93", "line_93_1", 0): ("INTELLIGENT ", "#b5d333"),
}
SOURCE_GEOMETRY_LINES = {
    (block, line)
    for block, line, _ in STROKE_PASSES
} | {
    (block, line)
    for block, line, _ in FILL_PASSES
}
CURVED_LABELS = {
    "health": {
        "bbox": [109.53900146484375, 547.8759765625, 141.4290008544922, 586.5690307617188],
        "blocks": {"block_56": [f"line_56_{i}" for i in range(6)]},
        "expected": "HEALTH",
    },
    "defense": {
        "bbox": [109.53900146484375, 737.9600219726562, 141.4290008544922, 776.6530151367188],
        "blocks": {"block_34": [f"line_34_{i}" for i in range(7)]},
        "expected": "DEFENSE",
    },
}
SOURCE_SYMBOL_OVERLAYS = {
    "combat-dice-symbols": {
        "bbox": [96.1729965209961, 320.5805358886719, 154.7949981689453, 348.59600830078125],
        "spans": [("block_15", "line_15_0", 0), ("block_18", "line_18_0", 0)],
        "languageInvariant": True,
        "region": "combat-dice scaling symbols",
    },
    "combat-dice-caption": {
        "bbox": [116.9, 309.5, 132.9, 318.3],
        "spans": [("block_16", "line_16_0", 0, "COMBAT"), ("block_16", "line_16_1", 0, "DICE")],
        "languageInvariant": False,
        "region": "combat-dice component caption",
    },
    "conviction-symbols": {
        "bbox": [141.0, 370.0, 162.5, 386.0],
        "spans": [("block_31", "line_31_0", 1), ("block_31", "line_31_0", 3)],
        "languageInvariant": True,
        "region": "conviction scaling symbols",
    },
    "conviction-label": {
        "bbox": [91.81179809570312, 371.1882019042969, 140.8188018798828, 385.564208984375],
        "spans": [("block_31", "line_31_0", 0, "CONVICTION:")],
        "languageInvariant": False,
        "region": "conviction scaling-icon label",
    },
    "casting-symbol": {
        "bbox": [137.95, 419.747314453125, 146.6488037109375, 434.1233215332031],
        "spans": [("block_80", "line_80_0", 1)],
        "languageInvariant": True,
        "region": "casting scaling symbol",
    },
    "casting-label": {
        "bbox": [99.8, 419.6, 138.1, 434.2],
        "spans": [("block_80", "line_80_0", 0, "CASTING: -")],
        "languageInvariant": False,
        "region": "casting scaling-icon label",
    },
    "symbol-ability-icons": {
        "bbox": [87.44599914550781, 665.10400390625, 118.10079956054688, 680.9240112304688],
        "spans": [
            ("block_91", "line_91_0", 0),
            ("block_91", "line_91_1", 0),
            ("block_91", "line_91_1", 2),
        ],
        "languageInvariant": True,
        "region": "symbol-ability scaling pictograms",
    },
    "force-row-symbol": {
        "bbox": [158.1790008544922, 480.2406921386719, 167.92005920410156, 491.42401123046875],
        "spans": [("block_102", "line_102_0", 1)],
        "languageInvariant": True,
        "region": "force-value scaling symbol",
    },
    "inline-scaling-star": {
        "bbox": [295.3489990234375, 108.73419189453125, 310.8050231933594, 120.63419342041016],
        "spans": [("block_69", "line_69_0", 1)],
        "languageInvariant": False,
        "region": "inline scaling-icon star",
    },
    "inline-force-star": {
        "bbox": [408.2413024902344, 464.03546142578125, 416.2333068847656, 475.965087890625],
        "spans": [("block_49", "line_49_0", 2)],
        "languageInvariant": False,
        "region": "inline force-value scaling star",
    },
}


def close_bbox(left: list[float], right: list[float], tolerance: float = 0.05) -> bool:
    return len(left) == len(right) == 4 and all(
        abs(float(a) - float(b)) <= tolerance for a, b in zip(left, right)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write p.72 DOM and source crops")
    parser.add_argument("--pdf", type=Path, default=PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()

    dom = json.loads(DOM.read_text(encoding="utf-8"))
    by_id = {block.get("id"): block for block in dom.get("blocks", [])}
    lines = {
        (block.get("id"), line.get("id")): line
        for block in dom.get("blocks", [])
        for line in block.get("lines", [])
    }
    changes: list[str] = []
    stroke_refs: dict[str, set[str]] = {}

    for (block_id, line_id, index), expected in STROKE_PASSES.items():
        line = lines.get((block_id, line_id))
        spans = line.get("spans", []) if line else []
        if index >= len(spans) or spans[index].get("text") != expected:
            actual = spans[index].get("text") if index < len(spans) else "<missing>"
            raise SystemExit(f"Stale p.72 stroke target {block_id}/{line_id}:{index}: {actual!r}")
        span = spans[index]
        if span.get("color", "").lower() != "#231f20" or span.get("font") != "OptimaLTStd-Black":
            raise SystemExit(f"Unexpected p.72 stroke styling at {block_id}/{line_id}:{index}")
        if not span.get("renderOnlyStrokePass"):
            changes.append(f"paint-only {block_id}/{line_id}:{index} {expected}")
            if args.apply:
                span["renderOnlyStrokePass"] = True
        stroke_refs.setdefault(block_id, set()).add(f"{line_id}:{index}")

    for (block_id, line_id, index), (expected, color) in FILL_PASSES.items():
        line = lines.get((block_id, line_id))
        spans = line.get("spans", []) if line else []
        if index >= len(spans) or spans[index].get("text") != expected:
            actual = spans[index].get("text") if index < len(spans) else "<missing>"
            raise SystemExit(f"Stale p.72 fill target {block_id}/{line_id}:{index}: {actual!r}")
        fill = spans[index]
        if fill.get("color", "").lower() != color or fill.get("font") != "OptimaLTStd-Black":
            raise SystemExit(f"Unexpected p.72 fill styling at {block_id}/{line_id}:{index}")

    for (stroke_block, stroke_line, stroke_index), (fill_block, fill_line, fill_index) in zip(
        STROKE_PASSES, FILL_PASSES, strict=True
    ):
        stroke = lines[(stroke_block, stroke_line)]["spans"][stroke_index]
        fill = lines[(fill_block, fill_line)]["spans"][fill_index]
        if not close_bbox(stroke["bbox"], fill["bbox"]):
            raise SystemExit(f"p.72 tag paint bboxes differ: {stroke['bbox']} / {fill['bbox']}")
        if fill.get("renderTextStrokeWidthPt") != 2.0 or fill.get("renderTextStrokeColor") != "#231f20":
            changes.append(f"outlined color fill {fill_block}/{fill_line}:{fill_index}")
            if args.apply:
                fill["renderTextStrokeWidthPt"] = 2.0
                fill["renderTextStrokeColor"] = "#231f20"

    for block_id, line_id in SOURCE_GEOMETRY_LINES:
        line = lines[(block_id, line_id)]
        if not line.get("renderSourceSpanGeometry"):
            changes.append(f"source advances {block_id}/{line_id}")
            if args.apply:
                line["renderSourceSpanGeometry"] = True

    # These punctuation-like source spans stand in for game pictograms. The
    # exact PDF icon remains visible in the overlay while the source `*` stays
    # in the structured data for translation/editor provenance.
    for name, config in SOURCE_SYMBOL_OVERLAYS.items():
        for span_ref in config["spans"]:
            block_id, line_id, index = span_ref[:3]
            expected_text = span_ref[3] if len(span_ref) > 3 else "*"
            line = lines.get((block_id, line_id))
            spans = line.get("spans", []) if line else []
            if index >= len(spans) or spans[index].get("text", "").strip() != expected_text:
                actual = spans[index].get("text") if index < len(spans) else "<missing>"
                raise SystemExit(f"Stale p.72 source-icon span {block_id}/{line_id}:{index}: {actual!r}")
            span = spans[index]
            if not span.get("renderAsSourceOverlayDuplicate") or span.get("renderSourceOverlayLanguage") != ("all" if config["languageInvariant"] else "en"):
                changes.append(f"source-icon overlay {block_id}/{line_id}:{index} via {name}")
                if args.apply:
                    span["renderAsSourceOverlayDuplicate"] = True
                    span["renderSourceOverlayLanguage"] = "all" if config["languageInvariant"] else "en"
            if span.get("size", 99) < 4 and not line.get("renderTinyText"):
                changes.append(f"allow tiny localized text {block_id}/{line_id}")
                if args.apply:
                    line["renderTinyText"] = True

    # Keep the comma after the inline force-value symbol at its PDF position.
    force_line = lines[("block_49", "line_49_0")]
    if not force_line.get("renderSourceSpanGeometry"):
        changes.append("source advances block_49/line_49_0")
        if args.apply:
            force_line["renderSourceSpanGeometry"] = True

    for block_id, refs in stroke_refs.items():
        block = by_id[block_id]
        filtered_units = []
        for unit in block.get("typographicSpanUnits", []):
            kept = [ref for ref in unit.get("spanRefs", []) if ref not in refs]
            if kept:
                unit["spanRefs"] = kept
                filtered_units.append(unit)
        if args.apply:
            block["typographicSpanUnits"] = filtered_units

    sidecar = json.loads(SIDECAR.read_text(encoding="utf-8")) if SIDECAR.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid overlay sidecar: {SIDECAR}")

    for name, config in CURVED_LABELS.items():
        chars = ""
        for block_id, line_ids in config["blocks"].items():
            if block_id not in by_id:
                raise SystemExit(f"Missing p.72 block {block_id}")
            for line_id in line_ids:
                line = lines.get((block_id, line_id))
                if line is None:
                    raise SystemExit(f"Missing p.72 line {block_id}/{line_id}")
                chars += "".join(str(span.get("text", "")) for span in line.get("spans", []))
                evidence = {
                    "auditId": AUDIT_ID,
                    "sourcePdfPage": PAGE,
                    "region": f"{name} curved stat-icon label",
                    "rule": "keep extracted letters in source data; suppress straight browser layout",
                    "evidenceRef": "docs/QA/drafts/2026-10-03-bookwide-visual-review-batch.md",
                }
                if not line.get("rasterizedDuplicate"):
                    changes.append(f"source-only {block_id}/{line_id}")
                if args.apply:
                    line["rasterizedDuplicate"] = True
                    line["rasterizedDuplicateReason"] = f"curved {config['expected']} stat-icon label restored from exact source-PDF crop"
                    line["rasterizedDuplicateEvidence"] = evidence
        if chars != config["expected"]:
            raise SystemExit(f"p.72 {name} label mismatch: expected {config['expected']!r}, got {chars!r}")

    if args.apply:
        if not args.pdf.is_file():
            raise FileNotFoundError(args.pdf)
        with pymupdf.open(args.pdf) as document:
            page = document[PAGE - 1]
            for name, config in CURVED_LABELS.items():
                bbox = config["bbox"]
                pixmap = page.get_pixmap(
                    matrix=pymupdf.Matrix(args.scale, args.scale),
                    clip=pymupdf.Rect(*bbox),
                    alpha=False,
                )
                filename = f"fidelity-overlay-component-stat-icon-{name}-curved-label.png"
                asset = PAGE_DIR / filename
                pixmap.save(str(asset))
                url = f"/pages/page_072/{filename}"
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": bbox,
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "language": "en",
                    "languageInvariant": False,
                    "auditId": AUDIT_ID,
                    "category": "component-icons",
                    "sourcePdfPage": PAGE,
                    "region": f"{name} stat icon with curved label",
                })

            for name, config in SOURCE_SYMBOL_OVERLAYS.items():
                bbox = config["bbox"]
                pixmap = page.get_pixmap(
                    matrix=pymupdf.Matrix(args.scale, args.scale),
                    clip=pymupdf.Rect(*bbox),
                    alpha=False,
                )
                filename = f"fidelity-overlay-component-{name}.png"
                asset = PAGE_DIR / filename
                pixmap.save(str(asset))
                url = f"/pages/page_072/{filename}"
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": bbox,
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "language": "en",
                    "languageInvariant": config["languageInvariant"],
                    "auditId": AUDIT_ID,
                    "category": "component-icons",
                    "sourcePdfPage": PAGE,
                    "region": config["region"],
                })

        DOM.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        SIDECAR.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"p.72 plannedChanges={len(changes)} applied={args.apply}")
    for change in changes:
        print(f"  {change}")


if __name__ == "__main__":
    main()
