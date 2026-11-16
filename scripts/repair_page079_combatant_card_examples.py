#!/usr/bin/env python3
"""Restore p.79's printed combatant card examples from the source PDF.

The Cave Sickle card/loot-level display, the angled base/variation card pair,
and the Variation-tag card header are finished visual components. The viewer
currently rebuilds their internal text and some symbols incorrectly. Each
component is restored with an exact source crop; only fully contained duplicate
lines are suppressed, and only in English so the retained DOM stays localizable.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_NUMBER = 79
AUDIT_ID = "2026-10-04-p079-combatant-card-examples-v1"
PAGE_DIR = ROOT / "apps/web/public/pages/page_079"
DOM_PATH = PAGE_DIR / "page_079_dom.json"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"

COMPONENT_REGIONS = {
    "cave-sickle-card-and-loot-level-scale": {
        "bbox": [80.07, 321.58, 402.98, 484.30],
        "source_images": [
            [84.32, 321.58, 278.92, 484.30],
        ],
        "region": "printed Cave Sickle combatant card beside the five Loot Level examples",
    },
    "base-and-variation-combatant-card-pair": {
        "bbox": [94.81, 516.00, 388.70, 664.68],
        "source_images": [
            [99.96, 521.26, 250.92, 651.10],
            [224.48, 518.65, 388.70, 665.44],
        ],
        "region": "two printed Cave Sickle combatant cards and their green connecting arrow",
    },
    "variation-tag-card-header": {
        "bbox": [429.33, 358.11, 716.25, 411.03],
        "source_drawings": [
            [429.33, 358.11, 716.25, 411.03],
        ],
        "region": "printed Cave Sickle Burrowing Variation card header under The Variation Tag",
    },
}

DARK_CARD_FILL = (0.13669031858444214, 0.12195010483264923, 0.1252918243408203)


def close_bbox(left: list[float] | tuple[float, ...], right: list[float], tolerance: float = 0.06) -> bool:
    return len(left) == len(right) == 4 and all(abs(float(a) - float(b)) <= tolerance for a, b in zip(left, right))


def intersects(inner: list[float], outer: list[float]) -> bool:
    return inner[0] < outer[2] and inner[2] > outer[0] and inner[1] < outer[3] and inner[3] > outer[1]


def contained(inner: list[float], outer: list[float], tolerance: float = 0.08) -> bool:
    return (
        inner[0] >= outer[0] - tolerance and inner[1] >= outer[1] - tolerance
        and inner[2] <= outer[2] + tolerance and inner[3] <= outer[3] + tolerance
    )


def line_text(line: dict) -> str:
    return "".join(str(span.get("text", "")) for span in line.get("spans", []))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write exact crops and update p.79 DOM/overlay metadata")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8")) if SIDECAR_PATH.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid p.79 overlay sidecar: {SIDECAR_PATH}")
    lines = [line for block in dom.get("blocks", []) for line in block.get("lines", [])]
    planned_suppressions: list[str] = []

    with pymupdf.open(args.pdf) as document:
        page = document[PAGE_NUMBER - 1]
        page_images = page.get_image_info(xrefs=True)
        page_drawings = page.get_drawings()

        for name, config in COMPONENT_REGIONS.items():
            for expected_bbox in config.get("source_images", []):
                if not any(close_bbox(tuple(image["bbox"]), expected_bbox) for image in page_images):
                    raise SystemExit(f"Source-PDF image changed or missing for {name}: {expected_bbox}")
            for expected_bbox in config.get("source_drawings", []):
                if not any(
                    close_bbox(tuple(drawing["rect"]), expected_bbox)
                    and drawing.get("fill") is not None
                    and all(abs(float(a) - b) <= 1e-4 for a, b in zip(drawing["fill"], DARK_CARD_FILL))
                    for drawing in page_drawings
                ):
                    raise SystemExit(f"Source-PDF component frame changed or missing for {name}: {expected_bbox}")

            bbox = config["bbox"]
            intersecting = [line for line in lines if intersects(line["bbox"], bbox)]
            crossing = [line for line in intersecting if not contained(line["bbox"], bbox)]
            if crossing:
                refs = [f"{line.get('id')} {line.get('bbox')} {line_text(line)[:70]!r}" for line in crossing]
                raise SystemExit(f"Refusing to suppress text crossing {name} crop: {refs}")

            for line in intersecting:
                if not line.get("rasterizedDuplicate") or line.get("rasterizedDuplicateLanguage") != "en":
                    planned_suppressions.append(f"{name}: {line.get('id')} {line_text(line)[:45]!r}")
                if args.apply:
                    line["rasterizedDuplicate"] = True
                    line["rasterizedDuplicateLanguage"] = "en"
                    line["rasterizedDuplicateReason"] = f"p.79 {config['region']} restored from an exact source-PDF crop"
                    line["rasterizedDuplicateEvidence"] = {
                        "auditId": AUDIT_ID,
                        "sourcePdfPage": PAGE_NUMBER,
                        "region": name,
                        "rule": "keep extracted component text in page data; suppress only duplicate EN rendering over the printed artwork",
                        "evidenceRef": "docs/QA/drafts/2026-10-03-bookwide-visual-review-batch.md",
                    }

            if args.apply:
                filename = f"fidelity-overlay-component-{name}.png"
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(args.scale, args.scale), clip=pymupdf.Rect(*bbox), alpha=False)
                pixmap.save(str(PAGE_DIR / filename))
                url = f"/pages/page_079/{filename}"
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": bbox,
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "language": "en",
                    "auditId": AUDIT_ID,
                    "category": "component-artwork",
                    "sourcePdfPage": PAGE_NUMBER,
                    "region": config["region"],
                })

    if args.apply:
        DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"p.{PAGE_NUMBER}: card/example crops={len(COMPONENT_REGIONS)}; "
        f"planned EN duplicate lines={len(planned_suppressions)}; applied={args.apply}"
    )
    for item in planned_suppressions:
        print(f"  suppress EN duplicate: {item}")


if __name__ == "__main__":
    main()
