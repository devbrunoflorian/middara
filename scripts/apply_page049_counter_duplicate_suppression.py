#!/usr/bin/env python3
"""Hide the verified duplicate Counter heading on page 49 in normal view."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_049/page_049_dom.json"


def main() -> None:
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    changed = 0
    for block in dom.get("blocks", []):
        if block.get("id") != "block_27":
            continue
        text = "".join(span.get("text", "") for line in block.get("lines", []) for span in line.get("spans", []))
        if text.strip() != "Counter":
            raise SystemExit("p.49 block_27 no longer matches the verified duplicate")
        for line in block.get("lines", []):
            if not line.get("rasterizedDuplicate"):
                line["rasterizedDuplicate"] = True
                changed += 1
    if changed != 1:
        raise SystemExit(f"Expected one duplicate line, changed {changed}")
    DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("p.49 block_27 Counter marked rasterizedDuplicate")


if __name__ == "__main__":
    main()
