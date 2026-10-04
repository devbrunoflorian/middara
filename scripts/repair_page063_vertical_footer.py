#!/usr/bin/env python3
"""Restore the PDF text direction for the vertical p.63 footer."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_063/page_063_dom.json"
LINE_ID = "line_147_0"
EXPECTED_TEXT = "Printable version available at www.Middara.com"
EXPECTED_BBOX = [759.0618, 544.4241, 770.9818, 763.6531]
EXPECTED_DIR = [0.0, -1.0]


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if data.get("page_number") != 63:
        raise ValueError("Expected page 63 DOM")
    lines = {
        line.get("id"): line
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
    }
    line = lines.get(LINE_ID)
    if line is None:
        raise ValueError(f"Missing guarded line {LINE_ID}")
    text = "".join(span.get("text", "") for span in line.get("spans", []))
    bbox = line.get("bbox", [])
    if text != EXPECTED_TEXT or len(bbox) != 4 or any(abs(a - b) > 0.02 for a, b in zip(bbox, EXPECTED_BBOX)):
        raise ValueError("Guard failed: footer text or bbox changed")
    line["dir"] = EXPECTED_DIR
    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 63: restored upward text direction for {LINE_ID}")


if __name__ == "__main__":
    main()
