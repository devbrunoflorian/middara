"""Verify a single-page export against its stored page dimensions and text."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]


def source_visible_text_character_count(value: object) -> int:
    """Count text still expected to be selectable, excluding text already in page artwork."""
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


def validate_selectable_content(source: object, extracted: str, image_count: int) -> int:
    expected_chars = source_visible_text_character_count(source)
    extracted_chars = len(extracted.strip())
    if expected_chars:
        minimum = max(1, min(100, (expected_chars + 1) // 2))
        if extracted_chars < minimum:
            raise ValueError(
                f"Too little selectable text was extracted ({extracted_chars} characters; "
                f"at least {minimum} expected from visible source text)."
            )
    elif not extracted_chars and image_count == 0:
        raise ValueError("The page has neither selectable source text nor embedded visual content.")
    return expected_chars


def contains_text_fragment(expected: str, extracted: str) -> bool:
    """Match text while tolerating a lost separator after a styled list marker.

    Chromium/PDF text extraction can join an alphabetic marker and the next
    styled run (for example, ``b. Faça`` -> ``b.Faça``). Limit that tolerance
    to a standalone lowercase marker immediately followed by an uppercase
    word; ordinary prose whitespace remains strict.
    """
    normalized_expected = " ".join(expected.split())
    normalized_extracted = " ".join(extracted.split())
    if normalized_expected in normalized_extracted:
        return True

    def compact_list_marker_space(value: str) -> str:
        return re.sub(r"(?<!\w)([a-z]\.)(\s+)(?=[A-Z\u00c0-\u00de])", r"\1", value)

    def compact_numbered_phase_marker_space(value: str) -> str:
        # The phase numeral and its heading occupy separate PageRenderer grid
        # columns. Text extraction may omit the visual advance between them.
        return re.sub(r"(?<!\w)([1-4]\.)(\s+)(?=[A-Z\u00c0-\u00de])", r"\1", value)

    expected_compact = compact_numbered_phase_marker_space(compact_list_marker_space(normalized_expected))
    extracted_compact = compact_numbered_phase_marker_space(compact_list_marker_space(normalized_extracted))
    return expected_compact in extracted_compact


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
    image_count = len(page.get_images(full=True))
    try:
        visible_source_characters = validate_selectable_content(source, extracted, image_count)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    if args.contains and not contains_text_fragment(args.contains, extracted):
        raise SystemExit(f"Required text was not found in the PDF: {args.contains!r}")
    if args.reject and args.reject in extracted:
        raise SystemExit(f"Unexpected text was found in the PDF: {args.reject!r}")

    private_use_count = sum(0xE000 <= ord(char) <= 0xF8FF for char in extracted)
    font_rows = font_evidence(document, page)
    print(json.dumps({
        "pdf": str(pdf_path),
        "pages": document.page_count,
        "pageSizePt": [round(width, 3), round(height, 3)],
        "expectedPageSizePt": [round(expected_width, 3), round(expected_height, 3)],
        "selectableCharacters": len(extracted),
        "visibleSourceCharactersExpected": visible_source_characters,
        "replacementCharacters": replacement_count,
        "privateUseCharacters": private_use_count,
        "embeddedImageObjects": image_count,
        "fonts": font_rows,
        "textLines": sum(len(block.get("lines", [])) for block in page.get_text("dict")["blocks"]),
        "selectableWords": len(page.get_text("words")),
    }, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
