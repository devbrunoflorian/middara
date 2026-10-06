#!/usr/bin/env python3
"""Attach the source-rotated PASSIVE glyph to its matching inline occurrence.

Dry-run by default. The book contains two adapted ``tag.passive.icon`` uses:
the p. 61 glyph is horizontal and keeps the canonical registry render; the p.
66 copy is rotated with a miniature card and receives a per-occurrence render
variant extracted from the embedded Zapf CFF outline. Translations and page
art are never written by this script.
"""
from __future__ import annotations

import argparse
import io
import json
import math
from pathlib import Path

import pymupdf as fitz
from fontTools.cffLib import CFFFontSet
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
PAGE_DIR = ROOT / "apps/web/public/pages"
SYMBOL_ID = "tag.passive.icon"
VARIANT_ID = "zapf-u2724-card-rotated-minus20"
UNICODE = 0x2724
GLYPH_ID = 2
EXPECTED_PAGES = {61, 66}
METRIC_KEYS = ("widthEm", "heightEm", "verticalAlignEm")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def near(actual: float, expected: float, tolerance: float) -> bool:
    return abs(float(actual) - float(expected)) <= tolerance


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def unique_source_character(page, element: dict):
    box = fitz.Rect(element["bbox"])
    matches = []
    for span in page.get_texttrace():
        for char in span["chars"]:
            char_box = fitz.Rect(char[3])
            if char[0] == UNICODE and char[1] == GLYPH_ID and char_box.intersects(box):
                if max(abs(a - b) for a, b in zip(char_box, box)) <= 0.02:
                    matches.append((span, char))
    require(len(matches) == 1,
            f"Expected exactly one source U+{UNICODE:04X}/GID {GLYPH_ID} in {element['bbox']}; found {len(matches)}")
    return matches[0]


def source_signature(page, page_number: int, element: dict) -> dict:
    span, char = unique_source_character(page, element)
    require(span["font"] == "ZapfDingbatsStd", f"p. {page_number}: unexpected font {span['font']!r}")
    require(span["type"] == 0 and tuple(span["color"]) == (1.0, 1.0, 1.0)
            and near(span.get("opacity") or 1.0, 1.0, 1e-6),
            f"p. {page_number}: unsupported paint type/color/opacity")
    direction = tuple(float(value) for value in span["dir"])
    size = float(span["size"])
    if page_number == 61:
        require(near(size, 9.0, 1e-4) and near(direction[0], 1.0, 1e-6)
                and near(direction[1], 0.0, 1e-6),
                "The p. 61 adapter must remain a horizontal 9 pt occurrence")
    elif page_number == 66:
        require(near(size, 4.721017837524414, 1e-4)
                and near(direction[0], 0.9396913647651672, 1e-6)
                and near(direction[1], -0.34202370047569275, 1e-6),
                "The p. 66 adapter must retain the audited -20 degree text matrix")
    else:
        raise ValueError(f"Unexpected PASSIVE source adapter on p. {page_number}")

    metrics = element.get("metrics")
    require(metrics is not None and all(key in metrics for key in METRIC_KEYS),
            f"p. {page_number}: source-measured occurrence metrics are required")
    source_bbox = tuple(float(value) for value in char[3])
    bbox = tuple(float(value) for value in element["bbox"])
    origin = tuple(float(value) for value in char[2])
    anchor_size = float(element["anchor"]["sizePt"])
    require(anchor_size > 0, f"p. {page_number}: invalid anchor size")
    return {
        "page": page_number,
        "spanSizePt": size,
        "direction": direction,
        "color": tuple(span["color"]),
        "font": span["font"],
        "bbox": bbox,
        "traceBbox": source_bbox,
        "origin": origin,
        "anchorSizePt": anchor_size,
        "metrics": {key: float(metrics[key]) for key in METRIC_KEYS},
    }


def transformed_outline(doc, page_number: int, signature: dict) -> tuple[str, str]:
    page = doc[page_number - 1]
    xrefs = sorted({font[0] for font in page.get_fonts(full=True)
                    if "ZapfDingbatsStd" in font[3]})
    outlines = []
    names = []
    box = signature["bbox"]
    origin = signature["origin"]
    dx = (origin[0] - box[0]) / signature["anchorSizePt"]
    dy = (origin[1] - box[1]) / signature["anchorSizePt"]
    scale = signature["spanSizePt"] / signature["anchorSizePt"]
    dir_x, dir_y = signature["direction"]
    matrix = (0.001 * scale * dir_x, 0.001 * scale * dir_y,
              0.001 * scale * dir_y, -0.001 * scale * dir_x, dx, dy)
    for xref in xrefs:
        font_name, extension, font_type, font_data = doc.extract_font(xref)
        require(extension == "cff" and font_type == "Type1" and "ZapfDingbatsStd" in font_name,
                f"Unexpected embedded font xref {xref}: {font_name}/{extension}/{font_type}")
        font_set = CFFFontSet()
        font_set.decompile(io.BytesIO(font_data), None)
        top = font_set[font_set.fontNames[0]]
        require(top.charset[GLYPH_ID] == "uni2724", "The occurrence font no longer maps GID 2 to uni2724")
        require(list(top.FontMatrix) == [0.001, 0, 0, 0.001, 0, 0],
                f"Unsupported CFF FontMatrix: {top.FontMatrix}")
        pen = SVGPathPen(None)
        top.CharStrings[top.charset[GLYPH_ID]].draw(TransformPen(pen, matrix))
        outlines.append(pen.getCommands())
        names.append(font_name)
    require(bool(outlines) and len(set(outlines)) == 1,
            f"p. {page_number}: duplicate Zapf resources disagree on the transformed outline")
    return outlines[0], ", ".join(names)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the p. 66 source-derived render variant")
    args = parser.parse_args()

    require(PDF.is_file(), f"Source PDF not found: {PDF}")
    registry = read_json(REGISTRY_PATH)
    matches = [item for item in registry if item.get("id") == SYMBOL_ID]
    require(len(matches) == 1, f"Expected one registry definition for {SYMBOL_ID}; found {len(matches)}")
    symbol = matches[0]
    render = symbol.get("render", {})
    require(symbol.get("source", {}).get("page") == 59,
            "Canonical PASSIVE icon must remain sourced from the horizontal p. 59 glyph")
    require(render.get("viewBox") and render.get("paths") and len(render["paths"]) == 1,
            "Canonical PASSIVE source render is missing or structurally changed")
    require(not render["paths"][0].get("transform", "").startswith("matrix(0.9397"),
            "The default PASSIVE glyph unexpectedly contains the p. 66 rotation")

    occurrences = []
    for sidecar_path in sorted(PAGE_DIR.glob("page_*/inline_elements.json")):
        sidecar = read_json(sidecar_path)
        try:
            page_number = int(sidecar_path.parent.name.removeprefix("page_"))
        except ValueError:
            continue
        for element in sidecar.get("elements", []):
            if element.get("symbolId") == SYMBOL_ID:
                occurrences.append((page_number, sidecar_path, sidecar, element))
    require({page for page, *_ in occurrences} == EXPECTED_PAGES and len(occurrences) == 2,
            f"Expected exactly two adapters on p. 61 and 66; found {[page for page, *_ in occurrences]}")

    doc = fitz.open(PDF)
    signatures = {}
    for page_number, _, _, element in occurrences:
        signatures[page_number] = source_signature(doc[page_number - 1], page_number, element)
    require(signatures[61]["metrics"] == {"widthEm": 0.7879994710286459, "heightEm": 1.0,
                                           "verticalAlignEm": 0.1484917534722222},
            "The p. 61 source metrics changed; re-audit before applying")
    require(signatures[66]["metrics"] == {"widthEm": 1.0810011167625158, "heightEm": 1.208657384134755,
                                           "verticalAlignEm": 0.13953937049027376},
            "The p. 66 source metrics changed; re-audit before applying")

    source_outline, font_names = transformed_outline(doc, 66, signatures[66])
    variant = {
        "viewBox": [0, 0, signatures[66]["metrics"]["widthEm"], signatures[66]["metrics"]["heightEm"]],
        "paths": [{"d": source_outline, "fill": "currentColor"}],
        "widthEm": signatures[66]["metrics"]["widthEm"],
        "heightEm": signatures[66]["metrics"]["heightEm"],
        "verticalAlignEm": signatures[66]["metrics"]["verticalAlignEm"],
    }

    existing_variants = render.get("variants", {})
    require(not (set(existing_variants) - {VARIANT_ID}),
            f"Unexpected existing PASSIVE render variants: {sorted(set(existing_variants) - {VARIANT_ID})}")
    existing = existing_variants.get(VARIANT_ID)
    require(existing is None or existing == variant,
            "Existing p. 66 rotated PASSIVE variant differs from the source-derived outline")
    for page_number, _, _, element in occurrences:
        selector = element.get("metrics", {}).get("renderVariant")
        if page_number == 61:
            require(selector is None, "Horizontal p. 61 adapter must continue to use the default render")
        else:
            require(selector in (None, VARIANT_ID), f"Unexpected p. 66 renderVariant {selector!r}")

    if args.apply:
        render.setdefault("variants", {})[VARIANT_ID] = variant
        # Install the unused registry render first. If a later sidecar write
        # fails, the live page continues using its old selector/default.
        write_json(REGISTRY_PATH, registry)
        for page_number, sidecar_path, sidecar, element in occurrences:
            if page_number == 66:
                element.setdefault("metrics", {})["renderVariant"] = VARIANT_ID
                write_json(sidecar_path, sidecar)

    angle = math.degrees(math.atan2(signatures[66]["direction"][1], signatures[66]["direction"][0]))
    print(f"Family census: {len(occurrences)}/2 PASSIVE icon adapters on pages 61 and 66")
    print("p. 61: horizontal 9 pt white U+2724/GID 2; default render retained")
    print(f"p. 66: {signatures[66]['spanSizePt']:.6f} pt, {angle:.3f} degrees source matrix; source CFF outline transformed into its measured cell")
    print(f"Embedded font resources: {font_names}; p. 66 vector path: {len(source_outline)} chars; no background path")
    print(f"Mode: {'apply' if args.apply else 'dry-run'}; variant selector: {VARIANT_ID}")


if __name__ == "__main__":
    main()
