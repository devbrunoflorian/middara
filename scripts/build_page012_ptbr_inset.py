"""Historical generator for the superseded PT-BR Adventure Book inset.

Current project scope keeps game-component text in its source language. Page 12
therefore uses the OG inset as a language-invariant layer; this generator must
not be used to restore the translated component image unless that scope changes.
The current sidecar has no PT-BR inset entry, so --apply refuses to run.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_PDF = Path(
    r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
)
DEFAULT_TRANSLATION_PDF = Path(r"C:\Users\bruno\Downloads\UM1 Capítulo 1 8.pdf")
PAGE_NUMBER = 12
PAGE_DIR = ROOT / "apps/web/public/pages/page_012"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-04-p012-ptbr-inset-v1"

# Source PDF's exact white page frame, derived from its vector fill.
PANEL_BBOX = [87.0271, 94.2690, 519.9060, 658.6540]
PANEL_FRAME_FILL = (1.0, 1.0, 1.0)
PANEL_FRAME_TOLERANCE = 0.08
RENDER_PX_PER_PT = 4

MASCOT_XREF = 54262
MASCOT_SMASK_XREF = 54261
MASCOT_BBOX = [123.6232147, 553.8425293, 349.1632080, 821.5025635]

ARROWS = [
    ([57.1929016, 136.5358887], [106.5829010, 136.5358887],
     [[111.0511017, 136.5358887], [104.7971039, 130.7208862], [104.7971039, 142.3498840]]),
    ([57.0511011, 175.5281372], [106.4411011, 175.5281372],
     [[110.9094009, 175.5281372], [104.6554031, 169.7131348], [104.6554031, 181.3421326]]),
    ([57.1929016, 462.1726990], [106.5829010, 462.1726990],
     [[111.0511017, 462.1726990], [104.7971039, 456.3576965], [104.7971039, 467.9866943]]),
    ([57.0511011, 500.0389099], [106.4411011, 500.0389099],
     [[110.9094009, 500.0389099], [104.6554031, 494.2239075], [104.6554031, 505.8529053]]),
]
ARROW_BBOX = [56.0511, 129.7209, 112.0511, 506.8529]
ARROW_RENDER_PX_PER_PT = 8
ARROW_STROKE_PT = 2.0

BADGES = [
    ([458.8503113, 309.9837952, 476.2203064, 327.3537903],
     [464.3492126, 312.6781006, 470.3522034, 323.4060974]),
    ([458.8503113, 551.7868652, 476.2203064, 569.1568604],
     [464.3492126, 554.4812622, 470.3522034, 565.2092896]),
]
BADGE_RADIUS_PT = 2.835
BADGE_BBOX = [458.8503113, 309.9837952, 476.2203064, 569.1568604]
BADGE_RENDER_PX_PER_PT = 8

OUTPUTS = {
    "panel": "fidelity-overlay-adventure-inset-ptbr.png",
    "arrows": "fidelity-overlay-adventure-inset-ptbr-arrows.png",
    "badges": "fidelity-overlay-adventure-inset-ptbr-callout-c.png",
    "mascot": "fidelity-overlay-adventure-inset-ptbr-mascot.png",
}


def close_bbox(actual: tuple[float, ...], expected: list[float], tolerance: float = 0.08) -> bool:
    return len(actual) == len(expected) == 4 and all(
        abs(float(left) - right) <= tolerance for left, right in zip(actual, expected)
    )


def page_size(page: pymupdf.Page) -> tuple[float, float]:
    return float(page.rect.width), float(page.rect.height)


def require_source_geometry(page: pymupdf.Page) -> None:
    matches = [
        drawing for drawing in page.get_drawings()
        if close_bbox(tuple(drawing["rect"]), PANEL_BBOX, PANEL_FRAME_TOLERANCE)
        and drawing.get("fill") is not None
        and all(abs(float(a) - b) <= 1e-5 for a, b in zip(drawing["fill"], PANEL_FRAME_FILL))
    ]
    if not matches:
        raise SystemExit(f"Source PDF page {PAGE_NUMBER} white inset frame changed: {PANEL_BBOX}")

    images = page.get_image_info(xrefs=True)
    if not any(image.get("xref") == MASCOT_XREF and close_bbox(tuple(image["bbox"]), MASCOT_BBOX) for image in images):
        raise SystemExit(f"Source PDF page {PAGE_NUMBER} mascot placement changed: {MASCOT_BBOX}")

    drawing_boxes = [tuple(d["rect"]) for d in page.get_drawings()]
    required_badges = [box for box, _ in BADGES]
    if not all(any(close_bbox(rect, box) for rect in drawing_boxes) for box in required_badges):
        raise SystemExit("One or more source C callout boxes are missing or moved")


def render_panel(translation_page: pymupdf.Page) -> Image.Image:
    width_pt = PANEL_BBOX[2] - PANEL_BBOX[0]
    height_pt = PANEL_BBOX[3] - PANEL_BBOX[1]
    width_px = round(width_pt * RENDER_PX_PER_PT)
    height_px = round(height_pt * RENDER_PX_PER_PT)
    page_width, page_height = page_size(translation_page)
    matrix = pymupdf.Matrix(width_px / page_width, 0, 0, height_px / page_height, 0, 0)
    pixmap = translation_page.get_pixmap(matrix=matrix, alpha=False, colorspace=pymupdf.csRGB)
    if abs(pixmap.width - width_px) > 1 or abs(pixmap.height - height_px) > 1:
        raise SystemExit(f"Unexpected PT panel raster dimensions: {pixmap.width}×{pixmap.height}")
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def render_arrows(source_page: pymupdf.Page) -> Image.Image:
    del source_page  # The exact arrow vectors below were measured from this verified source page.
    x0, y0, x1, y1 = ARROW_BBOX
    width, height = x1 - x0, y1 - y0
    temp = pymupdf.open()
    page = temp.new_page(width=width, height=height)
    for start, end, head in ARROWS:
        p1 = pymupdf.Point(start[0] - x0, start[1] - y0)
        p2 = pymupdf.Point(end[0] - x0, end[1] - y0)
        page.draw_line(p1, p2, color=(1, 1, 1), width=ARROW_STROKE_PT, overlay=True)
        points = [pymupdf.Point(point[0] - x0, point[1] - y0) for point in head]
        page.draw_polyline(points, color=None, fill=(1, 1, 1), closePath=True, overlay=True)
    pixmap = page.get_pixmap(
        matrix=pymupdf.Matrix(ARROW_RENDER_PX_PER_PT, ARROW_RENDER_PX_PER_PT),
        alpha=True,
        colorspace=pymupdf.csRGB,
    )
    temp.close()
    return Image.frombytes("RGBA", (pixmap.width, pixmap.height), pixmap.samples)


def render_badges(source_page: pymupdf.Page) -> Image.Image:
    x0, y0, x1, y1 = BADGE_BBOX
    scale = BADGE_RENDER_PX_PER_PT
    width, height = round((x1 - x0) * scale), round((y1 - y0) * scale)
    badge_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(badge_layer)

    for box, glyph_bbox in BADGES:
        bx0, by0, bx1, by1 = box
        local = (
            round((bx0 - x0) * scale), round((by0 - y0) * scale),
            round((bx1 - x0) * scale), round((by1 - y0) * scale),
        )
        draw.rounded_rectangle(
            local,
            radius=round(BADGE_RADIUS_PT * scale),
            fill=(255, 255, 255, 255),
        )

        # Keep the exact source glyph and anti-aliasing while separating it
        # from its original white badge fill.
        text_pix = source_page.get_pixmap(
            matrix=pymupdf.Matrix(scale, scale),
            clip=pymupdf.Rect(*glyph_bbox),
            alpha=False,
            colorspace=pymupdf.csRGB,
        )
        text = Image.frombytes("RGB", (text_pix.width, text_pix.height), text_pix.samples)
        alpha = ImageOps.invert(text.convert("L"))
        alpha = alpha.point(lambda value: 0 if value < 8 else value)
        glyph = Image.new("RGBA", text.size, (0, 0, 0, 0))
        glyph.putalpha(alpha)
        gx = round((glyph_bbox[0] - x0) * scale)
        gy = round((glyph_bbox[1] - y0) * scale)
        badge_layer.alpha_composite(glyph, (gx, gy))

    return badge_layer


def render_mascot(source_doc: pymupdf.Document) -> tuple[Image.Image, list[float]]:
    base = pymupdf.Pixmap(source_doc, MASCOT_XREF)
    rgb = pymupdf.Pixmap(pymupdf.csRGB, base)
    smask = pymupdf.Pixmap(source_doc, MASCOT_SMASK_XREF)
    color = Image.frombytes("RGB", (rgb.width, rgb.height), rgb.samples)
    alpha = Image.frombytes("L", (smask.width, smask.height), smask.samples)

    # The embedded soft mask is higher-resolution than its CMYK image. Keep
    # the source mask resolution to avoid the dark fringe caused by ignoring it.
    rgba = color.resize(alpha.size, Image.Resampling.LANCZOS).convert("RGBA")
    rgba.putalpha(alpha)
    rgba = rgba.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

    clip_y1 = min(MASCOT_BBOX[3], PANEL_BBOX[3])
    rows = round((clip_y1 - MASCOT_BBOX[1]) / (MASCOT_BBOX[3] - MASCOT_BBOX[1]) * rgba.height)
    rgba = rgba.crop((0, 0, rgba.width, rows))
    bbox = [MASCOT_BBOX[0], MASCOT_BBOX[1], MASCOT_BBOX[2], clip_y1]
    return rgba, bbox


def overlay(url: str, image: Image.Image, bbox: list[float], language: str) -> dict:
    return {
        "url": url,
        "bbox": bbox,
        "widthPx": image.width,
        "heightPx": image.height,
        "language": language,
        "auditId": AUDIT_ID,
        "sourcePdfPage": PAGE_NUMBER,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write page assets and update the sidecar")
    parser.add_argument("--source-pdf", type=Path, default=DEFAULT_SOURCE_PDF)
    parser.add_argument("--translation-pdf", type=Path, default=DEFAULT_TRANSLATION_PDF)
    args = parser.parse_args()

    for path in (args.source_pdf, args.translation_pdf, SIDECAR_PATH):
        if not path.is_file():
            raise FileNotFoundError(path)

    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    entries = sidecar.get("overlays")
    if not isinstance(entries, list):
        raise SystemExit(f"Invalid overlay sidecar: {SIDECAR_PATH}")
    english = [entry for entry in entries if entry.get("language") == "en"]
    if len(english) != 1 or english[0].get("url") != "/pages/page_012/fidelity-overlay-adventure-inset.png":
        raise SystemExit("Expected exactly one existing English adventure inset overlay; refusing to alter EN")
    if not any(entry.get("language") == "pt-BR" for entry in entries):
        raise SystemExit("PT-BR Adventure Book inset is retired to preserve component text; refusing to regenerate it")

    source_doc = pymupdf.open(args.source_pdf)
    translation_doc = pymupdf.open(args.translation_pdf)
    if len(source_doc) < PAGE_NUMBER or len(translation_doc) != 1:
        raise SystemExit(f"Expected source page {PAGE_NUMBER} and one translated PDF page")
    source_page = source_doc[PAGE_NUMBER - 1]
    require_source_geometry(source_page)

    panel = render_panel(translation_doc[0])
    arrows = render_arrows(source_page)
    badges = render_badges(source_page)
    mascot, mascot_bbox = render_mascot(source_doc)

    x0, y0, x1, y1 = PANEL_BBOX
    layers = [
        overlay(f"/pages/page_012/{OUTPUTS['panel']}", panel, PANEL_BBOX, "pt-BR"),
        overlay(f"/pages/page_012/{OUTPUTS['arrows']}", arrows, ARROW_BBOX, "pt-BR"),
        overlay(f"/pages/page_012/{OUTPUTS['badges']}", badges, BADGE_BBOX, "pt-BR"),
        overlay(f"/pages/page_012/{OUTPUTS['mascot']}", mascot, mascot_bbox, "pt-BR"),
    ]

    # Keep the English item byte-for-byte and remove only previous PT entries
    # for this task, so re-running --apply is safe.
    kept = [entry for entry in entries if entry.get("language") != "pt-BR"]
    sidecar["overlays"] = kept + layers

    print(f"Page {PAGE_NUMBER} translated inset: source frame={PANEL_BBOX}; raster={panel.width}×{panel.height}")
    print(f"Callouts: four vector arrows, two C badges; mascot clip={mascot_bbox}; alpha raster={mascot.width}×{mascot.height}")
    print(f"English overlay preserved: {english[0]['url']}")
    if not args.apply:
        print("Dry run only. Pass --apply to write the assets and sidecar.")
        source_doc.close()
        translation_doc.close()
        return

    PAGE_DIR.mkdir(parents=True, exist_ok=True)
    by_name = {"panel": panel, "arrows": arrows, "badges": badges, "mascot": mascot}
    for key, filename in OUTPUTS.items():
        by_name[key].save(PAGE_DIR / filename)
    SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Applied {len(layers)} PT-BR overlays to {SIDECAR_PATH}")
    source_doc.close()
    translation_doc.close()


if __name__ == "__main__":
    main()
