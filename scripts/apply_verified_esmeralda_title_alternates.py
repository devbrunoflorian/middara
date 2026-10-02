"""Recover 30 pt Esmeralda Pro alternates from the PDF's actual glyph IDs.

Only the user's confirmed 30 pt Esmeralda Pro title class is inspected. The
PDF font's embedded CFF glyph order provides per-character ground truth; the
project PUA map converts those glyph names into browser-renderable characters.
Default mode validates and prints a report. --apply writes displayOverride on
only the matching spans while preserving their source text and geometry.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from io import BytesIO
from pathlib import Path

import pymupdf
from fontTools.cffLib import CFFFontSet


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"
PUA_FONT = ROOT / "apps/web/public/fonts/EsmeraldaPro-PUA.ttf"
PUA_MAP = ROOT / "apps/web/src/assets/pua_mapping.json"
MANIFEST = ROOT / "docs/project-progress/esmeralda-title-alternate-manifest.csv"


def source_font_glyphs(doc, page) -> tuple[int, list[str]]:
    candidates = [row[0] for row in page.get_fonts(full=True) if "EsmeraldaPro" in row[3]]
    if not candidates:
        raise ValueError("No embedded EsmeraldaPro font resource on source PDF page")
    font_bytes = doc.extract_font(candidates[0])[3]
    cff = CFFFontSet()
    cff.decompile(BytesIO(font_bytes), None)
    char_strings = cff[cff.fontNames[0]].CharStrings.charStrings
    return candidates[0], list(char_strings)


def load_alternate_map() -> dict[str, int]:
    data = json.loads(PUA_MAP.read_text(encoding="utf-8"))
    return {entry["name"]: ord(entry["pua_char"]) for entries in data.values() for entry in entries}


def iter_targets(page_data: dict):
    for block_index, block in enumerate(page_data.get("blocks", [])):
        for line_index, line in enumerate(block.get("lines", [])):
            for span_index, span in enumerate(line.get("spans", [])):
                if (
                    "EsmeraldaPro" in span.get("font", "")
                    and abs(float(span.get("size", 0)) - 30.0) <= 0.03
                    and any(char.isalpha() for char in span.get("text", ""))
                ):
                    yield block_index, line_index, span_index, span


def make_record(page_no: int, indices, span: dict, traces, glyph_order, font_xref, alt_map):
    block_index, line_index, span_index = indices
    original_text = span["text"]
    matches = []
    for trace in traces:
        trace_text = "".join(chr(char[0]) for char in trace["chars"] if char[0] > 0)
        if trace_text != original_text:
            continue
        if max(abs(trace["bbox"][axis] - span["bbox"][axis]) for axis in (0, 2)) > 3.0:
            continue
        matches.append(trace)
    if len(matches) != 1:
        raise ValueError(f"p.{page_no} {original_text!r}: expected one PDF trace match, found {len(matches)}")

    trace = matches[0]
    rendered_chars = []
    glyph_names = []
    alternates = []
    for char_index, char in enumerate(trace["chars"]):
        codepoint, glyph_id = char[0], char[1]
        if codepoint <= 0:
            continue
        if glyph_id >= len(glyph_order):
            raise ValueError(f"p.{page_no} {original_text!r}: glyph id {glyph_id} out of range")
        glyph_name = glyph_order[glyph_id]
        glyph_names.append(glyph_name)
        alternate = alt_map.get(glyph_name)
        if alternate is None:
            rendered_chars.append(chr(codepoint))
        else:
            rendered_chars.append(chr(alternate))
            alternates.append(f"{char_index}:{glyph_name}:U+{alternate:04X}")

    rendered_text = "".join(rendered_chars)
    if len(rendered_chars) != len(original_text):
        raise ValueError(f"p.{page_no} {original_text!r}: PDF glyph count differs from text length")
    return {
        "page": page_no,
        "blockIndex": block_index,
        "lineIndex": line_index,
        "spanIndex": span_index,
        "sourceText": original_text,
        "displayOverride": rendered_text,
        "displayCodepoints": " ".join(f"U+{ord(char):04X}" for char in rendered_text),
        "font": span.get("font", ""),
        "sizePt": f"{float(span['size']):.2f}",
        "sourceGlyphNames": "|".join(glyph_names),
        "alternateGlyphs": "|".join(alternates),
        "bbox": ",".join(f"{value:.2f}" for value in span["bbox"]),
        "pdfFontXref": font_xref,
        "evidence": "PDF embedded CFF glyph IDs matched to EsmeraldaPro-PUA cmap",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path, help="official source PDF used for visual fidelity")
    parser.add_argument("--apply", action="store_true", help="write reviewed per-character PUA display overrides")
    parser.add_argument("--write-manifest", action="store_true", help="refresh the tracked evidence manifest")
    args = parser.parse_args()

    doc = pymupdf.open(args.pdf)
    if len(doc) != 102:
        raise SystemExit(f"Expected the 102-page source PDF, found {len(doc)} pages")
    alt_map = load_alternate_map()
    pages: dict[int, tuple[Path, dict, bool]] = {}
    records = []
    for page_no in range(1, 103):
        path = PAGE_DIR / f"page_{page_no:03d}" / f"page_{page_no:03d}_dom.json"
        original = path.read_text(encoding="utf-8")
        page_data = json.loads(original)
        targets = list(iter_targets(page_data))
        if not targets:
            continue
        source_page = doc[page_no - 1]
        font_xref, glyph_order = source_font_glyphs(doc, source_page)
        traces = [
            trace for trace in source_page.get_texttrace()
            if "EsmeraldaPro" in trace["font"] and abs(float(trace["size"]) - 30.0) <= 0.03
        ]
        pages[page_no] = (path, page_data, original.endswith("\n"))
        for block_index, line_index, span_index, span in targets:
            record = make_record(
                page_no, (block_index, line_index, span_index), span, traces, glyph_order, font_xref, alt_map
            )
            records.append(record)

    changed = 0
    for record in records:
        if not record["alternateGlyphs"]:
            continue
        page_no = int(record["page"])
        _, page_data, _ = pages[page_no]
        span = page_data["blocks"][int(record["blockIndex"])]["lines"][int(record["lineIndex"])]["spans"][int(record["spanIndex"])]
        current = span.get("displayOverride")
        expected = record["displayOverride"]
        if current not in (None, expected):
            raise SystemExit(f"Existing displayOverride drift: p.{page_no} {record['sourceText']!r}")
        if current is None:
            print(f"p.{page_no}: {record['sourceText']} -> {record['alternateGlyphs']} ({'apply' if args.apply else 'dry run'})")
            if args.apply:
                span["displayOverride"] = expected
                changed += 1

    if args.write_manifest:
        manifest_fields = [field for field in records[0] if field != "displayOverride"]
        with MANIFEST.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=manifest_fields, lineterminator="\n")
            writer.writeheader()
            writer.writerows({key: value for key, value in record.items() if key != "displayOverride"} for record in records)

    if args.apply:
        for path, page_data, had_trailing_newline in pages.values():
            rendered = json.dumps(page_data, ensure_ascii=False, indent=2)
            path.write_text(rendered + ("\n" if had_trailing_newline else ""), encoding="utf-8")

    title_count = len(records)
    alternate_count = sum(bool(record["alternateGlyphs"]) for record in records)
    print(
        f"Validated {title_count} 30 pt Esmeralda spans; {alternate_count} contain PDF-selected alternates; "
        f"{'updated '+str(changed)+' spans' if args.apply else 'no JSON files written'}"
        + (f"; manifest {'written' if args.write_manifest else 'unchanged'}." )
    )


if __name__ == "__main__":
    main()
