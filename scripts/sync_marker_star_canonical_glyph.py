#!/usr/bin/env python3
"""Restore marker.star from the horizontal glyph embedded in the source PDF.

Dry-run by default. --apply replaces only the placement-rotated registry
prototype and clears the temporary p. 49 selectors. Page art and translations
are untouched; all two adapted placements must prove the same source signature.
"""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import pymupdf as fitz
from fontTools.cffLib import CFFFontSet
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
PAGE_DIR = ROOT / "apps/web/public/pages"
PAGE_NUMBER = 49
SYMBOL_ID = "marker.star"
TEMPORARY_VARIANT_ID = "zapf-u2726-horizontal"
UNICODE = 0x2726
GLYPH_ID = 7
EXPECTED_COUNT = 2
TOLERANCE = 0.001


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def close(a: float, b: float, tolerance: float = TOLERANCE) -> bool:
    return abs(float(a) - float(b)) <= tolerance


def source_char(page, entry: dict):
    box = fitz.Rect(entry["bbox"])
    matches = []
    for span in page.get_texttrace():
        for char in span["chars"]:
            if char[0] == UNICODE and char[1] == GLYPH_ID and fitz.Rect(char[3]).intersects(box):
                if max(abs(float(a) - float(b)) for a, b in zip(char[3], box)) <= TOLERANCE:
                    matches.append((span, char))
    if len(matches) != 1:
        raise ValueError(f"Expected one exact U+2726/GID 7 source character at {entry['bbox']}; found {len(matches)}")
    return matches[0]


def source_signature(page, entry: dict) -> tuple[dict, tuple]:
    span, char = source_char(page, entry)
    if span["font"] != "ZapfDingbatsStd":
        raise ValueError(f"Unexpected source font {span['font']!r}")
    if not close(span["size"], 4.1, 1e-4) or not close(span["dir"][0], 1.0, 1e-6) or not close(span["dir"][1], 0.0, 1e-6):
        raise ValueError(f"The p. 49 glyph is no longer horizontal Zapf at 4.1 pt: {span['size']}, {span['dir']}")
    if span["color"] != (1.0, 1.0, 1.0) or span["type"] != 0 or float(span.get("opacity") or 1.0) != 1.0:
        raise ValueError(f"Unexpected glyph paint: color={span['color']}, type={span['type']}, opacity={span.get('opacity')}")
    origin = tuple(float(n) for n in char[2])
    box = fitz.Rect(entry["bbox"])
    size = float(span["size"])
    offsets = ((origin[0] - box.x0) / size, (origin[1] - box.y0) / size)
    metrics = entry.get("metrics")
    if not metrics or not all(k in metrics for k in ("widthEm", "heightEm", "verticalAlignEm")):
        raise ValueError("Occurrence must retain its source-measured box and baseline metrics")
    return metrics, offsets


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the canonical CFF glyph to the registry")
    args = parser.parse_args()

    if not PDF.is_file():
        raise FileNotFoundError(f"Source PDF not found: {PDF}")
    registry = read_json(REGISTRY_PATH)
    symbol = next((item for item in registry if item.get("id") == SYMBOL_ID), None)
    if symbol is None:
        raise ValueError(f"Registry entry not found: {SYMBOL_ID}")

    occurrences = []
    for sidecar_path in sorted(PAGE_DIR.glob("page_*/inline_elements.json")):
        sidecar = read_json(sidecar_path)
        for element in sidecar.get("elements", []):
            if element.get("symbolId") == SYMBOL_ID:
                occurrences.append((sidecar_path, sidecar, element))
    if len(occurrences) != EXPECTED_COUNT or any(path.parent.name != "page_049" for path, _, _ in occurrences):
        raise ValueError(f"Expected exactly two p. 49 {SYMBOL_ID} adapters; found {len(occurrences)}")

    doc = fitz.open(PDF)
    page = doc[PAGE_NUMBER - 1]
    fonts = [font for font in page.get_fonts(full=True) if font[3].endswith("ZapfDingbatsStd")]
    font_xrefs = sorted({font[0] for font in fonts})
    if len(font_xrefs) != 1:
        raise ValueError(f"Expected one embedded Zapf font resource on p. 49; found xrefs {font_xrefs}")
    font_name, extension, font_type, font_data = doc.extract_font(font_xrefs[0])
    if extension != "cff" or font_type != "Type1" or "ZapfDingbatsStd" not in font_name:
        raise ValueError(f"Unexpected embedded source font: {font_name} / {extension} / {font_type}")

    font_set = CFFFontSet()
    font_set.decompile(io.BytesIO(font_data), None)
    top = font_set[font_set.fontNames[0]]
    if list(top.FontMatrix) != [0.001, 0, 0, 0.001, 0, 0]:
        raise ValueError(f"Unsupported source FontMatrix: {top.FontMatrix}")
    if top.charset[GLYPH_ID] != "uni2726":
        raise ValueError(f"Expected embedded GID 7 to be uni2726; found {top.charset[GLYPH_ID]}")

    signatures = [source_signature(page, entry) for _, _, entry in occurrences]
    first_metrics, first_offsets = signatures[0]
    for metrics, offsets in signatures[1:]:
        if any(not close(metrics[k], first_metrics[k], 1e-6) for k in ("widthEm", "heightEm", "verticalAlignEm")):
            raise ValueError("The p. 49 stars do not share the same source cell and baseline")
        if any(not close(a, b, 1e-6) for a, b in zip(offsets, first_offsets)):
            raise ValueError("The p. 49 stars have different glyph origins inside their source cells")

    # Extract the unrotated font outline. The p. 4 registry prototype includes
    # that placement's -10 degree text matrix, so it is not the canonical glyph.
    pen = SVGPathPen(None)
    top.CharStrings[top.charset[GLYPH_ID]].draw(
        TransformPen(pen, (0.001, 0, 0, -0.001, *first_offsets))
    )
    path = pen.getCommands()
    width_em = float(first_metrics["widthEm"])
    height_em = float(first_metrics["heightEm"])
    vertical_align_em = float(first_metrics["verticalAlignEm"])
    canonical_view_box = [0, 0, width_em, height_em]
    canonical_path = {"d": path, "fill": "currentColor"}

    render = symbol.setdefault("render", {})
    old_render = {
        "viewBox": render.get("viewBox"),
        "paths": render.get("paths"),
        "widthEm": render.get("widthEm"),
        "heightEm": render.get("heightEm"),
        "verticalAlignEm": render.get("verticalAlignEm"),
    }
    canonical_render = {
        "viewBox": canonical_view_box,
        "paths": [canonical_path],
        "widthEm": width_em,
        "heightEm": height_em,
        "verticalAlignEm": vertical_align_em,
    }
    is_canonical = all(old_render[k] == v for k, v in canonical_render.items())
    if not is_canonical:
        old_is_placement_path = (
            symbol.get("source", {}).get("page") == 4
            and render.get("viewBox") == [0, 0, 1.3519287109375, 1.58984375]
            and len(render.get("paths", [])) == 1
            and render["paths"][0].get("transform", "").startswith("matrix(1.3948 -0.2459 -0.2459 -1.3948")
        )
        temporary_variants = render.get("variants", {})
        allowed_variant = temporary_variants.get(TEMPORARY_VARIANT_ID)
        if not old_is_placement_path or set(temporary_variants) - {TEMPORARY_VARIANT_ID}:
            raise ValueError("Registry no longer contains the audited p. 4 placement prototype")
        if allowed_variant is not None and not all(allowed_variant.get(k) == v for k, v in canonical_render.items()):
            raise ValueError("Temporary p. 49 variant differs from the source-derived canonical glyph")

    for _, _, element in occurrences:
        metrics = element.get("metrics", {})
        if metrics.get("renderVariant") not in (None, TEMPORARY_VARIANT_ID):
            raise ValueError(f"Unexpected existing star render variant: {metrics.get('renderVariant')!r}")

    symbol["source"]["page"] = PAGE_NUMBER
    symbol["source"]["bboxPt"] = list(occurrences[0][2]["bbox"])
    render.update(canonical_render)
    render.pop("variants", None)
    changed_selectors = 0
    for _, _, element in occurrences:
        if element.get("metrics", {}).pop("renderVariant", None) is not None:
            changed_selectors += 1

    print(f"Embedded source: {font_name}; resource xref {font_xrefs[0]}; CFF GID {GLYPH_ID}; U+{UNICODE:04X}")
    print(f"Verified family: {len(occurrences)}/{EXPECTED_COUNT} p. 49 occurrences; same horizontal matrix, white fill, size and cell metrics")
    print(f"Canonical SVG path: {len(path)} characters; viewBox {width_em:.9f} x {height_em:.9f}; baseline {vertical_align_em:.9f} em")
    print(f"Mode: {'apply' if args.apply else 'dry-run'}; stale per-placement selectors to clear: {changed_selectors}")
    if args.apply:
        write_json(REGISTRY_PATH, registry)
        for sidecar_path, sidecar in {path: data for path, data, _ in occurrences}.items():
            write_json(sidecar_path, sidecar)


if __name__ == "__main__":
    main()
