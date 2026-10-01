"""Read-only, page-by-page fidelity screen comparing published DOM JSON to source PDF.

This script does not alter production page data. Metrics are triage signals, not
visual approval. Run it from the repository root with the official PDF path:

    py -3 scripts/audit_book_fidelity.py --pdf "C:/path/to/guide.pdf"
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from statistics import pstdev
from typing import Any

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "apps/web/public/pages"
DEFAULT_PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
DEFAULT_OUT = ROOT / "tmp/book-fidelity-audit"
FIELDS = [
    "page", "status", "json_exists", "pdf_spans", "json_spans", "span_delta",
    "text_mismatches", "style_mismatches", "bbox_mismatches", "pua_spans",
    "pua_codepoints", "pua_glyphs", "identity_h_spans", "cid_spans", "bold_spans",
    "bold_flag_name_discordance", "heavy_font_name_without_bold_flag", "font_map_risk_spans", "font_map_risk_families",
    "mixed_style_blocks", "center_alignment_candidates",
    "image_count", "content_image_count", "out_of_page_spans", "fonts", "flags",
]


def close_bbox(a: list[float], b: list[float], tolerance: float = 0.05) -> bool:
    return len(a) == len(b) and all(abs(float(x) - float(y)) <= tolerance for x, y in zip(a, b))


def color_hex(value: Any) -> str:
    if isinstance(value, str):
        return value.lower()
    return f"#{int(value or 0) & 0xFFFFFF:06x}"


def spans_from_pdf(page: pymupdf.Page) -> list[dict[str, Any]]:
    return [
        span
        for block in page.get_text("dict").get("blocks", [])
        if block.get("type") == 0
        for line in block.get("lines", [])
        for span in line.get("spans", [])
    ]


def spans_from_json(dom: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        span
        for block in dom.get("blocks", [])
        for line in block.get("lines", [])
        for span in line.get("spans", [])
    ]


def signature(span: dict[str, Any]) -> tuple[str, str, float, int, str]:
    return (
        span.get("text", ""),
        span.get("font", ""),
        round(float(span.get("size", 0)), 3),
        int(span.get("flags", 0)),
        color_hex(span.get("color", 0)),
    )


def center_candidates(dom: dict[str, Any]) -> int:
    """Count blocks whose variable-width lines have a stable shared center."""
    count = 0
    for block in dom.get("blocks", []):
        lines = [line for line in block.get("lines", []) if line.get("spans")]
        boxes = [line.get("bbox", []) for line in lines if len(line.get("bbox", [])) == 4]
        if len(boxes) < 3:
            continue
        widths = [box[2] - box[0] for box in boxes]
        if max(widths) - min(widths) < 4:
            continue
        centers = [(box[0] + box[2]) / 2 for box in boxes]
        if pstdev(centers) <= 2.0:
            count += 1
    return count


def font_map_risk(font_name: str) -> bool:
    """Flag source families rendered via system/remote fonts or generic fallback."""
    name = font_name.lower()
    if any(token in name for token in ("webdings", "wingdings", "zapfdingbats", "aristelle", "cinzeld decorative", "cinzeldecorative")):
        return True
    known_local = ("optima", "agaramondpro", "esmeralda", "cinzel")
    if any(token in name for token in known_local):
        return False
    if "adobehebrew" in name:
        return True
    return True


def scan_page(page_number: int, pdf_page: pymupdf.Page) -> dict[str, Any]:
    folder = PAGES / f"page_{page_number:03d}"
    path = folder / f"page_{page_number:03d}_dom.json"
    pdf_spans = spans_from_pdf(pdf_page)
    row: dict[str, Any] = {key: 0 for key in FIELDS}
    row.update({"page": page_number, "status": "machine-screened", "json_exists": path.exists()})
    row["pdf_spans"] = len(pdf_spans)

    if not path.exists():
        row["status"] = "needs-visual"
        row["flags"] = "missing-dom-json"
        return row

    dom = json.loads(path.read_text(encoding="utf-8"))
    json_spans = spans_from_json(dom)
    row["json_spans"] = len(json_spans)
    row["span_delta"] = len(json_spans) - len(pdf_spans)

    source_counts = Counter(signature(span) for span in pdf_spans)
    json_counts = Counter(signature(span) for span in json_spans)
    row["text_mismatches"] = sum((source_counts - json_counts).values()) + sum((json_counts - source_counts).values())
    source_style = Counter((s.get("font", ""), round(float(s.get("size", 0)), 3), int(s.get("flags", 0)), color_hex(s.get("color", 0))) for s in pdf_spans)
    json_style = Counter((s.get("font", ""), round(float(s.get("size", 0)), 3), int(s.get("flags", 0)), color_hex(s.get("color", 0))) for s in json_spans)
    row["style_mismatches"] = sum((source_style - json_style).values()) + sum((json_style - source_style).values())

    by_signature: dict[tuple[str, str, float, int, str], list[list[float]]] = {}
    for span in pdf_spans:
        by_signature.setdefault(signature(span), []).append(list(span.get("bbox", [])))
    for span in json_spans:
        key = signature(span)
        candidates = by_signature.get(key, [])
        bbox = list(span.get("bbox", []))
        if candidates:
            matched = next((i for i, candidate in enumerate(candidates) if close_bbox(candidate, bbox)), None)
            if matched is None:
                row["bbox_mismatches"] += 1
            else:
                candidates.pop(matched)
        else:
            row["bbox_mismatches"] += 1

    row["pua_spans"] = sum(any(unicodedata.category(ch) == "Co" for ch in s.get("text", "")) for s in pdf_spans)
    row["pua_codepoints"] = sum(sum(unicodedata.category(ch) == "Co" for ch in s.get("text", "")) for s in pdf_spans)
    row["pua_glyphs"] = ";".join(sorted({f"U+{ord(ch):04X}" for s in pdf_spans for ch in s.get("text", "") if unicodedata.category(ch) == "Co"}))
    row["identity_h_spans"] = sum("Identity-H" in s.get("font", "") for s in pdf_spans)
    row["cid_spans"] = sum(bool(re.search(r"\(cid:\d+\)", s.get("text", ""), re.I)) for s in pdf_spans)
    named_heavy = lambda span: bool(re.search(r"bold|black|demi", span.get("font", ""), re.I))
    row["bold_spans"] = sum(bool((int(s.get("flags", 0)) & 16) or named_heavy(s)) for s in pdf_spans)
    row["bold_flag_name_discordance"] = sum(
        bool(int(s.get("flags", 0)) & 16) and not named_heavy(s)
        for s in pdf_spans if s.get("text", "").strip()
    )
    row["heavy_font_name_without_bold_flag"] = sum(
        named_heavy(s) and not bool(int(s.get("flags", 0)) & 16)
        for s in pdf_spans if s.get("text", "").strip()
    )
    risky_fonts = sorted({s.get("font", "") for s in pdf_spans if s.get("text", "").strip() and font_map_risk(s.get("font", ""))})
    row["font_map_risk_spans"] = sum(1 for s in pdf_spans if s.get("text", "").strip() and font_map_risk(s.get("font", "")))
    row["font_map_risk_families"] = ";".join(risky_fonts)

    mixed = 0
    for block in dom.get("blocks", []):
        styles = {(s.get("font", ""), round(float(s.get("size", 0)), 2), int(s.get("flags", 0)), color_hex(s.get("color", 0)))
                  for line in block.get("lines", []) for s in line.get("spans", []) if s.get("text", "").strip()}
        mixed += len(styles) > 1
    row["mixed_style_blocks"] = mixed
    row["center_alignment_candidates"] = center_candidates(dom)

    images = dom.get("images", [])
    row["image_count"] = len(images)
    row["content_image_count"] = sum(image.get("role") == "content" for image in images)
    width, height = float(dom.get("width", pdf_page.rect.width)), float(dom.get("height", pdf_page.rect.height))
    row["out_of_page_spans"] = sum(
        len(s.get("bbox", [])) != 4 or s["bbox"][0] < -1 or s["bbox"][1] < -1 or s["bbox"][2] > width + 1 or s["bbox"][3] > height + 1
        for s in json_spans
    )
    row["fonts"] = ";".join(sorted({s.get("font", "") for s in pdf_spans if s.get("font")}))
    row["flags"] = ";".join(filter(None, [
        "span-count-delta" if row["span_delta"] else "",
        "span-content-style-mismatch" if row["text_mismatches"] or row["style_mismatches"] else "",
        "span-bbox-mismatch" if row["bbox_mismatches"] else "",
        "pua-present" if row["pua_spans"] else "",
        "identity-h-present" if row["identity_h_spans"] else "",
        "cid-text-present" if row["cid_spans"] else "",
        "bold-flag-font-name-discordance" if row["bold_flag_name_discordance"] else "",
        "font-family-mapped-via-remote-or-system-fallback" if row["font_map_risk_spans"] else "",
        "span-outside-page" if row["out_of_page_spans"] else "",
    ]))
    if row["flags"]:
        row["status"] = "needs-visual"
    return row


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    if not args.pdf.exists():
        parser.error(f"PDF not found: {args.pdf}")

    args.output.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(args.pdf)
    rows = [scan_page(number, doc[number - 1]) for number in range(1, doc.page_count + 1)]
    with (args.output / "page-matrix.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    summary = {
        "pdf": str(args.pdf), "pdf_pages": doc.page_count, "json_pages": sum(bool(row["json_exists"]) for row in rows),
        "machine_screened": len(rows), "needs_visual": sum(row["status"] == "needs-visual" for row in rows),
        "pages_with_pua": sum(bool(row["pua_spans"]) for row in rows),
        "pua_codepoints_total": sum(int(row["pua_codepoints"]) for row in rows),
        "pages_with_identity_h": sum(bool(row["identity_h_spans"]) for row in rows),
        "pages_with_cid_text": sum(bool(row["cid_spans"]) for row in rows),
        "pages_with_span_mismatch": sum(bool(row["text_mismatches"] or row["style_mismatches"]) for row in rows),
        "pages_with_bbox_mismatch": sum(bool(row["bbox_mismatches"]) for row in rows),
        "pages_with_bold_flag_without_heavy_font_name": sum(bool(row["bold_flag_name_discordance"]) for row in rows),
        "heavy_font_name_without_bold_flag_spans": sum(int(row["heavy_font_name_without_bold_flag"]) for row in rows),
        "pages_with_font_map_risk": sum(bool(row["font_map_risk_spans"]) for row in rows),
        "font_map_risk_spans": sum(int(row["font_map_risk_spans"]) for row in rows),
        "pages_with_out_of_page_spans": sum(bool(row["out_of_page_spans"]) for row in rows),
        "pages_with_center_alignment_candidates": sum(bool(row["center_alignment_candidates"]) for row in rows),
        "visual_approval_count": 0,
        "note": "Machine flags are review candidates; no page is visually approved by this scan.",
    }
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
