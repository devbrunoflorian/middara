"""Restore the embedded PASSIVE pictogram and expose standalone headings for editing.

The source PDF embeds the exact ZapfDingbats outline for U+2724. The web app
does not ship that font, so copy its glyph outline into the existing inline SVG
render path. On pages 61 and 62, create independent editor fields around title
lines already separated by the source PDF; this does not change page geometry.
"""

from __future__ import annotations

import argparse
import io
import json
import shutil
from pathlib import Path

import pymupdf
from fontTools.cffLib import CFFFontSet
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")

PASSIVE_GLYPHS = {
    (59, "block_55", "line_55_0", 0): "✤ ",
    (59, "block_195", "line_195_1", 1): "✤",
    (61, "block_62", "line_62_1", 1): "✤",
}

UNIT_TARGETS = {
    61: {
        "block_62": [("heading", ["line_62_0"]), ("body", ["line_62_1", "line_62_2"])],
        "block_63": [("heading", ["line_63_0"]), ("body", [f"line_63_{i}" for i in range(1, 8)])],
        "block_74": [("heading", ["line_74_0"]), ("body", [f"line_74_{i}" for i in range(1, 5)])],
        "block_77": [("heading", ["line_77_0"]), ("body", [f"line_77_{i}" for i in range(1, 3)])],
    },
    62: {
        "block_32": [
            ("intro", [f"line_32_{i}" for i in range(0, 4)]),
            ("towards-away-heading", ["line_32_4", "line_32_5"]),
            ("towards-away-body", [f"line_32_{i}" for i in range(6, 18)]),
        ],
        "block_35": [
            ("movement-rules-body", [f"line_35_{i}" for i in range(0, 3)]),
            ("then-heading", ["line_35_3"]),
        ],
    },
}


def passive_svg_path(pdf: Path) -> str:
    with pymupdf.open(pdf) as document:
        font_xref = next(
            xref
            for font in document[58].get_fonts(full=True)
            if "ZapfDingbatsStd" in font[3]
            for xref in [font[0]]
        )
        _, _, _, raw_font = document.extract_font(font_xref)

    font_set = CFFFontSet()
    font_set.decompile(io.BytesIO(raw_font), None, isCFF2=False)
    top = font_set[font_set.fontNames[0]]
    if "uni2724" not in top.CharStrings.charStrings:
        raise SystemExit("The embedded Zapf subset does not contain U+2724.")

    # Fit the original 718x719-unit glyph into the existing 917x1000 SVG box.
    # The visible width is 788/917 of the CSS width, matching the PDF span's
    # measured 7.09pt/9pt advance. Preserve the source glyph's curves exactly.
    sx = 788 / 718
    sy = 1000 / 719
    tx = 64.5 - sx * 35
    ty = sy * 705
    pen = SVGPathPen(None, ntos=lambda value: f"{value:.3f}".rstrip("0").rstrip("."))
    top.CharStrings["uni2724"].draw(TransformPen(pen, (sx, 0, 0, -sy, tx, ty)))
    return pen.getCommands()


def union_bbox(lines: list[dict]) -> list[float]:
    return [
        min(line["bbox"][0] for line in lines),
        min(line["bbox"][1] for line in lines),
        max(line["bbox"][2] for line in lines),
        max(line["bbox"][3] for line in lines),
    ]


def make_units(page: int, block: dict, specs: list[tuple[str, list[str]]]) -> list[dict]:
    lines = {line["id"]: line for line in block.get("lines", [])}
    result = []
    block_bbox = block["bbox"]
    for name, line_ids in specs:
        missing = [line_id for line_id in line_ids if line_id not in lines]
        if missing:
            raise SystemExit(f"p.{page} {block['id']} is missing lines: {missing}")
        selected = [lines[line_id] for line_id in line_ids]
        content = "".join(span["text"] for line in selected for span in line.get("spans", []))
        if not content.strip():
            raise SystemExit(f"Refusing empty editor field p.{page} {block['id']} {name}.")
        unit_id = f"p{page}-block-{block['id'].split('_')[-1]}-{name}"
        bbox = union_bbox(selected)
        result.append({
            "id": unit_id,
            "field": {
                "id": f"{unit_id}-field",
                "lineIds": line_ids,
                "bbox": bbox,
                "frame": {
                    "x": bbox[0],
                    "width": max(block_bbox[2] - bbox[0], 1),
                    "textAlign": "left",
                    "lineHeight": 1,
                },
            },
        })
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=PDF)
    parser.add_argument("--apply", action="store_true", help="write the page-local DOM metadata")
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise SystemExit(f"Reference PDF not found: {args.pdf}")
    glyph_path = passive_svg_path(args.pdf)
    changes: list[str] = []
    updates: dict[Path, dict] = {}

    for page in (59, 61, 62):
        dom_path = ROOT / f"apps/web/public/pages/page_{page:03d}/page_{page:03d}_dom.json"
        data = json.loads(dom_path.read_text(encoding="utf-8"))
        if data.get("page_number") != page:
            raise SystemExit(f"Unexpected page number in {dom_path}.")
        blocks = {block["id"]: block for block in data.get("blocks", [])}

        if page in (59, 61):
            for target_page, block_id, line_id, span_index in PASSIVE_GLYPHS:
                if target_page != page:
                    continue
                block = blocks.get(block_id)
                line = next((item for item in block.get("lines", []) if item.get("id") == line_id), None) if block else None
                spans = line.get("spans", []) if line else []
                if span_index >= len(spans) or spans[span_index].get("text") != PASSIVE_GLYPHS[(target_page, block_id, line_id, span_index)]:
                    actual = spans[span_index].get("text") if span_index < len(spans) else "<missing>"
                    raise SystemExit(f"Stale p.{page} PASSIVE target {block_id}/{line_id}:{span_index}: {actual!r}")
                if spans[span_index].get("font") != "ZapfDingbatsStd":
                    raise SystemExit(f"Unexpected font for p.{page} PASSIVE pictogram.")
                if spans[span_index].get("pictogramSvgPath") != glyph_path:
                    spans[span_index]["pictogramSvgPath"] = glyph_path
                    changes.append(f"p.{page} vector glyph {block_id}/{line_id}:{span_index}")
                if block_id == "block_195" and not line.get("renderSourceSpanGeometry"):
                    line["renderSourceSpanGeometry"] = True
                    changes.append("p.59 keep inline PASSIVE tag at the PDF's measured position")
                if page == 61 and block_id == "block_62" and not line.get("renderSourceSpanGeometry"):
                    line["renderSourceSpanGeometry"] = True
                    changes.append("p.61 keep inline PASSIVE tag at the PDF's measured position")

        for block_id, specs in UNIT_TARGETS.get(page, {}).items():
            block = blocks.get(block_id)
            if block is None:
                raise SystemExit(f"p.{page} missing expected block {block_id}.")
            if block.get("typographicUnits"):
                raise SystemExit(f"p.{page} {block_id} already has typographicUnits; inspect manually.")
            made = make_units(page, block, specs)
            block["typographicUnits"] = made
            changes.append(f"p.{page} {block_id} editor fields: " + ", ".join(name for name, _ in specs))

        updates[dom_path] = data

    print(f"PASSIVE glyph path length: {len(glyph_path)} SVG characters")
    print(f"Planned metadata changes: {len(changes)}; apply={args.apply}")
    for change in changes:
        print(f"  {change}")

    if args.apply:
        backup_dir = ROOT / "tmp/visual-followup/dom-backups-2026-10-03"
        backup_dir.mkdir(parents=True, exist_ok=True)
        for dom_path, data in updates.items():
            shutil.copy2(dom_path, backup_dir / dom_path.name)
            dom_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Backups saved in {backup_dir.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
