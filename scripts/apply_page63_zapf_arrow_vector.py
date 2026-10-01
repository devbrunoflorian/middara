"""Map page 63's missing Zapf U+27A4 arrows to their embedded CFF outline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PAGE_JSON = ROOT / "apps/web/public/pages/page_063/page_063_dom.json"
EXPECTED = 15
GLYPH_PATH = "M35 308 L236 654 L35 1000 L882 654 Z"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--apply", action="store_true", help="write the page-local vector override")
    args = parser.parse_args()

    doc = pymupdf.open(args.pdf)
    source_glyphs = [
        char
        for trace in doc[62].get_texttrace()
        if "ZapfDingbatsStd" in trace.get("font", "")
        for char in trace.get("chars", [])
        if char[0] == 0x27A4 and char[1] == 3
    ]
    if len(source_glyphs) != EXPECTED:
        raise SystemExit(f"Expected {EXPECTED} PDF U+27A4/gid-3 glyphs; found {len(source_glyphs)}")

    data = json.loads(PAGE_JSON.read_text(encoding="utf-8"))
    if data.get("page_number") != 63:
        raise SystemExit("Refusing unexpected page JSON")
    candidates = [
        span
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
        for span in line.get("spans", [])
        if span.get("font") == "ZapfDingbatsStd" and span.get("text") == "\u27a4"
    ]
    already = [span for span in candidates if span.get("pictogramSvgPath") == GLYPH_PATH]
    pending = [span for span in candidates if span.get("pictogramSvgPath") is None]
    if len(candidates) != EXPECTED or len(already) + len(pending) != EXPECTED:
        raise SystemExit(f"Candidate mismatch: JSON={len(candidates)}, mapped={len(already)}, pending={len(pending)}, PDF={len(source_glyphs)}")
    print(f"Page 63 Zapf arrows: {len(source_glyphs)} PDF glyphs match {len(candidates)} exact JSON spans; mapped={len(already)}; pending={len(pending)}; apply={args.apply}")
    if args.apply and pending:
        for span in pending:
            span["pictogramSvgPath"] = GLYPH_PATH
        PAGE_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Applied exact page-local vector path; source arrow characters and bboxes are unchanged.")


if __name__ == "__main__":
    main()
