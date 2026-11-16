"""Emit the source PDF page boxes needed by the visual export normalizer."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pymupdf


def main() -> int:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: snapshot_export_source_boxes.py SOURCE.pdf PAGE [PAGE ...]")
    source_path = Path(sys.argv[1])
    page_numbers = [int(value) for value in sys.argv[2:]]
    document = pymupdf.open(source_path)
    try:
        result: dict[str, dict[str, list[float]]] = {}
        names = {
            "mediaBox": "mediabox",
            "cropBox": "cropbox",
            "bleedBox": "bleedbox",
            "trimBox": "trimbox",
            "artBox": "artbox",
        }
        for page_number in page_numbers:
            if page_number < 1 or page_number > document.page_count:
                raise ValueError(f"Source page {page_number} is outside 1-{document.page_count}.")
            page = document[page_number - 1]
            result[str(page_number)] = {
                key: [float(value) for value in getattr(page, attribute)]
                for key, attribute in names.items()
            }
        print(json.dumps(result, separators=(",", ":")))
    finally:
        document.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
