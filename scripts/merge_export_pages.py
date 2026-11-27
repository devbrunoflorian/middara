"""Merge independently verified single-page PDFs without changing page geometry."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import pymupdf
from contents_pdf_links import add_contents_links, page_number_for_part, verify_contents_links


def bookmarks_from_contents_page(page: pymupdf.Page, page_count: int) -> list[list[object]]:
    headings: list[dict[str, object]] = []
    page_numbers: list[dict[str, float | int]] = []
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
            if not text:
                continue
            x, y = line["bbox"][0], line["bbox"][1]
            if y < 100 or y > 780:
                continue
            if x < 240:
                headings.append({"x": x, "y": y, "text": text})
            elif x > 600 and re.fullmatch(r"\d{1,3}", text):
                page_numbers.append({"y": y, "page": int(text)})

    bookmarks: list[list[object]] = []
    for heading in headings:
        nearest = min(
            page_numbers,
            key=lambda row: abs(float(row["y"]) - float(heading["y"])),
            default=None,
        )
        if not nearest or abs(float(nearest["y"]) - float(heading["y"])) > 3.5:
            continue
        target = int(nearest["page"])
        title = str(heading["text"])
        if not 1 <= target <= page_count:
            continue
        if "\ufffd" in title:
            raise ValueError("The table of contents contains a replacement character.")
        bookmarks.append([1 if float(heading["x"]) < 160 else 2, title, target])

    if len(bookmarks) < 30:
        raise ValueError(f"Expected at least 30 table-of-contents bookmarks, found {len(bookmarks)}.")
    return bookmarks


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    parser.add_argument('pages', type=Path, nargs='+')
    args = parser.parse_args()
    if not args.pages:
        raise ValueError('At least one verified page is required.')
    rulebook_pages = [page_number_for_part(path) for path in args.pages]
    if rulebook_pages != sorted(set(rulebook_pages)):
        raise ValueError('PDF parts must contain unique Rulebook pages in increasing order.')

    merged = pymupdf.open()
    contents_link_specs: list[dict[str, object]] = []
    try:
        for page_path in args.pages:
            if not page_path.is_file():
                raise FileNotFoundError(f'Missing verified page: {page_path.name}')
            source = pymupdf.open(page_path)
            try:
                if source.page_count != 1:
                    raise ValueError(f'{page_path.name} must contain exactly one page.')
                merged.insert_pdf(source, links=True, annots=True)
            finally:
                source.close()
        if len(args.pages) == 102 and args.pages[2].stem == "page-003":
            bookmarks = bookmarks_from_contents_page(merged[2], len(args.pages))
            merged.set_toc(bookmarks)
        contents_link_specs = add_contents_links(merged, rulebook_pages)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        merged.save(args.output, garbage=3, deflate=True)
    finally:
        merged.close()

    result = pymupdf.open(args.output)
    try:
        if result.page_count != len(args.pages):
            raise ValueError(f'Expected {len(args.pages)} pages, merged {result.page_count}.')
        for index, page_path in enumerate(args.pages):
            page_source = pymupdf.open(page_path)
            try:
                expected = page_source[0].mediabox
                actual = result[index].mediabox
                if abs(actual.width - expected.width) > 0.01 or abs(actual.height - expected.height) > 0.01:
                    raise ValueError(f'Page box changed while merging {page_path.name}.')
            finally:
                page_source.close()
        bookmark_count = len(result.get_toc())
        verify_contents_links(result, contents_link_specs)
        contents_links_count = len(contents_link_specs)
        if len(args.pages) == 102 and bookmark_count < 30:
            raise ValueError(f"Expected at least 30 bookmarks in the merged PDF, found {bookmark_count}.")
    finally:
        result.close()
    print(
        f'Merged {len(args.pages)} verified pages, {bookmark_count} bookmarks, '
        f'and {contents_links_count} contents/index links into {args.output.name}.'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
