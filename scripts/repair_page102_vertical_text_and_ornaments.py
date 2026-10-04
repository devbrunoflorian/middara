#!/usr/bin/env python3
"""Restore PDF text direction and decorative curls on page 102.

This page-scoped repair is guarded by the expected extracted text and geometry.
It does not alter text, saved translation payloads, or HTML line visibility.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PAGE = 102
PAGE_DIR = ROOT / "apps/web/public/pages/page_102"
DOM_PATH = PAGE_DIR / "page_102_dom.json"
OVERLAY_PATH = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-03-page102-vector-chrome-v1"
EXPECTED_LINES = {
    "line_10_0": {
        "text": "COPYRIGHT © 2023 SUCCUBUS PUBLISHING",
        "bbox": [754.0947, 624.2542, 762.4387, 771.4851],
        "dir": [0.0, -1.0],
    },
    "line_11_0": {
        "text": "VERSION  V1.2  -  MAY  2023",
        "bbox": [765.0917, 682.0274, 773.4387, 771.4851],
        "dir": [0.0, -1.0],
    },
    "line_20_0": {
        "text": "SKULL",
        "bbox": [572.4742, 105.5319, 582.0103, 129.4440],
        "dir": [0.0, 1.0],
    },
}
ORNAMENTS = [
    ("top-left", [80.0, 56.0, 122.0, 87.0]),
    ("top-right", [697.0, 56.0, 740.0, 87.0]),
    ("lower-left", [80.0, 575.0, 122.0, 606.0]),
    ("lower-right", [697.0, 575.0, 740.0, 606.0]),
]


def close_bbox(actual: list[float], expected: list[float], tolerance: float = 0.02) -> bool:
    return len(actual) == 4 and all(abs(a - e) <= tolerance for a, e in zip(actual, expected))


def line_text(line: dict) -> str:
    return "".join(str(span.get("text", "")) for span in line.get("spans", []))


def restore_directions() -> list[str]:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if data.get("page_number") != PAGE:
        raise ValueError(f"Expected page {PAGE} DOM, got {data.get('page_number')}")
    lines = {
        line.get("id"): line
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
    }
    changed: list[str] = []
    for line_id, expected in EXPECTED_LINES.items():
        line = lines.get(line_id)
        if line is None:
            raise ValueError(f"Missing guarded line {line_id}")
        if line_text(line) != expected["text"] or not close_bbox(line.get("bbox", []), expected["bbox"]):
            raise ValueError(f"Guard failed for {line_id}: text or bbox changed")
        if line.get("dir") != expected["dir"]:
            line["dir"] = expected["dir"]
            changed.append(line_id)
    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def restore_ornaments(pdf_path: Path, scale: float) -> list[str]:
    if not pdf_path.is_file():
        raise FileNotFoundError(pdf_path)
    with pymupdf.open(pdf_path) as document:
        if len(document) < PAGE:
            raise ValueError(f"Source PDF has only {len(document)} pages")
        page = document[PAGE - 1]
        sidecar = json.loads(OVERLAY_PATH.read_text(encoding="utf-8")) if OVERLAY_PATH.exists() else {"overlays": []}
        if not isinstance(sidecar.get("overlays"), list):
            raise ValueError(f"Invalid overlay sidecar: {OVERLAY_PATH}")
        changed: list[str] = []
        for name, bbox in ORNAMENTS:
            filename = f"fidelity-overlay-decoration-page102-{name}.png"
            output = PAGE_DIR / filename
            pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=pymupdf.Rect(*bbox), alpha=False)
            pix.save(str(output))
            url = f"/pages/page_{PAGE:03d}/{filename}"
            entry = {
                "url": url,
                "bbox": bbox,
                "widthPx": pix.width,
                "heightPx": pix.height,
                "language": "en",
                "languageInvariant": True,
                "auditId": AUDIT_ID,
                "category": "decorative-page-chrome",
                "sourcePdfPage": PAGE,
                "region": f"header-flourish-{name}",
            }
            sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
            sidecar["overlays"].append(entry)
            changed.append(name)
        OVERLAY_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pdf",
        type=Path,
        default=Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"),
    )
    parser.add_argument("--scale", type=float, default=4.0)
    args = parser.parse_args()
    directions = restore_directions()
    ornaments = restore_ornaments(args.pdf, args.scale)
    print(f"Page {PAGE}: restored directions on {len(directions)} lines and {len(ornaments)} ornamental crops")


if __name__ == "__main__":
    main()
