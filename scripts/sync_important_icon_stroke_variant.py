"""Preserve the fixed 2 pt source outline for small IMPORTANT glyphs.

Dry-run by default. --apply changes only sourceSymbols.json and the matching
inline_elements.json metrics; translations, masks and Payload data are untouched.
"""
from __future__ import annotations

import argparse
import copy
import json
from collections import Counter
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGES = ROOT / "apps/web/public/pages"
REGISTRY = ROOT / "apps/web/src/symbols/sourceSymbols.json"
SYMBOL_ID = "tag.important.icon"
VARIANT = "important-outline-2pt-at-9pt"
EXPECTED_COUNT = 62
EXPECTED_SIZE_COUNTS = {9.0: 2, 10.0: 60}
SOURCE_GLYPH = 0xF07E
SOURCE_GID = 97
SOURCE_FONT = "webdings"
WHITE = (1.0, 1.0, 1.0)
SOURCE_RED = (0.7272602319717407, 0.11531242728233337, 0.13583581149578094)


def close_bbox(first: fitz.Rect, second: fitz.Rect, tolerance: float = 0.015) -> bool:
    return all(abs(a - b) <= tolerance for a, b in zip(first, second))


def trace_pair(trace: list[dict], bbox: tuple[float, ...], page_number: int) -> list[dict]:
    box = fitz.Rect(bbox)
    matches = []
    for span in trace:
        if span.get("font", "").lower() != SOURCE_FONT:
            continue
        for character in span["chars"]:
            codepoint, gid, origin, character_bbox = character
            if codepoint == SOURCE_GLYPH and close_bbox(fitz.Rect(character_bbox), box):
                matches.append((span, gid, origin, character_bbox))
    matches.sort(key=lambda item: item[0]["seqno"])
    if len(matches) != 2:
        raise ValueError(f"Page {page_number} {bbox}: expected two source glyph passes, found {len(matches)}")
    first, second = matches
    a, b = first[0], second[0]
    if (first[1] != SOURCE_GID or second[1] != SOURCE_GID
            or [a.get("type"), b.get("type")] != [1, 0]
            or a.get("color") != WHITE or b.get("color") != SOURCE_RED
            or a.get("linewidth") != 2.0 or b.get("linewidth") is not None
            or a.get("opacity") != 1.0 or b.get("opacity") != 1.0
            or a.get("size") != b.get("size")
            or a.get("seqno") + 1 != b.get("seqno")
            or not close_bbox(fitz.Rect(first[3]), fitz.Rect(second[3]))):
        raise ValueError(f"Page {page_number} {bbox}: source overprint/style changed")
    return [a, b]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    symbols = {symbol["id"]: symbol for symbol in registry}
    symbol = symbols[SYMBOL_ID]
    render = symbol["render"]
    paths = render.get("paths", [])
    if (len(paths) != 2 or paths[0].get("fill") != "none"
            or paths[0].get("stroke") != "#ffffff"
            or paths[1].get("fill") != "#ba1d23"
            or paths[0].get("d") != paths[1].get("d")
            or paths[0].get("transform") != paths[1].get("transform")
            or abs(paths[0].get("strokeWidth", 0) - 0.2) > 1e-9):
        raise ValueError("IMPORTANT base render no longer matches the expected white-stroke/red-fill glyph")

    variant_render = {
        key: copy.deepcopy(render[key])
        for key in ("viewBox", "paths", "widthEm", "heightEm", "verticalAlignEm")
        if key in render
    }
    variant_paths = variant_render["paths"]
    # SVG user units scale by the 10-unit viewBox and the inline font size.
    # Convert the PDF's fixed 2 pt stroke to user units for a 9 pt glyph.
    viewbox_width = float(variant_render["viewBox"][2] - variant_render["viewBox"][0])
    transform_scale_x = 10.0  # source glyph outline transform in the registry
    target_size_pt = 9.0
    width_em = float(render["widthEm"])
    physical_stroke_per_user_unit = transform_scale_x * (target_size_pt * width_em) / viewbox_width
    variant_paths[0]["strokeWidth"] = 2.0 / physical_stroke_per_user_unit
    current_variant = render.get("variants", {}).get(VARIANT)
    if current_variant not in (None, variant_render):
        raise ValueError(f"Conflicting registry variant {VARIANT}")
    render.setdefault("variants", {})[VARIANT] = variant_render

    sidecars = {
        int(path.parent.name.split("_")[1]): (path, json.loads(path.read_text(encoding="utf-8")))
        for path in PAGES.glob("page_*/inline_elements.json")
    }
    observations = []
    size_counts = Counter()
    with fitz.open(PDF) as pdf:
        for page_number, (path, sidecar) in sidecars.items():
            elements = [element for element in sidecar.get("elements", [])
                        if element.get("symbolId") == SYMBOL_ID]
            if not elements:
                continue
            page_trace = pdf[page_number - 1].get_texttrace()
            for element in elements:
                box = tuple(element["bbox"])
                pair = trace_pair(page_trace, box, page_number)
                size_pt = float(pair[0]["size"])
                if abs(float(element.get("anchor", {}).get("sizePt", -1)) - size_pt) > 0.001:
                    raise ValueError(f"Page {page_number} {box}: source anchor size disagrees with text trace")
                size_counts[size_pt] += 1
                expected_variant = VARIANT if size_pt == 9.0 else None
                existing = element.get("metrics", {}).get("renderVariant")
                if existing not in (None, expected_variant):
                    raise ValueError(f"Page {page_number}: conflicting renderVariant {existing}")
                if expected_variant:
                    element.setdefault("metrics", {})["renderVariant"] = expected_variant
                observations.append((page_number, path, sidecar, box, size_pt, expected_variant))

    if len(observations) != EXPECTED_COUNT or size_counts != Counter(EXPECTED_SIZE_COUNTS):
        raise ValueError(f"IMPORTANT source inventory changed: {len(observations)} / {dict(size_counts)}")

    variant_occurrences = [(page, box) for page, _, _, box, _, variant in observations if variant]
    if args.apply:
        REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for page_number in sorted({page for page, _ in variant_occurrences}):
            path, sidecar = sidecars[page_number]
            path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "symbolId": SYMBOL_ID,
        "font": "Webdings",
        "codepoint": f"U+{SOURCE_GLYPH:04X}",
        "glyphId": SOURCE_GID,
        "pairedPassesPerOccurrence": 2,
        "sourceStyle": "2 pt white stroke followed by red fill",
        "occurrences": len(observations),
        "sizePtCounts": dict(size_counts),
        "variant": VARIANT,
        "variantStrokeWidthUserUnits": variant_paths[0]["strokeWidth"],
        "variantOccurrences": [{"page": page, "bbox": box} for page, box in variant_occurrences],
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
