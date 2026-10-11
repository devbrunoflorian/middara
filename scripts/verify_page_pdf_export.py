"""Verify a single-page export against its stored page dimensions and text."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]


def font_evidence(document: pymupdf.Document, page: pymupdf.Page) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    seen: set[int] = set()
    for item in page.get_fonts(full=True):
        xref, _, subtype, basefont, resource_name, encoding, _ = item
        if not xref or xref in seen:
            continue
        seen.add(xref)
        font_object = document.xref_object(xref)
        related_objects: list[str] = []
        references_to_visit = [xref]
        visited_references: set[int] = set()
        while references_to_visit:
            reference = references_to_visit.pop()
            if reference in visited_references:
                continue
            visited_references.add(reference)
            try:
                source = document.xref_object(reference)
            except Exception:
                continue
            related_objects.append(source)
            references_to_visit.extend(
                int(value) for value in re.findall(r"(\d+)\s+\d+\s+R", source)
            )
        has_font_program = any(
            re.search(r"/FontFile(?:2|3)?\s+\d+\s+\d+\s+R", source)
            for source in related_objects
        )
        has_type3_glyph_program = subtype == "Type3" and "/CharProcs" in font_object
        result.append({
            "resource": resource_name,
            "subtype": subtype,
            "baseFont": basefont,
            "encoding": encoding,
            "toUnicode": "/ToUnicode" in font_object,
            "embeddedFontProgram": bool(has_font_program),
            "embeddedType3Glyphs": has_type3_glyph_program,
        })
    return result


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
        normalized_extracted = " ".join(extracted.split())
        normalized_expected = " ".join(args.contains.split())
        if normalized_expected not in normalized_extracted:
            raise SystemExit(f"Required text was not found in the PDF: {args.contains!r}")
    if args.reject and args.reject in extracted:
        raise SystemExit(f"Unexpected text was found in the PDF: {args.reject!r}")

    private_use_count = sum(0xE000 <= ord(char) <= 0xF8FF for char in extracted)
    image_count = len(page.get_images(full=True))
    font_rows = font_evidence(document, page)
    print(json.dumps({
        "pdf": str(pdf_path),
        "pages": document.page_count,
        "pageSizePt": [round(width, 3), round(height, 3)],
        "expectedPageSizePt": [round(expected_width, 3), round(expected_height, 3)],
        "selectableCharacters": len(extracted),
        "replacementCharacters": replacement_count,
        "privateUseCharacters": private_use_count,
        "embeddedImageObjects": image_count,
        "fonts": font_rows,
        "textLines": sum(len(block.get("lines", [])) for block in page.get_text("dict")["blocks"]),
        "selectableWords": len(page.get_text("words")),
    }, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
