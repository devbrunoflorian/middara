#!/usr/bin/env python3
"""Inventory mixed typography by block and baseline without editing page data."""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
OUTPUT_ROOT = ROOT / "tmp" / "ghost-audit" / "style-unit-separation"
FIELDS = [
    "page", "block_id", "existing_edit_units", "line_count", "span_count",
    "distinct_sizes_pt", "distinct_fonts", "bold_span_count", "italic_span_count",
    "mixed_size_baselines", "mixed_font_baselines", "size_varies_across_lines", "mixed_bold_baselines",
    "mixed_italic_baselines", "classification", "text_preview",
]


def style(span: dict[str, Any]) -> tuple[str, float, bool, bool]:
    flags = int(span.get("flags", 0) or 0)
    return (
        str(span.get("font", "")),
        round(float(span.get("size", 0.0) or 0.0), 2),
        bool(flags & 16),
        bool(flags & 2),
    )


def classify_block(block: dict[str, Any]) -> dict[str, Any]:
    lines = block.get("lines", [])
    span_lines = [[span for span in line.get("spans", []) if isinstance(span, dict)] for line in lines]
    all_spans = [span for spans in span_lines for span in spans]
    styles = [style(span) for span in all_spans]
    sizes = sorted({item[1] for item in styles})
    fonts = sorted({item[0] for item in styles})
    line_sizes = [sorted({style(span)[1] for span in spans}) for spans in span_lines if spans]
    line_fonts = [sorted({style(span)[0] for span in spans}) for spans in span_lines if spans]
    line_bolds = [sorted({style(span)[2] for span in spans}) for spans in span_lines if spans]
    line_italics = [sorted({style(span)[3] for span in spans}) for spans in span_lines if spans]
    mixed_size = sum(len(values) > 1 for values in line_sizes)
    varies_across_lines = len({tuple(values) for values in line_sizes}) > 1
    mixed_font = sum(len(values) > 1 for values in line_fonts)
    varies_style_across_lines = len({tuple(sorted(style(span) for span in spans)) for spans in span_lines if spans}) > 1
    mixed_bold = sum(len(values) > 1 for values in line_bolds)
    mixed_italic = sum(len(values) > 1 for values in line_italics)
    unit_count = sum(len(block.get(key, []) or []) for key in ("typographicUnits", "typographicSpanUnits", "creditUnits"))
    if block.get("creditUnit"):
        unit_count += 1
    has_units = unit_count > 0

    if has_units:
        classification = "units_already_defined"
    elif len(sizes) > 1 and mixed_size and varies_across_lines:
        classification = "inline_and_cross_line_size_mix"
    elif len(sizes) > 1 and mixed_size:
        classification = "same_baseline_mixed_sizes"
    elif len(sizes) > 1:
        classification = "cross_line_size_changes"
    elif mixed_bold or mixed_italic or mixed_font:
        classification = "same_baseline_rich_text_style"
    elif varies_style_across_lines:
        classification = "cross_line_style_changes"
    elif len(fonts) > 1:
        classification = "same_size_multiple_fonts"
    else:
        classification = "single_style_size_profile"

    text = "".join(str(span.get("text", "")) for span in all_spans)
    return {
        "existing_edit_units": unit_count,
        "line_count": len(lines),
        "span_count": len(all_spans),
        "distinct_sizes_pt": ",".join(f"{value:g}" for value in sizes),
        "distinct_fonts": len(fonts),
        "bold_span_count": sum(style(span)[2] for span in all_spans),
        "italic_span_count": sum(style(span)[3] for span in all_spans),
        "mixed_size_baselines": mixed_size,
        "mixed_font_baselines": mixed_font,
        "size_varies_across_lines": varies_across_lines,
        "mixed_bold_baselines": mixed_bold,
        "mixed_italic_baselines": mixed_italic,
        "classification": classification,
        "text_preview": " ".join(text.split())[:110],
    }


def main() -> None:
    rows: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    pages: set[int] = set()
    for path in sorted(PAGE_ROOT.glob("page_*/page_*_dom.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            page_number = int(data["page_number"])
            pages.add(page_number)
            for block in data.get("blocks", []):
                row = {"page": page_number, "block_id": str(block.get("id", "")), **classify_block(block)}
                rows.append(row)
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
            errors.append({"file": str(path.relative_to(ROOT)), "error": str(error)})

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    rows.sort(key=lambda row: (row["page"], row["block_id"]))
    with (OUTPUT_ROOT / "block-style-separation.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    classes = Counter(row["classification"] for row in rows)
    summary = {
        "pages_found": len(pages),
        "blocks_found": len(rows),
        "pages_with_parse_errors": len(errors),
        "classification_counts": dict(sorted(classes.items())),
        "multi_size_blocks_without_units": sum(
            row["classification"] in {
                "inline_and_cross_line_size_mix", "same_baseline_mixed_sizes", "cross_line_size_changes"
            } for row in rows
        ),
        "mixed_size_same_baseline_without_units": sum(
            row["classification"] in {"inline_and_cross_line_size_mix", "same_baseline_mixed_sizes"}
            for row in rows
        ),
        "interpretation": "structural style signals for triage; no class is a safe automatic split decision",
        "style_signature": "font family, size rounded to 0.01 pt, PyMuPDF bold bit 16, italic bit 2",
        "errors": errors,
    }
    (OUTPUT_ROOT / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
