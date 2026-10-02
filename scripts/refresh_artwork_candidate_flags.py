"""Refresh ghost/admin flags in an existing PDF paint-order candidate inventory.

Reuse this when the source PDF and extracted bboxes have not changed but JSON
review markers have. It preserves PDF paint-order evidence and recomputes region
counts/status from the current page JSON. It does not classify new candidates.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path


def read_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return reader.fieldnames or [], list(reader)


def write_rows(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-dir", required=True, type=Path)
    parser.add_argument("--lines-csv", required=True, type=Path, help="Existing audit_artwork_text_overlays.py line inventory")
    parser.add_argument("--regions-csv", required=True, type=Path, help="Matching region inventory")
    parser.add_argument("--lines-out", required=True, type=Path)
    parser.add_argument("--regions-out", required=True, type=Path)
    args = parser.parse_args()

    line_fields, line_rows = read_rows(args.lines_csv)
    region_fields, region_rows = read_rows(args.regions_csv)
    line_cache: dict[int, dict[str, tuple[bool, bool]]] = {}

    for row in line_rows:
        page = int(row["page"])
        if page not in line_cache:
            json_path = args.json_dir / f"page_{page:03d}" / f"page_{page:03d}_dom.json"
            page_data = json.loads(json_path.read_text(encoding="utf-8"))
            block_flags = {block.get("id"): bool(block.get("suspectedGhost", False)) for block in page_data.get("blocks", [])}
            flags = {}
            for block in page_data.get("blocks", []):
                for line in block.get("lines", []):
                    flags[line.get("id", "")] = (
                        bool(line.get("suspectedGhost", block_flags.get(block.get("id"), False))),
                        bool(line.get("rasterizedDuplicate", False)),
                    )
            line_cache[page] = flags
        flags = line_cache[page].get(row["line_id"])
        if flags is None:
            raise ValueError(f"Line disappeared from page JSON: p.{page} {row['line_id']}")
        row["suspectedGhost"] = str(flags[0])
        row["alreadyRasterizedDuplicate"] = str(flags[1])

    grouped: dict[tuple[int, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in line_rows:
        grouped[(int(row["page"]), row["imageSeq"], row["imageBBox"])].append(row)
    if len(grouped) != len(region_rows):
        raise ValueError(f"Candidate groups ({len(grouped)}) do not match region rows ({len(region_rows)})")

    confirmed_count = 0
    for region in region_rows:
        key = (int(region["page"]), region["imageSeq"], region["imageBBox"])
        candidates = grouped.get(key)
        if candidates is None:
            raise ValueError(f"Region has no candidate rows: {region['regionId']}")
        confirmed = sum(row["alreadyRasterizedDuplicate"].casefold() == "true" for row in candidates)
        suspected = sum(row["suspectedGhost"].casefold() == "true" for row in candidates)
        region["confirmedDuplicateLineCount"] = str(confirmed)
        region["suspectedGhostLineCount"] = str(suspected)
        region["reviewStatus"] = (
            "all-candidate-lines-explicitly-confirmed"
            if confirmed == len(candidates)
            else "needs-visual-review"
        )
        confirmed_count += confirmed

    write_rows(args.lines_out, line_fields, line_rows)
    write_rows(args.regions_out, region_fields, region_rows)
    pending = sum(row["reviewStatus"] == "needs-visual-review" for row in region_rows)
    print(f"Refreshed flags for {len(line_rows)} line candidates in {len(region_rows)} regions.")
    print(f"Explicitly marked line occurrences: {confirmed_count}; regions still needing review: {pending}.")
    print("PDF paint-order and bbox evidence were reused unchanged; no new classification was made.")


if __name__ == "__main__":
    main()
