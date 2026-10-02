#!/usr/bin/env python3
"""Export a line-level Markdown transcript and style evidence from the source PDF.

This is a transcription aid, not a semantic segmenter or fidelity certification.
Each extracted line stays separate so distinct font sizes and bounding boxes are
not silently merged. Review and reorganize into semantic translation units before
translation; text over artwork may be ambiguous and needs visual disposition.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import pymupdf


DEFAULT_PDF = Path(
    r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
)


def fmt_bbox(bbox: tuple[float, ...] | list[float]) -> str:
    return ", ".join(f"{value:.2f}" for value in bbox)


def md_text(text: str) -> str:
    return text.replace("|", "\\|").replace("\r", "").replace("\n", " ").strip()


def span_evidence(span: dict[str, Any]) -> str:
    text = md_text(str(span.get("text", "")))
    font = str(span.get("font", "unknown"))
    size = float(span.get("size", 0))
    flags = int(span.get("flags", 0))
    bbox = fmt_bbox(span.get("bbox", (0, 0, 0, 0)))
    return f"`{text}` — `{font}` {size:.2f} pt; PDF flags `{flags}`; bbox `{bbox}`"


def extract_page(page: pymupdf.Page, pdf_page_number: int) -> str:
    data = page.get_text("dict", sort=False)
    out = [
        f"# PDF page {pdf_page_number:03d}",
        "",
        "> Raw text-line transcript extracted from the official English PDF with PyMuPDF.",
        "> This is not a semantic paragraph map, an artwork/ghost decision, or an English-fidelity sign-off.",
        "> Reorder/re-group only after checking the rendered source; keep different font sizes and boxes distinct.",
        "",
        f"- **PDF page:** {pdf_page_number} of 102",
        f"- **Page size:** {page.rect.width:.2f} × {page.rect.height:.2f} pt",
        "- **Source review:** pending",
        "- **English fidelity:** pending app↔PDF visual review",
        "- **PT-BR:** pending English-fidelity gate",
        "- **Artwork text / uncertain overlays:** not classified by this extractor",
        "",
    ]

    block_num = 0
    line_num = 0
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = [s for s in line.get("spans", []) if str(s.get("text", ""))]
            if not spans:
                continue
            raw_line = "".join(str(s.get("text", "")) for s in spans)
            bbox = fmt_bbox(line.get("bbox", (0, 0, 0, 0)))
            out.extend(
                [
                    f"## Raw line {line_num + 1:03d} (block {block_num}, line {line_num})",
                    "",
                    f"**EN source:** {md_text(raw_line)}",
                    "",
                    "**PT-BR draft:** _(pending semantic review and EN fidelity gate)_",
                    "",
                    f"**Line bbox:** `{bbox}`",
                    "",
                    "**PDF span runs:**",
                ]
            )
            out.extend(f"- {span_evidence(span)}" for span in spans)
            out.append("")
            line_num += 1
        block_num += 1
    return "\n".join(out).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument(
        "--output-dir", type=Path, default=Path("docs/translations/source-pages")
    )
    parser.add_argument("--pages", help="Optional comma-separated 1-based PDF page numbers")
    args = parser.parse_args()
    if not args.pdf.is_file():
        parser.error(f"PDF not found: {args.pdf}")

    document = pymupdf.open(args.pdf)
    if len(document) != 102:
        parser.error(f"Expected 102 PDF pages; found {len(document)}")
    selected = (
        [int(part) for part in args.pages.split(",")]
        if args.pages
        else list(range(1, len(document) + 1))
    )
    if any(number < 1 or number > len(document) for number in selected):
        parser.error("Page numbers must be between 1 and 102")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for number in selected:
        content = extract_page(document[number - 1], number)
        path = args.output_dir / f"page-{number:03d}.md"
        path.write_text(content, encoding="utf-8", newline="\n")
    print(f"Exported {len(selected)} raw PDF page transcripts to {args.output_dir}")


if __name__ == "__main__":
    main()
