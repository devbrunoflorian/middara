"""Apply verified inline edit units to the recurring 18/11 pt Cinzel Continued headings."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"
MANIFEST = ROOT / "docs/project-progress/continued-heading-unit-batch-2026-10-01.csv"
SIGNATURE = "Cinzel:18:b0:i0 | Cinzel:11:b0:i0"
EXCLUDED_GHOST = (88, "block_8", "line_8_0")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the validated unit refs into the page JSONs")
    args = parser.parse_args()
    with MANIFEST.open(encoding="utf-8-sig", newline="") as handle:
        manifest = list(csv.DictReader(handle))
    expected = {(int(row["page"]), row["blockId"], row["lineId"]): row for row in manifest}

    observed: set[tuple[int, str, str]] = set()
    pages: dict[int, dict] = {}
    lookup: dict[tuple[int, str, str], tuple[dict, dict, list[tuple[int, dict]]]] = {}
    for page_number in range(1, 103):
        path = PAGE_DIR / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        if not path.is_file():
            continue
        page = json.loads(path.read_text(encoding="utf-8"))
        pages[page_number] = page
        for block in page.get("blocks", []):
            for line in block.get("lines", []):
                indexed = [(index, span) for index, span in enumerate(line.get("spans", [])) if span.get("text", "")]
                if len(indexed) != 2:
                    continue
                first, second = (span for _, span in indexed)
                if not (
                    first.get("font") == second.get("font") == "Cinzel-Regular"
                    and float(first.get("size", 0)) == 18.0
                    and float(second.get("size", 0)) == 11.0
                    and first.get("text", "").strip()
                    and second.get("text", "").strip() == "Continued"
                    and "".join(span.get("text", "") for _, span in indexed).strip().endswith(" Continued")
                ):
                    continue
                key = (page_number, block.get("id", ""), line.get("id", ""))
                if line.get("suspectedGhost", block.get("suspectedGhost", False)) or line.get("rasterizedDuplicate", False):
                    if key == EXCLUDED_GHOST:
                        continue
                    raise SystemExit(f"Unmanifested 18/11 candidate marked ghost/duplicate: {key}")
                observed.add(key)
                lookup[key] = (block, line, indexed)

    if observed != set(expected):
        raise SystemExit(f"18/11 candidate set drift: missing={sorted(set(expected)-observed)} extra={sorted(observed-set(expected))}")

    additions = 0
    changed_pages: set[int] = set()
    for key, row in expected.items():
        page_number, block_id, line_id = key
        block, line, indexed = lookup[key]
        text = "".join(span.get("text", "") for _, span in indexed).strip()
        if text != row["text"] or line.get("bbox") is None:
            raise SystemExit(f"Heading text/bbox drift at {key}: {text!r}")
        bbox = ",".join(f"{float(value):.2f}" for value in line["bbox"])
        if bbox != row["bbox"]:
            raise SystemExit(f"Heading bbox drift at {key}: {bbox} != {row['bbox']}")
        span_refs = [f"{line_id}:{index}" for index, _ in indexed]
        slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
        proposed = [
            {"id": f"p{page_number}-{slug}-heading", "spanRefs": [span_refs[0]]},
            {"id": f"p{page_number}-{slug}-continued", "spanRefs": [span_refs[1]]},
        ]
        existing = block.get("typographicSpanUnits")
        if page_number == 13:
            expected_p13 = [
                {"id": "p13-adventure-mode-title", "spanRefs": span_refs[:1]},
                {"id": "p13-adventure-mode-continued", "spanRefs": span_refs[1:]},
            ]
            if existing != expected_p13:
                raise SystemExit("Page 13 tracer no longer matches its verified Adventure Mode split")
            continue
        if existing is not None:
            if existing != proposed:
                raise SystemExit(f"Existing inline units conflict at {key}: {existing}")
            continue
        additions += 1
        if args.apply:
            block["typographicSpanUnits"] = proposed
            changed_pages.add(page_number)

    print(f"Verified {len(expected)} exact Cinzel 18/11 pt continuation headings; excluded ghost {EXCLUDED_GHOST}.")
    print(f"New unit pairs: {additions}; apply={args.apply}.")
    if args.apply:
        for page_number in changed_pages:
            page = pages[page_number]
            path = PAGE_DIR / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
            path.write_text(json.dumps(page, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Applied the verified page-local run refs; source text/style/bboxes remain unchanged.")


if __name__ == "__main__":
    main()
