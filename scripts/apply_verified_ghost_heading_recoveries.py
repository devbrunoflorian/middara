"""Restore visually verified editorial headings misclassified as ghosts.

The checked-in manifest is derived from side-by-side PDF/background review.
Default mode is a no-write validation; pass --apply to change only the
allowlisted line ghost flags and exact heading span weight overrides.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"
MANIFEST = ROOT / "docs/project-progress/verified-ghost-heading-recovery-manifest.csv"


def line_text(line: dict) -> str:
    return "".join(span.get("text", "") for span in line.get("spans", [])).strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the reviewed recoveries")
    args = parser.parse_args()

    with MANIFEST.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != 70:
        raise SystemExit(f"Expected 70 reviewed spans in manifest, found {len(rows)}")

    pages: dict[int, tuple[Path, dict, bool]] = {}
    by_line: dict[tuple[int, int, int], list[dict[str, str]]] = defaultdict(list)
    changed_spans = 0
    changed_lines = 0

    for row in rows:
        page_number = int(row["page"])
        if page_number not in pages:
            path = PAGE_DIR / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
            original = path.read_text(encoding="utf-8")
            pages[page_number] = (path, json.loads(original), original.endswith("\n"))
        _, page, _ = pages[page_number]
        block_index, line_index, span_index = (int(row[key]) for key in ("blockIndex", "lineIndex", "spanIndex"))
        try:
            block = page["blocks"][block_index]
            line = block["lines"][line_index]
            span = line["spans"][span_index]
        except (IndexError, KeyError, TypeError) as error:
            raise SystemExit(f"Manifest target no longer exists: p.{page_number} {row}") from error

        if line_text(line) != row["lineText"]:
            raise SystemExit(f"Line text drifted: p.{page_number} {row['lineText']!r} != {line_text(line)!r}")
        if span.get("text") != row["spanText"] or span.get("font") != row["font"]:
            raise SystemExit(f"Span text/font drifted: p.{page_number} {row['lineText']!r}")
        if abs(float(span.get("size", 0)) - float(row["sizePt"])) > 0.03 or int(span.get("flags", 0)) != int(row["flags"]):
            raise SystemExit(f"Span signature drifted: p.{page_number} {row['lineText']!r}")
        if line.get("rasterizedDuplicate", False):
            raise SystemExit(f"Target now marked rasterizedDuplicate: p.{page_number} {row['lineText']!r}")
        if line.get("suspectedGhost") is not True and line.get("suspectedGhost") is not False:
            raise SystemExit(f"Target line has no explicit ghost classification: p.{page_number} {row['lineText']!r}")
        by_line[(page_number, block_index, line_index)].append(row)

    for (page_number, block_index, line_index), line_rows in by_line.items():
        _, page, _ = pages[page_number]
        block = page["blocks"][block_index]
        line = block["lines"][line_index]
        if line.get("suspectedGhost") is True:
            print(f"p.{page_number}: restore line {line_index} in block {block_index} ({line_text(line)}) ({'apply' if args.apply else 'dry run'})")
            if args.apply:
                line["suspectedGhost"] = False
                changed_lines += 1
        for row in line_rows:
            span = line["spans"][int(row["spanIndex"])]
            if span.get("renderWeightOverride") != 700:
                print(f"p.{page_number}: {row['spanText'].strip()} -> 700 ({'apply' if args.apply else 'dry run'})")
                if args.apply:
                    span["renderWeightOverride"] = 700
                    changed_spans += 1

    if args.apply:
        for path, page, had_trailing_newline in pages.values():
            rendered = json.dumps(page, ensure_ascii=False, indent=2)
            path.write_text(rendered + ("\n" if had_trailing_newline else ""), encoding="utf-8")

    print(
        f"Validated {len(rows)} spans across {len(by_line)} lines / {len(pages)} pages; "
        f"{'updated '+str(changed_lines)+' line flags and '+str(changed_spans)+' spans' if args.apply else 'no files written'}."
    )


if __name__ == "__main__":
    main()
