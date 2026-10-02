"""Restore the two exit-token faces on page 16 from the exact source PDF pixels.

The viewer background-cleaning pipeline removes styled vector text inside these
two embedded image placements, leaving clipped/stroke fragments. A narrow,
English-only overlay restores only the verified placements. It does not edit
the PDF or artwork source, and remains hidden in Admin so source spans stay
available for inspection.
"""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = Path(
    r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
)
PAGE_DIR = ROOT / "apps/web/public/pages/page_016"
BACKGROUND_PATH = PAGE_DIR / "background.webp"
DOM_PATH = PAGE_DIR / "page_016_dom.json"
OVERLAY_PATH = PAGE_DIR / "fidelity-overlay-exit-tokens.png"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
EXPECTED_XREF = 54553
EXPECTED_RECTS = (
    (125.55855, 457.67148, 190.69183, 523.22736),
    (169.90009, 457.67148, 235.03337, 523.22736),
)
TEXT_TARGETS = {
    "line_180_0": ("EXIT", (187.75259, 483.77145, 217.27293, 500.80341)),
    "line_183_0": ("EXIT", (143.41110, 483.77145, 172.93144, 500.80341)),
}


def close_rect(actual: tuple[float, ...], expected: tuple[float, ...]) -> bool:
    return len(actual) == len(expected) and all(
        abs(value - target) <= 0.01 for value, target in zip(actual, expected)
    )


def main() -> None:
    if not PDF_PATH.is_file():
        raise FileNotFoundError(f"Source PDF not found: {PDF_PATH}")

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    lines = {
        line["id"]: line
        for block in dom.get("blocks", [])
        for line in block.get("lines", [])
    }
    for line_id, (expected_text, expected_bbox) in TEXT_TARGETS.items():
        line = lines.get(line_id)
        actual_text = "".join(span.get("text", "") for span in (line or {}).get("spans", []))
        if (
            line is None
            or actual_text != expected_text
            or not close_rect(tuple(line.get("bbox", [])), expected_bbox)
        ):
            raise ValueError(f"Target line changed; refusing stale overlay: {line_id}")

    background = Image.open(BACKGROUND_PATH).convert("RGB")
    document = pymupdf.open(PDF_PATH)
    page = document[15]
    scale_x = background.width / page.rect.width
    scale_y = background.height / page.rect.height
    pixmap = page.get_pixmap(
        matrix=pymupdf.Matrix(scale_x, scale_y), alpha=False
    )
    source = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    if source.size != background.size:
        raise ValueError(
            f"PDF/background size mismatch: {source.size} != {background.size}"
        )

    actual_rects: list[tuple[float, float, float, float]] = []
    for image_info in page.get_images(full=True):
        xref = image_info[0]
        if xref != EXPECTED_XREF:
            continue
        for rect, _matrix in page.get_image_rects(xref, transform=True):
            if any(
                close_rect(tuple(rect), expected) for expected in EXPECTED_RECTS
            ):
                actual_rects.append(tuple(rect))

    if len(actual_rects) != len(EXPECTED_RECTS):
        raise ValueError(
            f"Expected two audited exit-token placements for xref {EXPECTED_XREF}; "
            f"found {len(actual_rects)}: {actual_rects}"
        )

    mask = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(mask)
    for x0, y0, x1, y1 in actual_rects:
        draw.rectangle(
            (
                round(x0 * scale_x),
                round(y0 * scale_y),
                round(x1 * scale_x),
                round(y1 * scale_y),
            ),
            fill=255,
        )

    # Grow by one source pixel to cover antialiased source edges without
    # extending this repair beyond the two image placements.
    mask = mask.filter(ImageFilter.MaxFilter(3))
    bounds = mask.getbbox()
    if not bounds:
        raise ValueError("The audited token mask is empty")
    overlay = source.convert("RGBA")
    overlay.putalpha(mask)
    overlay = overlay.crop(bounds)
    overlay.save(OVERLAY_PATH, optimize=True)

    bbox_pt = [
        round(bounds[0] / scale_x, 5),
        round(bounds[1] / scale_y, 5),
        round(bounds[2] / scale_x, 5),
        round(bounds[3] / scale_y, 5),
    ]
    sidecar = {
        "overlays": [
            {
                "url": "/pages/page_016/fidelity-overlay-exit-tokens.png",
                "bbox": bbox_pt,
                "widthPx": overlay.width,
                "heightPx": overlay.height,
                "language": "en",
                "hideInAdmin": True,
            }
        ]
    }
    SIDECAR_PATH.write_text(
        json.dumps(sidecar, indent=2) + "\n", encoding="utf-8"
    )
    for line_id in TEXT_TARGETS:
        line = lines[line_id]
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "exact English source-PDF appearance is restored by the local exit-token "
            "fidelity overlay; do not draw the incomplete HTML text pass over it"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": "page16-exit-token-fidelity-overlay-v1",
            "sourcePdfPage": 16,
            "region": "two Exit token image placements in the inset",
            "rule": "source-PDF pixels restore the rendered face; preserve the source span in Admin",
            "evidenceRef": "docs/project-progress/2026-10-02-book-visual-fidelity-phase-plan.md",
        }
    DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {OVERLAY_PATH} ({overlay.width}x{overlay.height}) and "
        f"{SIDECAR_PATH}; placements={len(actual_rects)}, "
        f"source spans preserved/overlay-backed={len(TEXT_TARGETS)}, bbox_pt={bbox_pt}"
    )


if __name__ == "__main__":
    main()
