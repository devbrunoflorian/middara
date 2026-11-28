"""Apply the Rulebook's digital Optima regular ink adjustment to a PDF copy.

Requires PyMuPDF and skia-pathops. The text codes, advances, and resources for
page artwork stay in place. This adjusts exported Type3 contours, not font files.
"""

from __future__ import annotations

import argparse
from functools import lru_cache
import os
from pathlib import Path
import re
import shutil
import tempfile

import pathops
from pathops import PathVerb
import pymupdf


INSET = 4.0  # 0.004 em per edge, calibrated for the digital reader proof.
MARKER = "MiddaraOptimaRegularInkInset"
REFERENCE = re.compile(r"/[^\s/<>\[\]()]+\s+(\d+)\s+0\s+R")


def font_procedures(document: pymupdf.Document, font: int) -> set[int]:
    kind, value = document.xref_get_key(font, "CharProcs")
    if kind == "xref":
        value = document.xref_object(int(value.split()[0]))
    return {int(ref) for ref in REFERENCE.findall(value)}


def regular_optima_procedures(document: pymupdf.Document) -> set[int]:
    fonts = {font[0] for page in document for font in page.get_fonts() if font[2] == "Type3"}
    optima, protected = set(), set()
    for font in fonts:
        kind, descriptor = document.xref_get_key(font, "FontDescriptor")
        name = ""
        if kind == "xref":
            name = document.xref_get_key(int(descriptor.split()[0]), "FontName")[1]
        elif kind == "dict":
            name = document.xref_get_key(font, "FontDescriptor/FontName")[1]
        face = name.lstrip("/").split("+")[-1]
        matrix = document.xref_get_key(font, "FontMatrix")[1]
        is_chromium_optima = face == "OptimaLTStd" and matrix == "[.001 0 0 -.001 0 0]"
        (optima if is_chromium_optima else protected).update(font_procedures(document, font))
    return optima - protected


def contours(path: pathops.Path) -> int:
    return sum(verb == PathVerb.CLOSE for verb, _ in path)


def two_thirds(start, end):
    return tuple(a + (b - a) * 2 / 3 for a, b in zip(start, end))


def path_commands(path: pathops.Path) -> list[str]:
    operators = {PathVerb.MOVE: "m", PathVerb.LINE: "l", PathVerb.CUBIC: "c", PathVerb.CLOSE: "h"}
    result = []
    current = (0.0, 0.0)
    for verb, points in path:
        if verb == PathVerb.QUAD:
            control, end = points
            points = (two_thirds(current, control), two_thirds(end, control), end)
            verb = PathVerb.CUBIC
        coordinates = [f"{value:.3f}".rstrip("0").rstrip(".") for point in points for value in point]
        result.append(" ".join([*coordinates, operators[verb]]))
        if points:
            current = points[-1]
    return result


@lru_cache(maxsize=8192)
def adjusted_glyph(stream: bytes) -> bytes:
    rows = stream.strip().splitlines()
    if len(rows) < 2 or not re.fullmatch(rb"[-.\d ]+ d1", rows[0]) or rows[-1] != b"f":
        return stream
    outline = pathops.Path()
    operators = {
        b"m": (2, outline.moveTo), b"l": (2, outline.lineTo),
        b"c": (6, outline.cubicTo), b"h": (0, outline.close),
    }
    for row in rows[1:-1]:
        tokens = row.split()
        if not tokens or tokens[-1] not in operators:
            return stream
        operator = tokens[-1]
        count, command = operators[operator]
        if len(tokens) - 1 != count:
            return stream
        try:
            coordinates = tuple(map(float, tokens[:-1]))
        except ValueError:
            return stream
        command(*coordinates)
    if not outline.area:
        return stream

    boundary = pathops.Path(outline)
    try:
        boundary.stroke(INSET * 2, pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4)
        boundary.convertConicsToQuads(0.1)
        interior = pathops.op(outline, boundary, pathops.PathOp.DIFFERENCE)
        # Keep small accents, punctuation and counters intact.
        if abs(interior.area) < abs(outline.area) * 0.62 or contours(interior) != contours(outline):
            return stream
        commands = path_commands(interior)
    except (pathops.PathOpsError, KeyError):
        return stream
    return rows[0] + b"\n" + ("\n".join(commands) + "\nf\n").encode("ascii")


def apply_adjustment(document: pymupdf.Document) -> tuple[int, int]:
    if document.xref_get_key(document.pdf_catalog(), MARKER)[0] != "null":
        raise ValueError("This PDF already has the Optima ink adjustment.")
    candidates = regular_optima_procedures(document)
    updated = 0
    for ref in sorted(candidates):
        original = document.xref_stream(ref)
        if not original:
            continue
        adjusted = adjusted_glyph(original)
        if adjusted != original:
            document.update_stream(ref, adjusted)
            updated += 1
    if updated:
        document.xref_set_key(document.pdf_catalog(), MARKER, str(INSET / 1000))
    return updated, len(candidates)


def verify_copy(source: Path, copy: Path) -> None:
    with pymupdf.open(source) as before, pymupdf.open(copy) as after:
        if len(before) != len(after) or after.is_repaired or before.get_toc(False) != after.get_toc(False):
            raise ValueError("The candidate PDF changed the page count or bookmarks.")
        page_boxes = ("mediabox", "trimbox", "bleedbox", "cropbox", "artbox")
        for src, dst in zip(before, after):
            if any(getattr(src, box) != getattr(dst, box) for box in page_boxes):
                raise ValueError(f"Page {src.number + 1}: page boxes changed.")
            if src.get_text() != dst.get_text() or src.get_links() != dst.get_links():
                raise ValueError(f"Page {src.number + 1}: selectable text or links changed.")
            if src.get_text("words") != dst.get_text("words"):
                raise ValueError(f"Page {src.number + 1}: word geometry changed.")
            if src.read_contents() != dst.read_contents():
                raise ValueError(f"Page {src.number + 1}: page content operators changed.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    if source == output or output.exists():
        parser.error("Choose a separate, new PDF output.")
    with tempfile.NamedTemporaryFile(suffix=".pdf", dir=output.parent, delete=False) as temp:
        staged = Path(temp.name)
    try:
        shutil.copyfile(source, staged)
        with pymupdf.open(staged) as document:
            updated, candidates = apply_adjustment(document)
            if not updated:
                raise ValueError("No matching regular Optima glyphs were adjusted.")
            document.saveIncr()
        verify_copy(source, staged)
        os.replace(staged, output)
        print(f"Adjusted {updated} of {candidates} glyph resources. Verified text, word geometry, links and page boxes.")
    finally:
        staged.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
