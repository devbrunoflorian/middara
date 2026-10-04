"""Restore the exact p.95 tag pills and Dingbats symbols from the source PDF.

The editable tag words remain in the DOM. This repair restores only the rounded
vector pill fills as an under-text SVG and unsupported Zapf glyphs as transparent
source-PDF crops. Dry-run is the default; pass --apply to write the sidecar and
assets.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = 95
PAGE_DIR = ROOT / f"apps/web/public/pages/page_{PAGE:03d}"
DOM_PATH = PAGE_DIR / f"page_{PAGE:03d}_dom.json"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-04-p095-condition-tags-v1"
GLYPH_SCALE = 8.0

# Source drawing rects for the nine PASSIVE/STATUS pills and five DISCARD pills.
EXPECTED_PILLS = [
    (155.087, 85.025, 193.441, 94.210),
    (155.087, 116.846, 197.778, 126.031),
    (155.087, 147.775, 197.778, 156.960),
    (155.087, 184.960, 197.778, 194.145),
    (155.087, 285.744, 193.441, 294.929),
    (155.087, 315.819, 197.778, 325.004),
    (155.087, 397.613, 197.778, 406.798),
    (155.087, 427.542, 197.778, 436.727),
    (155.087, 475.251, 193.441, 484.436),
    (519.906, 76.239, 558.260, 85.424),
    (519.906, 131.352, 558.260, 140.537),
    (519.906, 161.714, 558.260, 170.899),
    (519.906, 190.842, 558.260, 200.027),
    (519.906, 229.050, 558.260, 238.235),
]

# Every unsupported Zapf Dingbats span on this page is accounted for. Fourteen
# are the icons in pill tags; two inline X glyphs appear before DISCARD in prose.
GLYPH_TARGETS = [
    ("block_7", "line_7_0", 0, "\u271c ", "#ffffff"),
    ("block_10", "line_10_0", 0, "\u2724", "#ffffff"),
    ("block_13", "line_13_0", 0, "\u2724", "#ffffff"),
    ("block_16", "line_16_0", 0, "\u2724", "#ffffff"),
    ("block_16", "line_16_4", 0, "\u2718", "#231f20"),
    ("block_20", "line_20_0", 0, "\u271c ", "#ffffff"),
    ("block_23", "line_23_0", 0, "\u2724", "#ffffff"),
    ("block_28", "line_28_0", 0, "\u2724", "#ffffff"),
    ("block_31", "line_31_0", 0, "\u2724", "#ffffff"),
    ("block_32", "line_32_0", 0, "\u2718", "#231f20"),
    ("block_35", "line_35_0", 0, "\u271c ", "#ffffff"),
    ("block_59", "line_59_0", 0, "\u2718", "#ffffff"),
    ("block_62", "line_62_0", 0, "\u2718", "#ffffff"),
    ("block_64", "line_64_0", 0, "\u2718", "#ffffff"),
    ("block_66", "line_66_0", 0, "\u2718", "#ffffff"),
    ("block_68", "line_68_0", 0, "\u2718", "#ffffff"),
]

# Small vector pictograms that the page background's text cleanup removed along
# with nearby prose. These exact crops contain no printed words; text remains
# editable in the DOM. The purple die and Barrier icon are already present.
SOURCE_COMPONENT_CROPS = [
    ("black-die-after-black", (213.380, 95.560, 223.450, 107.180)),
    ("skull-after-result-is-the", (305.510, 94.950, 313.850, 106.510)),
    ("courage-attack-die", (231.780, 438.150, 242.350, 448.730)),
    ("courage-defense-shield", (286.790, 438.830, 296.050, 448.730)),
    ("courage-status-square", (317.580, 438.660, 326.900, 448.730)),
]
EXPECTED_COMPONENT_DRAWINGS = [
    (155, (213.380, 95.560, 223.450, 107.180)),
    (159, (305.510, 94.950, 313.850, 104.000)),
    (160, (307.130, 102.770, 312.400, 106.510)),
    (184, (231.780, 438.150, 242.350, 448.730)),
    (188, (286.790, 438.830, 296.050, 448.730)),
    (191, (317.580, 438.660, 326.900, 448.730)),
]


def rect_values(rect: pymupdf.Rect) -> tuple[float, float, float, float]:
    return tuple(round(value, 3) for value in (rect.x0, rect.y0, rect.x1, rect.y1))


def close_rect(left: tuple[float, ...], right: tuple[float, ...], tolerance: float = 0.003) -> bool:
    return len(left) == len(right) == 4 and all(abs(a - b) <= tolerance for a, b in zip(left, right))


def build_pill_svg(page_width: float, page_height: float, rects: list[tuple[float, float, float, float]]) -> str:
    pills = []
    for x0, y0, x1, y1 in rects:
        width = x1 - x0
        height = y1 - y0
        pills.append(
            f'<rect x="{x0:.3f}" y="{y0:.3f}" width="{width:.3f}" height="{height:.3f}" '
            f'rx="{height / 2:.4f}" fill="#231f20"/>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1710" height="1710" '
        f'viewBox="0 0 {page_width:.6f} {page_height:.6f}">'
        + "".join(pills)
        + "</svg>\n"
    )


def glyph_alpha(gray: np.ndarray, expected_color: str) -> np.ndarray:
    border = np.concatenate((gray[0, :], gray[-1, :], gray[:, 0], gray[:, -1]))
    background = float(np.median(border))
    if expected_color.lower() == "#ffffff":
        threshold = max(48.0, background + 12.0)
        alpha = np.clip((gray - threshold) * (255.0 / (255.0 - threshold)), 0, 255)
    else:
        threshold = min(220.0, background - 12.0)
        alpha = np.clip((threshold - gray) * (255.0 / threshold), 0, 255)
    return np.rint(alpha).astype(np.uint8)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the SVG/PNG assets, flags, and sidecar")
    parser.add_argument("--pdf", type=Path, default=PDF)
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if dom.get("page_number") != PAGE:
        raise SystemExit("p.95 DOM page number mismatch")

    span_index = {}
    for block in dom.get("blocks", []):
        for line in block.get("lines", []):
            for index, span in enumerate(line.get("spans", [])):
                span_index[(block["id"], line["id"], index)] = span

    for block_id, line_id, index, expected_text, expected_color in GLYPH_TARGETS:
        key = (block_id, line_id, index)
        span = span_index.get(key)
        if span is None or span.get("text") != expected_text:
            raise SystemExit(f"Stale p.95 target {key}: expected {expected_text!r}")
        if span.get("font") != "ZapfDingbatsStd" or span.get("color", "").lower() != expected_color:
            raise SystemExit(f"Unexpected p.95 glyph source at {key}: {span.get('font')!r}, {span.get('color')!r}")

    source_assets = []
    with pymupdf.open(args.pdf) as document:
        page = document[PAGE - 1]
        if abs(page.rect.width - float(dom["width"])) > 0.05 or abs(page.rect.height - float(dom["height"])) > 0.05:
            raise SystemExit("p.95 PDF geometry no longer matches the page DOM")

        pill_drawings = []
        for drawing in page.get_drawings():
            fill = drawing.get("fill")
            rect = drawing["rect"]
            if (
                fill
                and max(fill) < 0.2
                and abs(fill[0] - 0.1366903) < 0.003
                and abs(fill[1] - 0.1219501) < 0.003
                and abs(fill[2] - 0.1252918) < 0.003
                and 7.0 < rect.height < 13.0
                and 30.0 < rect.width < 50.0
            ):
                pill_drawings.append(rect_values(rect))
        pill_drawings.sort(key=lambda rect: (rect[1], rect[0]))
        if len(pill_drawings) != len(EXPECTED_PILLS) or any(
            not close_rect(actual, expected)
            for actual, expected in zip(pill_drawings, sorted(EXPECTED_PILLS, key=lambda rect: (rect[1], rect[0])))
        ):
            raise SystemExit(f"Stale p.95 pill paths: found {pill_drawings!r}")

        drawings = page.get_drawings()
        for drawing_index, expected in EXPECTED_COMPONENT_DRAWINGS:
            if drawing_index >= len(drawings) or not close_rect(rect_values(drawings[drawing_index]["rect"]), expected, tolerance=0.02):
                actual = rect_values(drawings[drawing_index]["rect"]) if drawing_index < len(drawings) else None
                raise SystemExit(f"Stale p.95 pictogram path {drawing_index}: {actual!r}")

        glyphs = []
        for ordinal, target in enumerate(GLYPH_TARGETS, start=1):
            block_id, line_id, index, _, color = target
            span = span_index[(block_id, line_id, index)]
            rect = pymupdf.Rect(*span["bbox"])
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(GLYPH_SCALE, GLYPH_SCALE), clip=rect, alpha=False)
            rgb = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
            gray = np.rint(rgb @ np.array([0.299, 0.587, 0.114])).astype(np.float32)
            rgba = np.zeros((pixmap.height, pixmap.width, 4), dtype=np.uint8)
            rgba[:, :, :3] = 255 if color.lower() == "#ffffff" else 35
            rgba[:, :, 3] = glyph_alpha(gray, color)
            image = Image.fromarray(rgba, "RGBA")
            safe_key = f"{block_id}-{line_id}-{index}"
            asset = PAGE_DIR / f"fidelity-overlay-component-tag-glyph-{ordinal:02d}-{safe_key}.png"
            glyphs.append((target, rect, image, asset))

        source_components = []
        for name, bbox in SOURCE_COMPONENT_CROPS:
            rect = pymupdf.Rect(*bbox)
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(GLYPH_SCALE, GLYPH_SCALE), clip=rect, alpha=False)
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
            asset = PAGE_DIR / f"fidelity-overlay-component-{name}.png"
            source_components.append((name, rect, image, asset))

        pill_svg = build_pill_svg(page.rect.width, page.rect.height, pill_drawings)

    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8")) if SIDECAR_PATH.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid overlay sidecar: {SIDECAR_PATH}")

    shape_name = "fidelity-overlay-component-condition-tag-pills.svg"
    urls = {f"/pages/page_{PAGE:03d}/{shape_name}"}
    overlays = [{
        "url": f"/pages/page_{PAGE:03d}/{shape_name}",
        "bbox": [0, 0, float(dom["width"]), float(dom["height"])],
        "widthPx": 1710,
        "heightPx": 1710,
        "language": "en",
        "languageInvariant": True,
        "zIndex": 2,
        "auditId": AUDIT_ID,
        "category": "component-tag-backgrounds",
        "sourcePdfPage": PAGE,
        "region": "All fourteen STATUS/PASSIVE/DISCARD rounded black tag capsules",
        "sourceDrawingRects": pill_drawings,
    }]
    for target, rect, image, asset in glyphs:
        url = f"/pages/page_{PAGE:03d}/{asset.name}"
        urls.add(url)
        block_id, line_id, index, text, color = target
        overlays.append({
            "url": url,
            "bbox": [rect.x0, rect.y0, rect.x1, rect.y1],
            "widthPx": image.width,
            "heightPx": image.height,
            "language": "en",
            "languageInvariant": True,
            "auditId": AUDIT_ID,
            "category": "component-icons",
            "sourcePdfPage": PAGE,
            "region": f"Zapf Dingbats {text.encode('unicode_escape').decode()} at {block_id}/{line_id}/{index}",
            "alphaMask": "foreground symbol isolated from table and rounded capsule pixels",
        })
    for name, rect, image, asset in source_components:
        url = f"/pages/page_{PAGE:03d}/{asset.name}"
        urls.add(url)
        overlays.append({
            "url": url,
            "bbox": [rect.x0, rect.y0, rect.x1, rect.y1],
            "widthPx": image.width,
            "heightPx": image.height,
            "language": "en",
            "languageInvariant": True,
            "auditId": AUDIT_ID,
            "category": "component-icons",
            "sourcePdfPage": PAGE,
            "region": name,
            "sourceCrop": "Exact PDF raster crop; these gaps contain vector pictograms and no printed words",
        })

    if not args.apply:
        print(f"Verified {len(pill_drawings)} rounded-pill paths, {len(glyphs)} Zapf spans, and {len(source_components)} pictogram crops.")
        print(f"SVG: {shape_name}; transparent glyph PNGs: {len(glyphs)}; pictogram crops: {len(source_components)}; sidecar overlays: {len(overlays)}; dry run only.")
        return

    (PAGE_DIR / shape_name).write_text(pill_svg, encoding="utf-8")
    for target, rect, image, asset in glyphs:
        image.save(asset)
        span = span_index[target[:3]]
        span["renderAsSourceOverlayDuplicate"] = True
        span["renderSourceOverlayLanguage"] = "all"
    for name, rect, image, asset in source_components:
        image.save(asset)
    DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") not in urls] + overlays
    SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"p.95: restored 14 tag pills, 16 exact Zapf glyphs, and {len(source_components)} vector pictograms; tag words remain editable")


if __name__ == "__main__":
    main()
