"""Set a browser-exported page's MediaBox to the source page dimensions.

Chromium rounds fractional CSS page sizes when it creates the PDF. The HTML
content already uses source-point coordinates, so correct only the page box;
do not scale or rewrite the text and artwork to compensate for that rounding.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import tempfile

import pymupdf


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("width_pt", type=float)
    parser.add_argument("height_pt", type=float)
    args = parser.parse_args()

    document = pymupdf.open(args.pdf)
    try:
        if document.page_count != 1:
            raise ValueError(f"Expected one exported page, found {document.page_count}.")
        page = document[0]
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

    reopened = pymupdf.open(args.pdf)
    try:
        page = reopened[0]
        if (
            abs(page.mediabox.width - args.width_pt) > 0.0001
            or abs(page.mediabox.height - args.height_pt) > 0.0001
        ):
            raise ValueError(f"Saved MediaBox mismatch: {tuple(page.mediabox)}")
        print(
            f"MediaBox normalized to {page.mediabox.width:.6f} x "
            f"{page.mediabox.height:.6f} pt; extracted text characters: "
            f"{len(page.get_text())}."
        )
    finally:
        reopened.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
