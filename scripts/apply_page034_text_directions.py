"""Restore the source PDF text directions for page 34's rotated game cards."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_034/page_034_dom.json"
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True, help="official source rulebook PDF")
    args = parser.parse_args()

    source = pymupdf.open(args.pdf)
    source_blocks = source[33].get_text("dict").get("blocks", [])
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if data.get("page_number") != 34:
        raise ValueError("Expected the page 34 DOM")

    updated = 0
    for block in data.get("blocks", []):
        for line in block.get("lines", []):
            evidence = line.get("rasterizedDuplicateEvidence") or {}
            if evidence.get("auditId") == "page34-rotated-card-art-text-v1":
                for key in ("rasterizedDuplicate", "rasterizedDuplicateReason", "rasterizedDuplicateEvidence"):
                    line.pop(key, None)

        block_match = re.fullmatch(r"block_(\d+)", block.get("id", ""))
        if not block_match:
            continue
        source_block_index = int(block_match.group(1))
        if source_block_index >= len(source_blocks):
            continue
        source_lines = source_blocks[source_block_index].get("lines", [])
        for line in block.get("lines", []):
            line_match = re.fullmatch(r"line_\d+_(\d+)", line.get("id", ""))
            if not line_match:
                continue
            source_line_index = int(line_match.group(1))
            if source_line_index >= len(source_lines):
                continue
            direction = source_lines[source_line_index].get("dir", (1.0, 0.0))
            angle = math.degrees(math.atan2(direction[1], direction[0]))
            angle = int(round(angle / 90) * 90)
            if abs(angle) == 90:
                line["renderRotationDegrees"] = angle
                updated += 1
            else:
                line.pop("renderRotationDegrees", None)
    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 34: restored source orientation on {updated} vertical text lines")


if __name__ == "__main__":
    main()
