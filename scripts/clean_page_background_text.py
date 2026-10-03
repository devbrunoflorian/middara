"""Remove baked source-PDF text from a page background while preserving artwork.

This is intentionally page-scoped.  The web renderer paints editable HTML text,
so a background that still contains the source PDF's text produces a duplicate
or ghosted paragraph.  PyMuPDF redactions remove text operators only; images and
line art are left in place.  Component artwork is restored separately by the
fidelity overlay pipeline.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import fitz


def clean_page(pdf_path: Path, page_number: int, output_path: Path, scale: float) -> int:
    if page_number < 1:
        raise ValueError("page_number is one-based and must be positive")

    document = fitz.open(pdf_path)
    try:
        page = document[page_number - 1]
        blocks = page.get_text("blocks")
        text_blocks = [block for block in blocks if len(block) >= 5 and block[4].strip()]
        for block in text_blocks:
            rect = fitz.Rect(block[:4])
            page.add_redact_annot(rect, fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if output_path.suffix.lower() == ".webp":
            from PIL import Image

            image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
            image.save(output_path, format="WEBP", quality=95, method=6)
        else:
            pixmap.save(output_path)
        return len(text_blocks)
    finally:
        document.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--page", required=True, type=int, help="one-based PDF page number")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--scale", type=float, default=4.0)
    args = parser.parse_args()
    count = clean_page(args.pdf, args.page, args.output, args.scale)
    print(f"page={args.page} textBlocksRemoved={count} output={args.output}")


if __name__ == "__main__":
    main()
