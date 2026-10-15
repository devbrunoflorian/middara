"""Render a reproducible source-vs-export crop for p.62 AI Target Priority."""

from __future__ import annotations

import argparse
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(
    "C:/Users/bruno/Middara/Rulebook 1.2/"
    "Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
)
DEFAULT_EXPORT = ROOT / "output/proofs/translation-readiness-2026-10-15/"
DEFAULT_EXPORT /= "p062-ai-target-priority-v1/page-062-pt-BR-proposal-v1.pdf"
DEFAULT_OUTPUT = ROOT / "output/proofs/translation-readiness-2026-10-15/"
DEFAULT_OUTPUT /= "p062-ai-target-priority-v1/source-vs-export-family-crop-v1.png"

# Includes both target units and the next heading to make vertical fit visible.
CROP = pymupdf.Rect(72, 228, 410, 365)
SCALE = 2.5
HEADER_HEIGHT = 34
GAP = 18


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--export", type=Path, default=DEFAULT_EXPORT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    source_doc = pymupdf.open(args.source)
    export_doc = pymupdf.open(args.export)
    if len(source_doc) < 62 or len(export_doc) != 1:
        raise SystemExit("Expected official source p.62 and exactly one exported page.")
    source_page = source_doc[61]
    export_page = export_doc[0]
    if tuple(source_page.rect) != tuple(export_page.rect):
        raise SystemExit("Source/export page geometry differs; refusing misleading crop.")

    matrix = pymupdf.Matrix(SCALE, SCALE)
    source_pixmap = source_page.get_pixmap(matrix=matrix, clip=CROP, alpha=False)
    source_image = Image.frombytes(
        "RGB", (source_pixmap.width, source_pixmap.height), source_pixmap.samples
    )
    export_pixmap = export_page.get_pixmap(matrix=matrix, clip=CROP, alpha=False)
    export_image = Image.frombytes(
        "RGB", (export_pixmap.width, export_pixmap.height), export_pixmap.samples
    )
    if source_image.size != export_image.size:
        raise SystemExit("Rendered source/export crop sizes differ.")

    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    width = source_image.width * 2 + GAP
    output = Image.new(
        "RGB", (width, source_image.height + HEADER_HEIGHT), "white"
    )
    draw = ImageDraw.Draw(output)
    draw.text((8, 8), "Official EN source — p.62", fill="#222222", font=font)
    draw.text(
        (source_image.width + GAP + 8, 8),
        "PT-BR proposal export — p.62",
        fill="#222222",
        font=font,
    )
    output.paste(source_image, (0, HEADER_HEIGHT))
    output.paste(export_image, (source_image.width + GAP, HEADER_HEIGHT))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output)
    print(
        f"Rendered {args.output} at {SCALE:g}x; "
        f"crop={tuple(CROP)}, each_panel={source_image.size}"
    )


if __name__ == "__main__":
    main()
