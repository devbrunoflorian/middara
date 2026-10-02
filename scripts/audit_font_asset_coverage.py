"""Inventory PDF font families against the font faces bundled by the viewer.

This is a read-only coverage check. A missing local @font-face is a risk,
not permission to substitute a different font or reveal a suppressed glyph.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"
FONT_CSS = ROOT / "apps/web/src/fonts.css"
RENDERER = ROOT / "apps/web/src/components/PageRenderer.tsx"


def viewer_family(pdf_font: str) -> str:
    if "OptimaLTStd" in pdf_font or "AdobeHebrew" in pdf_font:
        return "OptimaLTStd"
    if "AGaramondPro" in pdf_font:
        return "AGaramondPro"
    if "CinzelDecorative" in pdf_font:
        return "Cinzel Decorative"
    if "Cinzel" in pdf_font:
        return "CinzelLocal"
    if "Esmeralda" in pdf_font:
        return "EsmeraldaPro"
    if "Aristelle" in pdf_font:
        return "AristelleSans"
    if "Wingdings3" in pdf_font:
        return "Wingdings 3"
    if "Wingdings" in pdf_font:
        return "WingdingsLocal"
    if "Webdings" in pdf_font:
        return "WebdingsLocal"
    if "ZapfDingbats" in pdf_font:
        return "Zapf Dingbats"
    return f"pdf-fallback:{pdf_font}"


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = list(rows[0]) if rows else []
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-dir", type=Path, default=PAGE_DIR)
    parser.add_argument("--out-dir", type=Path, default=ROOT / "tmp/font-asset-audit")
    parser.add_argument("--pages", type=int, nargs="+", help="Page numbers; default scans all 102 pages")
    args = parser.parse_args()

    css = FONT_CSS.read_text(encoding="utf-8")
    renderer = RENDERER.read_text(encoding="utf-8")
    declared_faces = set(re.findall(r"font-family:\s*['\"]?([^;'\"}]+)", css))
    family_spans: Counter[str] = Counter()
    family_pages: dict[str, set[int]] = defaultdict(set)
    family_sizes: dict[str, set[str]] = defaultdict(set)
    family_sample: dict[str, list[str]] = defaultdict(list)
    page_counts: dict[int, Counter[str]] = defaultdict(Counter)
    page_nums = args.pages or list(range(1, 103))

    for page_num in page_nums:
        path = args.json_dir / f"page_{page_num:03d}" / f"page_{page_num:03d}_dom.json"
        if not path.is_file():
            continue
        page = json.loads(path.read_text(encoding="utf-8"))
        for block in page.get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "")
                    if not text.strip():
                        continue
                    pdf_font = span.get("font", "")
                    family = viewer_family(pdf_font)
                    family_spans[pdf_font] += 1
                    family_pages[pdf_font].add(page_num)
                    family_sizes[pdf_font].add(f"{float(span.get('size', 0)):.2f}")
                    page_counts[page_num][pdf_font] += 1
                    if len(family_sample[pdf_font]) < 3:
                        family_sample[pdf_font].append(text.strip().replace("\n", " ")[:45])

    rows = []
    for pdf_font, count in sorted(family_spans.items(), key=lambda item: (-item[1], item[0])):
        family = viewer_family(pdf_font)
        if "ZapfDingbats" in pdf_font and "span.font?.includes('ZapfDingbats')" in renderer:
            suppression_rule = "all spans suppressed pending page-specific restoration"
        elif "Wingdings" in pdf_font and "span.font?.includes('Wingdings')" in renderer:
            suppression_rule = "all spans suppressed pending page-specific restoration"
        elif "Webdings" in pdf_font and "span.font?.includes('Webdings')" in renderer:
            suppression_rule = "conditional; source U+F07E reconstructed as outlined callout icon"
        else:
            suppression_rule = "none detected"
        rows.append({
            "pdfFont": pdf_font,
            "viewerFamily": family,
            "spans": count,
            "pages": len(family_pages[pdf_font]),
            "pageNumbers": ",".join(str(p) for p in sorted(family_pages[pdf_font])),
            "sizesPt": ",".join(sorted(family_sizes[pdf_font], key=float)),
            "bundledFaceDeclared": family in declared_faces,
            "rendererSuppressionRule": suppression_rule,
            "sampleText": " | ".join(family_sample[pdf_font]),
        })
    write_csv(args.out_dir / "font-family-coverage.csv", rows)

    page_rows = []
    for page_num in sorted(page_counts):
        suppressed_count = sum(
            count for font, count in page_counts[page_num].items()
            if ("ZapfDingbats" in font or "Wingdings" in font or "Webdings" in font)
        )
        page_rows.append({
            "page": page_num,
            "sourceFontFamilies": len(page_counts[page_num]),
            "iconFontSpansWithSuppressionRule": suppressed_count,
            "fonts": ";".join(sorted(page_counts[page_num])),
        })
    write_csv(args.out_dir / "page-font-coverage.csv", page_rows)

    missing_face = [row for row in rows if not row["bundledFaceDeclared"]]
    suppressed = [row for row in rows if row["rendererSuppressionRule"] != "none detected"]
    print(f"Pages scanned: {len(page_rows)}; PDF font families: {len(rows)}")
    print(f"Families without bundled @font-face: {len(missing_face)}")
    print(f"Pictogram families with renderer suppression rules: {len(suppressed)}")
    for row in missing_face:
        print(f"  {row['pdfFont']} -> {row['viewerFamily']}: {row['spans']} spans / {row['pages']} pages")
    print(f"Outputs: {args.out_dir.resolve()}")


if __name__ == "__main__":
    main()
