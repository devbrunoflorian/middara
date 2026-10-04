"""Rebuild p.15's background with source PDF text removed as objects.

The legacy page-background extractor strips ``BT … ET`` byte ranges from PDF
streams. On page 15 that leaves dark, misaligned glyphs beneath the editable
white legend text. This page-scoped repair redacts only text objects in memory;
images and vector drawings stay intact. The inset illustration is restored by
the existing fidelity overlay, while live page text remains in the DOM.

Run without --apply to write a review PNG under tmp/. Add --apply only after
comparing that render with the official PDF; it replaces background.webp.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pymupdf
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path(
    r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
)
PAGE_NUMBER = 15
EXPECTED_PAGE_SIZE = (820.3460083, 820.3460083)
EXPECTED_TEXT_BLOCKS = 74
REQUIRED_TEXT = (
    "ENCOUNTER SETUP DIAGRAM:",
    "SETUP:",
    "CONTINUE SYMBOL:",
)
BACKGROUND = ROOT / "apps/web/public/pages/page_015/background.webp"
PREVIEW = ROOT / "tmp/page15-clean-background-preview.png"


def close(actual: float, expected: float, tolerance: float = 0.02) -> bool:
    return abs(actual - expected) <= tolerance


def render(pdf_path: Path, output: Path, *, apply: bool) -> tuple[int, int]:
    if not pdf_path.is_file():
        raise FileNotFoundError(pdf_path)
    if not BACKGROUND.is_file():
        raise FileNotFoundError(BACKGROUND)

    with pymupdf.open(pdf_path) as document:
        if document.page_count < PAGE_NUMBER:
            raise ValueError(f"PDF has only {document.page_count} pages")
        page = document[PAGE_NUMBER - 1]
        page_size = (page.rect.width, page.rect.height)
        if any(not close(a, b) for a, b in zip(page_size, EXPECTED_PAGE_SIZE)):
            raise ValueError(f"Unexpected p.15 source dimensions: {page_size!r}")

        source_text = page.get_text("text")
        missing = [phrase for phrase in REQUIRED_TEXT if phrase not in source_text]
        if missing:
            raise ValueError(f"Source PDF does not contain expected legend text: {missing}")

        text_blocks = [
            block
            for block in page.get_text("blocks")
            if len(block) >= 5 and str(block[4]).strip()
        ]
        if len(text_blocks) != EXPECTED_TEXT_BLOCKS:
            raise ValueError(
                f"Expected {EXPECTED_TEXT_BLOCKS} source text blocks; found {len(text_blocks)}"
            )

        for block in text_blocks:
            page.add_redact_annot(pymupdf.Rect(block[:4]), fill=None)
        # Keep source images and vector art untouched; remove text objects only.
        page.apply_redactions(images=0, graphics=0, text=0)
        remaining = page.get_text("text")
        if any(phrase in remaining for phrase in REQUIRED_TEXT):
            raise ValueError("Legend text remains after the text-only redaction")

        with Image.open(BACKGROUND) as reference:
            width, height = reference.size
        sx, sy = width / page.rect.width, height / page.rect.height
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(sx, sy), alpha=False)
        output.parent.mkdir(parents=True, exist_ok=True)

        if apply:
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
            # A high but lossy quality keeps the textured page compact and
            # avoids the very slow lossless encode for this grain-heavy image.
            image.save(BACKGROUND, format="WEBP", quality=94, method=2)
            output_path = BACKGROUND
        else:
            pixmap.save(output)
            output_path = output

    return len(text_blocks), output_path.stat().st_size


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--output", type=Path, default=PREVIEW)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="replace page_015/background.webp after preview comparison",
    )
    args = parser.parse_args()
    count, byte_size = render(args.pdf, args.output, apply=args.apply)
    target = BACKGROUND if args.apply else args.output
    print(f"p.15: removed {count} PDF text blocks; images/vector art preserved; output={target} ({byte_size} bytes)")


if __name__ == "__main__":
    main()
