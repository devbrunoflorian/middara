"""Restore p.100's missing STATUS capsule background and Zapf icon.

The STATUS text remains an editable white span. The exact source vector pill is
recreated as an under-text SVG; the unsupported white Zapf glyph is restored as
a transparent source-PDF crop. The line keeps source span advances so prose
does not slide beneath the capsule. Dry-run is the default.
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
PAGE = 100
PAGE_DIR = ROOT / f"apps/web/public/pages/page_{PAGE:03d}"
DOM_PATH = PAGE_DIR / f"page_{PAGE:03d}_dom.json"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-04-p100-status-tag-v1"
SCALE = 8.0
PILL_RECT = (583.675, 127.446, 628.326, 136.631)
ICON_TARGET = ("block_24", "line_24_2", 0)
ICON_RECT = (590.696, 128.587, 597.448, 135.130)
TAG_TEXT_RECT = (597.448, 128.146, 621.305, 135.886)
INK = (0.1366903, 0.1219501, 0.1252918)


def rect_values(rect: pymupdf.Rect) -> tuple[float, float, float, float]:
    return tuple(round(value, 3) for value in (rect.x0, rect.y0, rect.x1, rect.y1))


def close_rect(left: tuple[float, ...], right: tuple[float, ...], tolerance: float = 0.003) -> bool:
    return len(left) == len(right) == 4 and all(abs(a - b) <= tolerance for a, b in zip(left, right))


def glyph_alpha(gray: np.ndarray) -> np.ndarray:
    border = np.concatenate((gray[0, :], gray[-1, :], gray[:, 0], gray[:, -1]))
    background = float(np.median(border))
    threshold = max(48.0, background + 12.0)
    return np.rint(np.clip((gray - threshold) * (255.0 / (255.0 - threshold)), 0, 255)).astype(np.uint8)


def build_svg(page_width: float, page_height: float) -> str:
    x0, y0, x1, y1 = PILL_RECT
    width, height = x1 - x0, y1 - y0
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1710" height="1710" '
        f'viewBox="0 0 {page_width:.6f} {page_height:.6f}">'
        f'<rect x="{x0:.3f}" y="{y0:.3f}" width="{width:.3f}" height="{height:.3f}" '
        f'rx="{height / 2:.4f}" fill="#231f20"/></svg>\n'
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the validated SVG, icon crop, and sidecar")
    parser.add_argument("--pdf", type=Path, default=PDF)
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if dom.get("page_number") != PAGE:
        raise SystemExit("p.100 DOM page number mismatch")
    if abs(float(dom["width"]) - 820.346) > 0.05 or abs(float(dom["height"]) - 820.346) > 0.05:
        raise SystemExit("Unexpected p.100 DOM geometry")

    spans = {}
    lines = {}
    for block in dom.get("blocks", []):
        for line in block.get("lines", []):
            lines[(block["id"], line["id"])] = line
            for index, span in enumerate(line.get("spans", [])):
                spans[(block["id"], line["id"], index)] = span
    icon_span = spans.get(ICON_TARGET)
    if icon_span is None or icon_span.get("text") != "\u271c " or icon_span.get("font") != "ZapfDingbatsStd":
        raise SystemExit("Stale p.100 STATUS icon span")
    if icon_span.get("color", "").lower() != "#ffffff" or not close_rect(tuple(icon_span["bbox"]), ICON_RECT, 0.02):
        raise SystemExit("Unexpected p.100 STATUS icon source geometry/style")
    tag_span = spans.get(("block_24", "line_24_2", 1))
    if tag_span is None or tag_span.get("text") != "STATUS" or tag_span.get("color", "").lower() != "#ffffff":
        raise SystemExit("Stale p.100 STATUS label span")
    if not close_rect(tuple(tag_span["bbox"]), TAG_TEXT_RECT, 0.02):
        raise SystemExit("Unexpected p.100 STATUS label geometry")

    with pymupdf.open(args.pdf) as document:
        page = document[PAGE - 1]
        if abs(page.rect.width - float(dom["width"])) > 0.05 or abs(page.rect.height - float(dom["height"])) > 0.05:
            raise SystemExit("p.100 PDF geometry no longer matches the page DOM")
        matches = []
        for drawing in page.get_drawings():
            fill = drawing.get("fill")
            rect = drawing["rect"]
            if fill and close_rect(rect_values(rect), PILL_RECT) and all(abs(fill[i] - INK[i]) < 0.003 for i in range(3)):
                matches.append(drawing)
        if len(matches) != 1 or matches[0].get("type") != "f":
            raise SystemExit(f"Expected one exact filled STATUS pill path, found {len(matches)}")
        if len(matches[0].get("items", [])) < 6 or any(item[0] not in {"c", "l"} for item in matches[0]["items"]):
            raise SystemExit("p.100 STATUS path is not the expected rounded vector capsule")

        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), clip=pymupdf.Rect(*ICON_RECT), alpha=False)
        rgb = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
        gray = np.rint(rgb @ np.array([0.299, 0.587, 0.114])).astype(np.float32)
        rgba = np.zeros((pixmap.height, pixmap.width, 4), dtype=np.uint8)
        rgba[:, :, :3] = 255
        rgba[:, :, 3] = glyph_alpha(gray)
        icon_image = Image.fromarray(rgba, "RGBA")
        svg = build_svg(page.rect.width, page.rect.height)

    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8")) if SIDECAR_PATH.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit("Invalid p.100 fidelity overlay sidecar")
    svg_name = "fidelity-overlay-component-status-tag-pill.svg"
    png_name = "fidelity-overlay-component-status-tag-icon.png"
    svg_url = f"/pages/page_{PAGE:03d}/{svg_name}"
    png_url = f"/pages/page_{PAGE:03d}/{png_name}"
    overlays = [
        {
            "url": svg_url,
            "bbox": [0, 0, float(dom["width"]), float(dom["height"])],
            "widthPx": 1710,
            "heightPx": 1710,
            "language": "en",
            "languageInvariant": True,
            "zIndex": 2,
            "auditId": AUDIT_ID,
            "category": "component-tag-backgrounds",
            "sourcePdfPage": PAGE,
            "region": "single rounded STATUS capsule background; label stays editable",
            "sourceDrawingRect": list(PILL_RECT),
        },
        {
            "url": png_url,
            "bbox": list(ICON_RECT),
            "widthPx": icon_image.width,
            "heightPx": icon_image.height,
            "language": "en",
            "languageInvariant": True,
            "auditId": AUDIT_ID,
            "category": "component-icons",
            "sourcePdfPage": PAGE,
            "region": "white Zapf Dingbats status icon before editable STATUS label",
            "alphaMask": "white foreground isolated from the source capsule interior",
        },
    ]

    status_line = lines.get((ICON_TARGET[0], ICON_TARGET[1]))
    if status_line is None or len(status_line.get("spans", [])) <= 2:
        raise SystemExit("Stale p.100 STATUS source line")

    print("Verified the original p.100 status capsule path and editable icon/label spans.")
    if not args.apply:
        print("Dry run only. Would restore one under-text SVG capsule, one transparent icon crop, and source span advances.")
        return

    (PAGE_DIR / svg_name).write_text(svg, encoding="utf-8")
    icon_image.save(PAGE_DIR / png_name)
    status_line["renderSourceSpanGeometry"] = True
    DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") not in {svg_url, png_url}] + overlays
    SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("p.100: restored the STATUS capsule and white icon; the STATUS label remains editable")


if __name__ == "__main__":
    main()
