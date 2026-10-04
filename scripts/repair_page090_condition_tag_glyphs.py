"""Restore p.90 white condition-tag glyphs from the exact source PDF.

Four glyphs are extracted as Zapf Dingbats spans but have no corresponding web
font. The Per Encounter token is vector art and appears only as whitespace in
the extracted text. This script keeps text data intact and restores only the
five source glyph regions as transparent white PNG overlays.
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
PAGE = 90
PAGE_DIR = ROOT / f"apps/web/public/pages/page_{PAGE:03d}"
DOM_PATH = PAGE_DIR / f"page_{PAGE:03d}_dom.json"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-04-p090-condition-tag-glyphs-v1"
SCALE = 8.0

GLYPHS = [
    {
        "name": "discard-tag-inline-symbol",
        "bbox": [114.2438, 691.2483, 120.9368, 700.8483],
        "span": ("block_20", "line_20_0", 0, "\u2718"),
        "region": "DISCARD condition-tag X glyph",
    },
    {
        "name": "flip-tag-inline-symbol",
        "bbox": [134.1614, 758.2483, 143.0144, 767.8483],
        "span": ("block_19", "line_19_0", 0, "\u27a4"),
        "region": "FLIP condition-tag arrow glyph",
    },
    {
        "name": "passive-tag-inline-symbol",
        "bbox": [468.1184, 656.2483, 475.8104, 665.8483],
        "span": ("block_15", "line_15_1", 0, "\u2724"),
        "region": "PASSIVE condition-tag floral glyph",
    },
    {
        "name": "status-tag-inline-symbol",
        "bbox": [471.5097, 747.2483, 481.3977, 756.8483],
        "span": ("block_17", "line_17_0", 0, "\u271c "),
        "region": "STATUS condition-tag cross glyph",
    },
    {
        "name": "per-encounter-tag-inline-symbol",
        # Union of the white vector drawing bounds at page.get_drawings() 99–104.
        "bbox": [425.56, 700.472, 437.228, 711.355],
        "span": None,
        "region": "PER ENCOUNTER condition-tag token glyph",
    },
]


def close_bbox(left: list[float], right: list[float], tolerance: float = 0.02) -> bool:
    return len(left) == len(right) == 4 and all(
        abs(float(a) - float(b)) <= tolerance for a, b in zip(left, right)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write PNG overlays, DOM flags and sidecar")
    parser.add_argument("--pdf", type=Path, default=PDF)
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    blocks = {block["id"]: block for block in dom.get("blocks", [])}
    spans: dict[tuple[str, str, int], dict] = {}
    for block in dom.get("blocks", []):
        for line in block.get("lines", []):
            for index, span in enumerate(line.get("spans", [])):
                spans[(block["id"], line["id"], index)] = span

    for glyph in GLYPHS:
        target = glyph["span"]
        if target is None:
            continue
        span = spans.get(target[:3])
        if span is None or span.get("text") != target[3]:
            raise SystemExit(f"Stale p.90 target {target[:3]}: expected exact source text {target[3]!r}")
        if span.get("font") != "ZapfDingbatsStd":
            raise SystemExit(f"Unexpected p.90 source font at {target[:3]}: {span.get('font')!r}")
        if not span.get("renderAsSourceOverlayDuplicate") or span.get("renderSourceOverlayLanguage") != "all":
            print(f"DOM: suppress unsupported duplicate {target[:3]} ({target[3].encode('unicode_escape').decode()})")

    source = []
    with pymupdf.open(args.pdf) as document:
        page = document[PAGE - 1]
        if abs(page.rect.width - float(dom["width"])) > 0.05 or abs(page.rect.height - float(dom["height"])) > 0.05:
            raise SystemExit("p.90 PDF geometry no longer matches the page DOM")
        drawings = page.get_drawings()
        expected_vector_parts = {
            (99, (433.507, 703.825, 436.928, 706.429)),
            (100, (434.254, 700.772, 434.905, 702.648)),
            (101, (435.792, 700.772, 436.029, 702.648)),
            (102, (425.86, 700.772, 436.144, 711.055)),
            (103, (435.141, 700.772, 435.555, 702.648)),
            (104, (429.327, 703.261, 431.767, 708.565)),
        }
        for index, expected in expected_vector_parts:
            actual = drawings[index].get("rect")
            actual_rect = tuple(round(value, 3) for value in (actual.x0, actual.y0, actual.x1, actual.y1))
            if not close_bbox(list(actual_rect), list(expected), tolerance=0.001):
                raise SystemExit(f"Stale p.90 PER ENCOUNTER vector drawing {index}: {actual_rect}")

        for glyph in GLYPHS:
            rect = pymupdf.Rect(*glyph["bbox"])
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), clip=rect, alpha=False)
            rgb = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
            gray = np.rint(rgb @ np.array([0.299, 0.587, 0.114])).astype(np.float32)
            border = np.concatenate((gray[0, :], gray[-1, :], gray[:, 0], gray[:, -1]))
            base = float(np.median(border))
            alpha = np.clip((gray - max(48.0, base + 12.0)) * (255.0 / (255.0 - max(48.0, base + 12.0))), 0, 255)
            rgba = np.zeros((pixmap.height, pixmap.width, 4), dtype=np.uint8)
            rgba[:, :, :3] = 255
            rgba[:, :, 3] = np.rint(alpha).astype(np.uint8)
            image = Image.fromarray(rgba, "RGBA")
            asset = PAGE_DIR / f"fidelity-overlay-component-{glyph['name']}.png"
            source.append((glyph, rect, image, asset))

    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8")) if SIDECAR_PATH.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid overlay sidecar: {SIDECAR_PATH}")

    overlays = []
    for glyph, rect, image, asset in source:
        url = f"/pages/page_{PAGE:03d}/{asset.name}"
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
            "region": glyph["region"],
            "alphaMask": "white source glyph separated from dark condition-tag pill",
        })

    if not args.apply:
        for glyph, rect, image, asset in source:
            print(f"PNG: {asset.relative_to(ROOT)} {image.width}x{image.height}, bbox={list(rect)}")
        print(f"Sidecar: replace/add {len(overlays)} overlays; dry run only")
        return

    for glyph, rect, image, asset in source:
        image.save(asset)
    for glyph in GLYPHS:
        target = glyph["span"]
        if target is not None:
            span = spans[target[:3]]
            span["renderAsSourceOverlayDuplicate"] = True
            span["renderSourceOverlayLanguage"] = "all"
    DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    urls = {overlay["url"] for overlay in overlays}
    sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") not in urls] + overlays
    SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"p.90: wrote five exact PDF glyph overlays and retained all extracted text in {DOM_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
