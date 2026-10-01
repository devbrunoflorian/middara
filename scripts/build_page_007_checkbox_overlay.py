"""Build a page-local vector overlay for the 20 missing component-list boxes.

The source PDF's U+274F Zapf Dingbats checkbox glyphs are suppressed by the
viewer, while the extracted background does not contain them. Keep this narrow
to page 7; never infer a global Zapf mapping from these checkboxes.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages/page_007"
DOM_PATH = PAGE_DIR / "page_007_dom.json"
SVG_PATH = PAGE_DIR / "fidelity-overlay-component-checkboxes.svg"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
PAGE_BOX = (85.5, 576.5, 534.0, 772.0)
EXPECTED_COUNT = 20


def main() -> None:
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    spans = [
        span
        for block in dom.get("blocks", [])
        for line in block.get("lines", [])
        for span in line.get("spans", [])
        if span.get("font") == "ZapfDingbatsStd" and span.get("text") == "❏"
    ]
    if len(spans) != EXPECTED_COUNT:
        raise ValueError(f"Expected {EXPECTED_COUNT} page-7 checkboxes, found {len(spans)}")

    x0, y0, x1, y1 = PAGE_BOX
    width, height = x1 - x0, y1 - y0
    shapes: list[str] = []
    for span in spans:
        bx0, by0, _, _ = span["bbox"]
        # Measurements from the 2x source-PDF crop: a 5.3pt hollow square,
        # lightly outlined, with the source glyph's offset lower-right shadow.
        left = bx0 + 0.35 - x0
        top = by0 + 1.25 - y0
        size = 5.3
        shadow = 1.0
        edge = 1.15
        shapes.append(
            f'<path d="M {left + size:.3f} {top + shadow:.3f} '
            f'H {left + size + shadow:.3f} V {top + size + shadow:.3f} '
            f'H {left + shadow:.3f} V {top + size:.3f} '
            f'H {left + size:.3f} Z" fill="#312f2b"/>'
        )
        shapes.append(
            f'<rect x="{left:.3f}" y="{top:.3f}" width="{size:.3f}" '
            f'height="{size:.3f}" fill="none" stroke="#77736e" '
            f'stroke-width="{edge:.2f}"/>'
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width * 2:.0f}" '
        f'height="{height * 2:.0f}" viewBox="0 0 {width:.3f} {height:.3f}">'
        f'{"".join(shapes)}</svg>\n'
    )
    SVG_PATH.write_text(svg, encoding="utf-8")

    overlay = {
        "overlays": [
            {
                "url": "/pages/page_007/fidelity-overlay-component-checkboxes.svg",
                "bbox": list(PAGE_BOX),
                "widthPx": round(width * 2),
                "heightPx": round(height * 2),
                "language": language,
            }
            for language in ("en", "pt-BR")
        ]
    }
    SIDECAR_PATH.write_text(json.dumps(overlay, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote overlay for {len(spans)} checkboxes: {SVG_PATH.name}")


if __name__ == "__main__":
    main()
