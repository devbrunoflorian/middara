"""Restore page 21's four printed terrain/loot token labels from the source PDF.

The token labels are printed on illustrated circular components. Several curved
letters are extracted as independent horizontal DOM lines, and background text
cleanup leaves faint remnants. A single source crop restores the four icons
without covering the adjacent editable paragraph. This image-only crop is shared
by EN and PT-BR; do not hide or delete the source DOM blocks.
"""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = Path(
    r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
)
PAGE_DIR = ROOT / "apps/web/public/pages/page_021"
DOM_PATH = PAGE_DIR / "page_021_dom.json"
OVERLAY_PATH = PAGE_DIR / "fidelity-overlay-token-icons.png"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
PAGE_INDEX = 20
OVERLAY_BBOX_PT = (150.5, 120.0, 341.0, 172.0)
EXPECTED_INK_LINE_IDS = {
    "line_45_0",
    "line_49_0", "line_49_1", "line_49_2",
    "line_53_0", "line_53_1", "line_53_2", "line_53_3",
    "line_58_0", "line_58_1",
    "line_61_0", "line_61_1", "line_61_2", "line_61_3", "line_61_4",
    "line_66_0",
    "line_67_0", "line_67_1", "line_67_2", "line_67_3", "line_67_4", "line_67_5",
}
OVERLAY_URL = "/pages/page_021/fidelity-overlay-token-icons.png"


def intersects(a: tuple[float, ...], b: tuple[float, ...]) -> bool:
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def validate_dom() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    ink_lines: set[str] = set()
    for block in data.get("blocks", []):
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", []))
            if text.strip() and intersects(tuple(line.get("bbox", ())), OVERLAY_BBOX_PT):
                ink_lines.add(line["id"])

    if ink_lines != EXPECTED_INK_LINE_IDS:
        raise ValueError(
            "Unexpected live text inside the token crop; refusing overlay. "
            f"Missing={sorted(EXPECTED_INK_LINE_IDS - ink_lines)}, "
            f"unexpected={sorted(ink_lines - EXPECTED_INK_LINE_IDS)}"
        )


def main() -> None:
    if not PDF_PATH.is_file():
        raise FileNotFoundError(f"Source PDF not found: {PDF_PATH}")
    if not DOM_PATH.is_file():
        raise FileNotFoundError(f"Page DOM not found: {DOM_PATH}")
    validate_dom()

    document = pymupdf.open(PDF_PATH)
    page = document[PAGE_INDEX]
    if abs(page.rect.width - 820.346) > 0.02 or abs(page.rect.height - 820.346) > 0.02:
        raise ValueError(f"Unexpected physical page size: {page.rect}")

    crop = page.get_pixmap(
        matrix=pymupdf.Matrix(4, 4),
        clip=pymupdf.Rect(*OVERLAY_BBOX_PT),
        alpha=False,
    )
    crop_image = Image.frombytes("RGB", (crop.width, crop.height), crop.samples)
    crop_image.save(OVERLAY_PATH, optimize=True)

    sidecar = {"overlays": []}
    if SIDECAR_PATH.is_file():
        sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    overlays = sidecar.setdefault("overlays", [])
    entry = {
        "url": OVERLAY_URL,
        "bbox": list(OVERLAY_BBOX_PT),
        "widthPx": crop.width,
        "heightPx": crop.height,
        "language": "en",
        "languageInvariant": True,
    }
    current = next((item for item in overlays if item.get("url") == OVERLAY_URL), None)
    if current is None:
        overlays.append(entry)
    else:
        overlays[overlays.index(current)] = entry
    SIDECAR_PATH.write_text(json.dumps(sidecar, indent=2) + "\n", encoding="utf-8")

    print(
        f"Wrote {OVERLAY_PATH} ({crop.width}x{crop.height}) and {SIDECAR_PATH}; "
        f"restored four source token icons; kept {len(EXPECTED_INK_LINE_IDS)} "
        "source text lines intact for Admin/database lineage"
    )


if __name__ == "__main__":
    main()
