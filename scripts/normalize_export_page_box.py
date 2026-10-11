"""Normalize a browser-exported page to the source page's page boxes.

Chromium rounds fractional CSS page sizes when it creates the PDF. The HTML
content already uses source-point coordinates, so correct only the page box;
do not scale or rewrite the text and artwork to compensate for that rounding.
Copy CropBox, BleedBox, TrimBox, and ArtBox from the same source PDF page.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import tempfile

import pymupdf


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("width_pt", type=float)
    parser.add_argument("height_pt", type=float)
    parser.add_argument("source_pdf", type=Path, nargs="?")
    parser.add_argument("source_page_positional", type=int, nargs="?")
    parser.add_argument("--source-page-boxes-json", type=Path)
    parser.add_argument("--source-page", type=int)
    args = parser.parse_args()

    document = pymupdf.open(args.pdf)
    source_document = None
    source_page_number = args.source_page if args.source_page is not None else args.source_page_positional
    if source_page_number is None:
        raise ValueError("Specify a source page number.")
    try:
        if document.page_count != 1:
            raise ValueError(f"Expected one exported page, found {document.page_count}.")
        page = document[0]
        if args.source_page_boxes_json:
            if args.source_pdf:
                raise ValueError("Use either a source PDF or a page-box snapshot, not both.")
            snapshot = json.loads(args.source_page_boxes_json.read_text(encoding="utf-8"))
            page_boxes = snapshot.get("sourcePageBoxes", {}).get(str(source_page_number))
            if not page_boxes:
                raise ValueError(f"Source page {source_page_number} is missing from the immutable page-box snapshot.")
            source_media = pymupdf.Rect(*page_boxes["mediaBox"])
            expected_boxes = {
                "cropbox": pymupdf.Rect(*page_boxes["cropBox"]),
                "bleedbox": pymupdf.Rect(*page_boxes["bleedBox"]),
                "trimbox": pymupdf.Rect(*page_boxes["trimBox"]),
                "artbox": pymupdf.Rect(*page_boxes["artBox"]),
            }
        else:
            if not args.source_pdf:
                raise ValueError("Specify a source PDF or an immutable page-box snapshot.")
            source_document = pymupdf.open(args.source_pdf)
            if source_page_number < 1 or source_page_number > source_document.page_count:
                raise ValueError(
                    f"Source page {source_page_number} is outside the PDF page range "
                    f"1-{source_document.page_count}."
                )
            source_page = source_document[source_page_number - 1]
            source_media = source_page.mediabox
            expected_boxes = {
                "cropbox": source_page.cropbox,
                "bleedbox": source_page.bleedbox,
                "trimbox": source_page.trimbox,
                "artbox": source_page.artbox,
            }
        if (
            abs(source_media.width - args.width_pt) > 0.01
            or abs(source_media.height - args.height_pt) > 0.01
        ):
            raise ValueError(
                "Source PDF MediaBox does not match the requested page dimensions: "
                f"{tuple(source_media)} versus {args.width_pt} x {args.height_pt} pt."
            )
        current = page.mediabox
        if (
            abs(current.x0) > 0.01
            or abs(current.y0) > 0.01
            or abs(current.width - args.width_pt) > 1.0
            or abs(current.height - args.height_pt) > 1.0
        ):
            raise ValueError(
                "Refusing to rewrite unexpected MediaBox "
                f"{tuple(current)} for expected {args.width_pt} x {args.height_pt} pt."
            )

        page.set_mediabox(pymupdf.Rect(0, 0, args.width_pt, args.height_pt))
        page.set_cropbox(expected_boxes["cropbox"])
        page.set_bleedbox(expected_boxes["bleedbox"])
        page.set_trimbox(expected_boxes["trimbox"])
        page.set_artbox(expected_boxes["artbox"])
        updated = page.mediabox
        if (
            abs(updated.width - args.width_pt) > 0.0001
            or abs(updated.height - args.height_pt) > 0.0001
        ):
            raise ValueError(f"PyMuPDF did not preserve the requested page size: {tuple(updated)}")

        with tempfile.NamedTemporaryFile(
            prefix=f"{args.pdf.stem}.",
            suffix=".normalized.pdf",
            dir=args.pdf.resolve().parent,
            delete=False,
        ) as temporary:
            temp_path = Path(temporary.name)
        try:
            document.save(temp_path, garbage=4, deflate=True)
            document.close()
            os.replace(temp_path, args.pdf)
        finally:
            temp_path.unlink(missing_ok=True)
    finally:
        if not document.is_closed:
            document.close()
        if source_document is not None:
            source_document.close()

    reopened = pymupdf.open(args.pdf)
    try:
        page = reopened[0]
        if (
            abs(page.mediabox.width - args.width_pt) > 0.0001
            or abs(page.mediabox.height - args.height_pt) > 0.0001
        ):
            raise ValueError(f"Saved MediaBox mismatch: {tuple(page.mediabox)}")
        for box_name, expected in expected_boxes.items():
            actual = getattr(page, box_name)
            if any(abs(actual[index] - expected[index]) > 0.001 for index in range(4)):
                raise ValueError(
                    f"Saved {box_name} mismatch: {tuple(actual)} versus {tuple(expected)}."
                )
        print(
            f"MediaBox {tuple(page.mediabox)}; CropBox {tuple(page.cropbox)}; "
            f"BleedBox {tuple(page.bleedbox)}; TrimBox {tuple(page.trimbox)}; "
            f"ArtBox {tuple(page.artbox)}; extracted text characters: {len(page.get_text())}."
        )
    finally:
        reopened.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
