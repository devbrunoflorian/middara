"""Verify the structure and raster visibility of every page in a merged export."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import pymupdf


def source_visible_text_character_count(value: object) -> int:
    if isinstance(value, dict):
        if value.get("hiddenFromPage") is True or value.get("rasterizedDuplicate") is True:
            return 0
        own_text = value.get("text")
        own_count = len(own_text.strip()) if isinstance(own_text, str) else 0
        return own_count + sum(
            source_visible_text_character_count(item)
            for key, item in value.items()
            if key != "text"
        )
    if isinstance(value, list):
        return sum(source_visible_text_character_count(item) for item in value)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("report", type=Path)
    parser.add_argument("parts", type=Path, nargs="+")
    args = parser.parse_args()

    snapshot_path = args.snapshot.resolve()
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    expected_pages = snapshot.get("pages")
    if not isinstance(expected_pages, list) or not expected_pages:
        raise ValueError("Snapshot has no ordered page list.")
    if any(not isinstance(page, int) or page < 1 or page > 102 for page in expected_pages):
        raise ValueError("Snapshot includes a page outside the 1–102 Rulebook range.")
    if expected_pages != sorted(set(expected_pages)):
        raise ValueError("Snapshot page order is not unique and increasing.")
    if len(args.parts) != len(expected_pages):
        raise ValueError(f"Expected one ordered single-page part per page, got {len(args.parts)}.")

    pdf_path = args.pdf.resolve()
    if not pdf_path.is_file() or pdf_path.stat().st_size < 1024:
        raise ValueError("The merged PDF is missing or unexpectedly small.")

    document = pymupdf.open(pdf_path)
    rows: list[dict[str, object]] = []
    try:
        if document.page_count != len(expected_pages):
            raise ValueError(f"Expected {len(expected_pages)} pages, got {document.page_count}.")

        for index, rulebook_page in enumerate(expected_pages):
            pdf_page = document[index]
            page_id = f"page_{rulebook_page:03d}"
            dom_path = snapshot_path.parent / "pages" / page_id / f"{page_id}_dom.json"
            if not dom_path.is_file():
                raise ValueError(f"Page {rulebook_page}: immutable source geometry is missing.")
            dom = json.loads(dom_path.read_text(encoding="utf-8"))
            expected_width = float(dom["width"])
            expected_height = float(dom["height"])
            width, height = pdf_page.rect.width, pdf_page.rect.height
            if abs(width - expected_width) > 0.5 or abs(height - expected_height) > 0.5:
                raise ValueError(
                    f"Page {rulebook_page}: size {width:.2f}×{height:.2f} pt differs from "
                    f"source {expected_width:.2f}×{expected_height:.2f} pt."
                )

            # Render each page, not just the PDF catalog, so broken content streams are caught.
            pixmap = pdf_page.get_pixmap(matrix=pymupdf.Matrix(0.16, 0.16), alpha=False)
            samples = memoryview(pixmap.samples)
            part_path = args.parts[index].resolve()
            if not part_path.is_file():
                raise ValueError(f"Page {rulebook_page}: merged source part is missing.")
            part_document = pymupdf.open(part_path)
            try:
                if part_document.page_count != 1:
                    raise ValueError(f"Page {rulebook_page}: merge part does not contain exactly one page.")
                part_pixmap = part_document[0].get_pixmap(matrix=pymupdf.Matrix(0.16, 0.16), alpha=False)
                if (pixmap.width, pixmap.height, hashlib.sha256(pixmap.samples).digest()) != (
                    part_pixmap.width,
                    part_pixmap.height,
                    hashlib.sha256(part_pixmap.samples).digest(),
                ):
                    raise ValueError(f"Page {rulebook_page}: merged page content/order differs from its verified part.")
            finally:
                part_document.close()
            channels = pixmap.n
            non_white = 0
            for offset in range(0, len(samples), channels):
                if min(samples[offset:offset + min(channels, 3)]) < 248:
                    non_white += 1
            pixel_count = max(1, pixmap.width * pixmap.height)
            non_white_fraction = non_white / pixel_count
            if not math.isfinite(non_white_fraction) or non_white_fraction < 0.001:
                raise ValueError(f"Page {rulebook_page}: rendered page appears blank.")

            extracted = pdf_page.get_text("text")
            replacement_characters = extracted.count("\ufffd")
            visible_source_characters = source_visible_text_character_count(dom)
            selectable_characters = len(extracted.strip())
            image_count = len(pdf_page.get_images(full=True))
            if replacement_characters:
                raise ValueError(f"Page {rulebook_page}: extracted text has replacement characters.")
            if visible_source_characters:
                minimum_text = max(1, min(100, (visible_source_characters + 1) // 2))
                if selectable_characters < minimum_text:
                    raise ValueError(
                        f"Page {rulebook_page}: extracted {selectable_characters} selectable characters; "
                        f"at least {minimum_text} expected from visible source text."
                    )
            elif not selectable_characters and image_count == 0:
                raise ValueError(f"Page {rulebook_page}: no selectable text or embedded visual content.")

            rows.append({
                "index": index + 1,
                "rulebookPage": rulebook_page,
                "pageSizePt": [round(width, 3), round(height, 3)],
                "renderedPixels": [pixmap.width, pixmap.height],
                "matchesOrderedPartRender": True,
                "nonWhitePixelFraction": round(non_white_fraction, 6),
                "selectableCharacters": selectable_characters,
                "visibleSourceCharactersExpected": visible_source_characters,
                "textExpected": visible_source_characters > 0,
                "images": image_count,
                "fonts": len(pdf_page.get_fonts(full=True)),
            })
    finally:
        document.close()

    report = {
        "pdf": str(pdf_path),
        "snapshotPagesInMergeOrder": expected_pages,
        "pageCount": len(rows),
        "renderedAndVerifiedPages": len(rows),
        "pagesWithSelectableText": sum(bool(row["selectableCharacters"]) for row in rows),
        "sourcePagesExpectedToContainText": sum(bool(row["textExpected"]) for row in rows),
        "pageSizeTolerancePt": 0.5,
        "pages": rows,
        "technicalVerificationOnly": True,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "pages"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
