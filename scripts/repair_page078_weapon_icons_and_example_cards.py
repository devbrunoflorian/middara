#!/usr/bin/env python3
"""Restore confirmed p.78 weapon glyphs, card crops, and title flourishes.

The source PDF draws white weapon glyphs in black circles as vector paths. The
page background extraction retained the dark circles but lost their white
interiors, so exact, textless crops restore those icons without suppressing
editable prose. The two gear cards are complete printed game components; their
source-language duplicate text is covered by exact card-frame crops only in EN.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_NUMBER = 78
AUDIT_ID = "2026-10-04-p078-weapon-glyphs-cards-and-title-ornaments-v1"
PAGE_DIR = ROOT / "apps/web/public/pages/page_078"
DOM_PATH = PAGE_DIR / "page_078_dom.json"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"

# White stroke rectangles around the printed physical cards in the source PDF.
CARD_REGIONS = {
    "scythe-example-card": {
        "bbox": [448.94, 379.96, 558.78, 548.50],
        "frame_color": (1.0, 1.0, 1.0),
        "region": "printed Scythe gear card in the Gigas Grip example",
    },
    "rhamsted-knight-shield-example-card": {
        "bbox": [584.96, 379.96, 694.80, 548.50],
        "frame_color": (1.0, 1.0, 1.0),
        "region": "printed Rhamsted Knight's Shield gear card in the Gigas Grip example",
    },
}

TITLE_FLOURISHES = {
    "gigas-grip-example-left-flourish": [429.75, 349.07, 454.77, 369.98],
    "gigas-grip-example-right-flourish": [689.87, 349.07, 714.89, 369.98],
}

# Exact source vector bboxes for black base shapes that contain white pictograms.
# They sit in extracted-text gaps, so no prose line is hidden or replaced.
WEAPON_GLYPHS = {
    "two-handed-weapon-inline": [304.73, 139.37, 318.65, 152.27],
    "melee-weapon-inline-01": [84.19, 152.53, 95.53, 163.86],
    "melee-ranged-weapon-inline-01": [144.43, 152.53, 155.77, 163.86],
    "one-handed-weapon-inline": [336.20, 151.37, 350.12, 164.27],
    "melee-weapon-inline-02": [243.08, 251.70, 254.42, 263.03],
    "melee-weapon-inline-03": [381.50, 251.70, 392.84, 263.03],
    "melee-ranged-weapon-inline-02": [224.93, 262.70, 236.27, 274.03],
    "melee-ranged-weapon-inline-03": [103.77, 273.70, 115.11, 285.03],
    "melee-weapon-inline-04": [357.07, 296.70, 368.41, 308.03],
    "ranged-weapon-inline-01": [330.06, 307.70, 341.40, 319.03],
    "ranged-weapon-inline-02": [272.19, 355.37, 283.53, 366.70],
    "melee-ranged-weapon-inline-04": [149.90, 366.37, 161.24, 377.70],
    "melee-weapon-inline-05": [173.24, 556.70, 184.58, 568.04],
    "melee-weapon-inline-06": [370.46, 556.70, 381.80, 568.04],
    "melee-weapon-inline-07": [239.54, 600.70, 250.88, 612.04],
    "melee-ranged-weapon-inline-05": [160.47, 611.70, 171.81, 623.04],
    "melee-ranged-weapon-inline-06": [149.90, 709.37, 161.24, 720.71],
    "melee-ranged-weapon-inline-07": [305.56, 709.37, 316.90, 720.71],
    "ranged-weapon-inline-03": [257.68, 720.37, 269.02, 731.71],
    "melee-weapon-inline-example-column": [537.41, 615.55, 548.75, 626.89],
}

# The hand glyphs also include a printed count as part of the pictogram. The
# PDF stores that digit as text outside the dark vector base, so the crop must
# include the full digit to avoid leaving half of the source glyph duplicated.
WEAPON_GLYPH_CROPS = {
    "two-handed-weapon-inline": [304.73, 139.37, 321.72, 156.88],
    "one-handed-weapon-inline": [336.20, 151.37, 352.07, 168.88],
}

DARK_ICON_FILL = (0.13669031858444214, 0.12195010483264923, 0.1252918243408203)


def close_bbox(left: list[float] | tuple[float, ...], right: list[float], tolerance: float = 0.04) -> bool:
    return len(left) == len(right) == 4 and all(abs(float(a) - float(b)) <= tolerance for a, b in zip(left, right))


def intersects(inner: list[float], outer: list[float]) -> bool:
    return inner[0] < outer[2] and inner[2] > outer[0] and inner[1] < outer[3] and inner[3] > outer[1]


def contained(inner: list[float], outer: list[float], tolerance: float = 0.08) -> bool:
    return (
        inner[0] >= outer[0] - tolerance and inner[1] >= outer[1] - tolerance
        and inner[2] <= outer[2] + tolerance and inner[3] <= outer[3] + tolerance
    )


def close_color(left: tuple[float, ...] | None, right: tuple[float, ...], tolerance: float = 1e-4) -> bool:
    return left is not None and len(left) == len(right) and all(abs(a - b) <= tolerance for a, b in zip(left, right))


def line_text(line: dict) -> str:
    return "".join(str(span.get("text", "")) for span in line.get("spans", []))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write source-PDF crops and update p.78 metadata")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)
    if not DOM_PATH.is_file():
        raise FileNotFoundError(DOM_PATH)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8")) if SIDECAR_PATH.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid p.78 overlay sidecar: {SIDECAR_PATH}")
    lines = [line for block in dom.get("blocks", []) for line in block.get("lines", [])]
    planned_suppressions: list[str] = []

    with pymupdf.open(args.pdf) as document:
        page = document[PAGE_NUMBER - 1]
        drawings = page.get_drawings()

        for name, config in CARD_REGIONS.items():
            bbox = config["bbox"]
            if not any(
                close_bbox(tuple(drawing["rect"]), bbox)
                and close_color(drawing.get("color"), config["frame_color"])
                for drawing in drawings
            ):
                raise SystemExit(f"Source card frame changed or is missing: {name} {bbox}")

            intersecting = [line for line in lines if intersects(line["bbox"], bbox)]
            crossing = [line for line in intersecting if not contained(line["bbox"], bbox)]
            if crossing:
                refs = [f"{line.get('id')} {line.get('bbox')} {line_text(line)[:60]!r}" for line in crossing]
                raise SystemExit(f"Refusing to suppress text crossing {name} crop: {refs}")

            for line in intersecting:
                if not line.get("rasterizedDuplicate") or line.get("rasterizedDuplicateLanguage") != "en":
                    planned_suppressions.append(f"{name}: {line.get('id')} {line_text(line)[:48]!r}")
                if args.apply:
                    line["rasterizedDuplicate"] = True
                    line["rasterizedDuplicateLanguage"] = "en"
                    line["rasterizedDuplicateReason"] = f"p.78 {config['region']} restored from an exact source-PDF crop"
                    line["rasterizedDuplicateEvidence"] = {
                        "auditId": AUDIT_ID,
                        "sourcePdfPage": PAGE_NUMBER,
                        "region": name,
                        "rule": "preserve extracted card text for translation; suppress only duplicate EN rendering over the printed component",
                        "evidenceRef": "docs/QA/drafts/2026-10-03-bookwide-visual-review-batch.md",
                    }

            if args.apply:
                filename = f"fidelity-overlay-component-{name}.png"
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(args.scale, args.scale), clip=pymupdf.Rect(*bbox), alpha=False)
                pixmap.save(str(PAGE_DIR / filename))
                url = f"/pages/page_078/{filename}"
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": bbox,
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "language": "en",
                    "auditId": AUDIT_ID,
                    "category": "component-artwork",
                    "sourcePdfPage": PAGE_NUMBER,
                    "region": config["region"],
                })

        for name, bbox in TITLE_FLOURISHES.items():
            if not any(
                drawing.get("fill") is not None
                and close_color(drawing.get("fill"), (1.0, 1.0, 1.0))
                and close_bbox(tuple(drawing["rect"]), bbox)
                for drawing in drawings
            ):
                raise SystemExit(f"Source PDF white title ornament changed or is missing: {name} {bbox}")
            if args.apply:
                filename = f"fidelity-overlay-decoration-{name}.png"
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(args.scale, args.scale), clip=pymupdf.Rect(*bbox), alpha=False)
                pixmap.save(str(PAGE_DIR / filename))
                url = f"/pages/page_078/{filename}"
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": bbox,
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "language": "en",
                    "languageInvariant": True,
                    "auditId": AUDIT_ID,
                    "category": "page-ornament",
                    "sourcePdfPage": PAGE_NUMBER,
                    "region": "white vector flourish around the Gigas Grip Example title",
                })

        for name, bbox in WEAPON_GLYPHS.items():
            if not any(
                close_color(drawing.get("fill"), DARK_ICON_FILL)
                and close_bbox(tuple(drawing["rect"]), bbox)
                for drawing in drawings
            ):
                raise SystemExit(f"Source weapon icon changed or is missing: {name} {bbox}")
            if args.apply:
                crop_bbox = WEAPON_GLYPH_CROPS.get(name, bbox)
                filename = f"fidelity-overlay-component-{name}.png"
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(args.scale, args.scale), clip=pymupdf.Rect(*crop_bbox), alpha=False)
                pixmap.save(str(PAGE_DIR / filename))
                url = f"/pages/page_078/{filename}"
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": crop_bbox,
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "language": "en",
                    "languageInvariant": True,
                    "auditId": AUDIT_ID,
                    "category": "component-icons",
                    "sourcePdfPage": PAGE_NUMBER,
                    "region": "black source-PDF weapon glyph and its white internal pictogram, with no text",
                })

    if args.apply:
        DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"p.{PAGE_NUMBER}: planned card text suppressions={len(planned_suppressions)}; "
        f"card crops={len(CARD_REGIONS)}; title flourishes={len(TITLE_FLOURISHES)}; "
        f"weapon glyph crops={len(WEAPON_GLYPHS)}; applied={args.apply}"
    )
    for item in planned_suppressions:
        print(f"  suppress EN duplicate: {item}")


if __name__ == "__main__":
    main()
