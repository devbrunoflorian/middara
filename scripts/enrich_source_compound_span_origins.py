"""Persist PDF-extracted span origins for blocks owning source compounds.

The page DOM extractor stores bboxes but not baselines on many legacy pages.
When a semantic source compound replaces one glyph, the shared renderer can
only keep the surrounding paragraph on exact PDF geometry if every text span
in that owning block also has its source origin. This script derives those
origins from the reference PDF; it never estimates coordinates.
"""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps/web/public/pages"
PDF_PATH = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")


def span_key(span: dict) -> tuple:
    return (
        span.get("text", ""),
        span.get("font", ""),
        round(float(span.get("size", 0.0)), 2),
        tuple(round(float(value), 2) for value in span.get("bbox", [])),
    )


def page_span_origins(pdf_page) -> dict[tuple, list[list[float]]]:
    flags = pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES
    origins: dict[tuple, list[list[float]]] = collections.defaultdict(list)
    for block in pdf_page.get_text("dict", flags=flags).get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                origin = span.get("origin")
                if origin and len(origin) == 2:
                    origins[span_key(span)].append([float(origin[0]), float(origin[1])])
    return origins


def enrich_page(pdf_document, page_number: int, apply: bool) -> dict:
    page_dir = PAGE_ROOT / f"page_{page_number:03d}"
    dom_path = page_dir / f"page_{page_number:03d}_dom.json"
    compound_path = page_dir / "compound_elements.json"
    dom = json.loads(dom_path.read_text(encoding="utf-8"))
    compounds = json.loads(compound_path.read_text(encoding="utf-8")).get("elements", [])
    block_ids = {element["anchor"]["blockId"] for element in compounds}
    origins = page_span_origins(pdf_document[page_number - 1])
    changed = 0
    checked = 0

    for block in dom.get("blocks", []):
        if block.get("id") not in block_ids:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                key = span_key(span)
                matches = origins.get(key, [])
                if len(matches) != 1:
                    raise ValueError(
                        f"p.{page_number} {block['id']}/{line.get('id')} "
                        f"{span.get('text', '')!r}: expected one exact PDF span match, found {len(matches)}"
                    )
                expected = matches[0]
                current = span.get("origin")
                checked += 1
                if current is not None:
                    if len(current) != 2 or any(abs(float(a) - b) > 0.01 for a, b in zip(current, expected)):
                        raise ValueError(
                            f"p.{page_number} {block['id']}/{line.get('id')} "
                            f"{span.get('text', '')!r}: stored origin {current} differs from PDF {expected}"
                        )
                    continue
                span["origin"] = expected
                changed += 1

    if apply and changed:
        dom_path.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "page": page_number,
        "compoundBlocks": len(block_ids),
        "spansChecked": checked,
        "originsAdded": changed if apply else 0,
        "originsReady": changed if not apply else 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--page", type=int, action="append", help="Restrict to a page; repeatable.")
    parser.add_argument("--apply", action="store_true", help="Write exact PDF origins into page DOM JSON.")
    args = parser.parse_args()

    compound_pages = sorted(
        int(path.parent.name[-3:])
        for path in PAGE_ROOT.glob("page_*/compound_elements.json")
        if json.loads(path.read_text(encoding="utf-8")).get("elements")
    )
    pages = sorted(set(args.page)) if args.page else compound_pages
    unknown = sorted(set(pages) - set(compound_pages))
    if unknown:
        raise SystemExit(f"Pages have no source compounds to enrich: {unknown}")
    with pymupdf.open(PDF_PATH) as pdf_document:
        report = [enrich_page(pdf_document, page, args.apply) for page in pages]
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "pages": report}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
