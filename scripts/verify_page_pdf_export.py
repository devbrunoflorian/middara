"""Verify a single-page export against its stored page dimensions and text."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--page", type=int, required=True, help="1-based rulebook page represented in the PDF")
    parser.add_argument("--contains", help="required extracted text fragment, for example 'As árvores estavam nuas'")
    parser.add_argument("--reject", help="text fragment that must not appear, for example the English source sentence")
    args = parser.parse_args()

    page_id = f"{args.page:03d}"
    source_json = ROOT / "apps/web/public/pages" / f"page_{page_id}" / f"page_{page_id}_dom.json"
    if not source_json.is_file():
        raise SystemExit(f"Missing source page geometry: {source_json}")
    source = json.loads(source_json.read_text(encoding="utf-8"))
    expected_width = float(source["width"])
    expected_height = float(source["height"])

    pdf_path = args.pdf.resolve()
    if not pdf_path.is_file():
        raise SystemExit(f"PDF not found: {pdf_path}")
    document = pymupdf.open(pdf_path)
    if document.page_count != 1:
        raise SystemExit(f"Expected exactly one page, found {document.page_count}.")
    page = document[0]
    width, height = page.rect.width, page.rect.height
    if abs(width - expected_width) > 0.5 or abs(height - expected_height) > 0.5:
        raise SystemExit(
            f"Page dimensions differ from source geometry: PDF={width:.2f}x{height:.2f}pt, "
            f"expected={expected_width:.2f}x{expected_height:.2f}pt."
        )

    extracted = page.get_text()
    replacement_count = extracted.count("\ufffd")
    if replacement_count:
        raise SystemExit(f"Text map contains {replacement_count} replacement characters.")
    if len(extracted.strip()) < 100:
        raise SystemExit(f"Too little selectable text was extracted ({len(extracted.strip())} characters).")
    if args.contains and args.contains not in extracted:
        raise SystemExit(f"Required text was not found in the PDF: {args.contains!r}")
    if args.reject and args.reject in extracted:
        raise SystemExit(f"Unexpected text was found in the PDF: {args.reject!r}")

    private_use_count = sum(0xE000 <= ord(char) <= 0xF8FF for char in extracted)
    image_count = len(page.get_images(full=True))
    print(json.dumps({
        "pdf": str(pdf_path),
        "pages": document.page_count,
        "pageSizePt": [round(width, 3), round(height, 3)],
        "expectedPageSizePt": [round(expected_width, 3), round(expected_height, 3)],
        "selectableCharacters": len(extracted),
        "replacementCharacters": replacement_count,
        "privateUseCharacters": private_use_count,
        "embeddedImageObjects": image_count,
        "fonts": [font[3] for font in page.get_fonts(full=True)],
    }, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
