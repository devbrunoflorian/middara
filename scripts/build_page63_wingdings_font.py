"""Derive a browser-loadable cmap for page 63's embedded Wingdings subset.

The PDF uses Identity-H and provides no Unicode cmap. Its item marker is PDF
glyph ID 136; the script exposes only that outline at U+F088 in a local face.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pymupdf
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("apps/web/public/fonts/Middara-Wingdings-p63.ttf"))
    args = parser.parse_args()

    doc = pymupdf.open(args.pdf)
    page = doc[62]
    font_ref = next((font for font in page.get_fonts(full=True) if "Wingdings-Regular" in font[3]), None)
    if not font_ref:
        raise SystemExit("Page 63 has no embedded Wingdings-Regular font")
    traces = [
        char
        for trace in page.get_texttrace()
        if "Wingdings-Regular" in trace.get("font", "")
        for char in trace.get("chars", [])
        if char[1] == 136
    ]
    if len(traces) != 114:
        raise SystemExit(f"Expected 114 page-63 glyph-ID 136 markers; found {len(traces)}")

    _name, extension, _font_type, font_bytes = doc.extract_font(font_ref[0])
    if extension.lower() != "ttf":
        raise SystemExit(f"Expected embedded TrueType subset, received {extension}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    tmp_font = args.output.with_suffix(".source.ttf")
    tmp_font.write_bytes(font_bytes)
    font = TTFont(tmp_font)
    # Keep the embedded source timestamps so identical PDF inputs produce a
    # byte-identical derived font across runs.
    font.recalcTimestamp = False
    glyph_name = font.getGlyphOrder()[136]
    cmap = newTable("cmap")
    cmap.tableVersion = 0
    subtable = CmapSubtable.newSubtable(4)
    subtable.platformID = 3
    subtable.platEncID = 1
    subtable.language = 0
    subtable.cmap = {0xF088: glyph_name}
    cmap.tables = [subtable]
    font["cmap"] = cmap

    # PDF subset fonts may omit `post`, but Chrome's OpenType Sanitizer requires
    # it for TrueType webfonts. Format 3 carries no glyph-name mapping, so this
    # adds browser compatibility without changing the extracted outline.
    post = newTable("post")
    post.formatType = 3.0
    post.italicAngle = 0.0
    post.underlinePosition = -100
    post.underlineThickness = 50
    post.isFixedPitch = 0
    post.minMemType42 = 0
    post.maxMemType42 = 0
    post.minMemType1 = 0
    post.maxMemType1 = 0
    font["post"] = post

    for record in font["name"].names:
        if record.nameID in (1, 4, 6, 16, 17):
            value = "Middara Wingdings Page 63" if record.nameID in (1, 4, 16) else "MiddaraWingdingsP63"
            record.string = value.encode(record.getEncoding(), errors="replace")
    font.save(args.output)
    tmp_font.unlink()
    print(f"Embedded PDF glyph ID 136 -> U+F088 / {glyph_name}; verified {len(traces)} source traces")
    print(f"Wrote {args.output.resolve()}")


if __name__ == "__main__":
    main()
