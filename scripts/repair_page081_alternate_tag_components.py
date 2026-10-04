#!/usr/bin/env python3
"""Restore p.81's printed card composition and white header ornaments.

The large card pair is a finished source-PDF illustration whose extracted
text was incomplete and partly misplaced. Keep every extracted line in the
page data, but suppress only its English rendering while the exact PDF crop
is active. The smaller Cave Sickle variation header is also language-specific
and must allow future translated lines to render over the page background.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_NUMBER = 81
AUDIT_ID = "2026-10-04-p081-alternate-tag-components-v1"
PAGE_DIR = ROOT / "apps/web/public/pages/page_081"
DOM_PATH = PAGE_DIR / "page_081_dom.json"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"

COMPONENTS = {
    "alternate-combatant-card-pair": {
        "bbox": [420.95, 326.66, 733.37, 489.0],
        "scale": 8,
        "language": "en",
        "region": "two printed Cave Sickle Warrior cards and green connecting arrow",
        "expected_images": [
            [420.95, 337.23, 608.15, 494.55],
            [532.14, 329.40, 725.10, 495.00],
            [536.52, 326.66, 726.09, 491.03],
            [542.16, 327.39, 731.74, 491.85],
            [425.28, 334.76, 607.87, 491.22],
        ],
    },
    "variation-card-header": {
        # The PDF's card frame ends at y=291.87; ending the crop at 292.4
        # keeps a thin source margin but avoids the following Example line,
        # whose extracted bbox starts at y=293.48.
        "bbox": [123.2, 234.3, 357.2, 292.4],
        "filename": "fidelity-overlay-component-cave-sickle-variation-card-header.png",
        "scale": 4,
        "language": "en",
        "region": "printed Cave Sickle Burrowing Variation card header",
        "expected_line_ids": ["line_18_0", "line_18_1", "line_19_0", "line_19_1", "line_19_2"],
    },
    "alternate-example-title-ornament-left": {
        "bbox": [429.2, 300.0, 462.6, 324.0],
        "scale": 8,
        "languageInvariant": True,
        "region": "left white flourish beside the Alternate Tag Example title",
        "expected_line_ids": [],
    },
    "alternate-example-title-ornament-right": {
        # The flourish starts a few points left of its visible outer curl;
        # keep the crop clear of the title text, which ends at x=688 pt.
        "bbox": [690.0, 300.0, 734.0, 324.0],
        "scale": 8,
        "languageInvariant": True,
        "region": "right white flourish beside the Alternate Tag Example title",
        "expected_line_ids": [],
    },
}


def close_bbox(left, right, tolerance: float = 0.08) -> bool:
    return len(left) == len(right) == 4 and all(abs(float(a) - float(b)) <= tolerance for a, b in zip(left, right))


def intersects(inner: list[float], outer: list[float]) -> bool:
    return inner[0] < outer[2] and inner[2] > outer[0] and inner[1] < outer[3] and inner[3] > outer[1]


def contained(inner: list[float], outer: list[float], tolerance: float = 0.08) -> bool:
    return (
        inner[0] >= outer[0] - tolerance and inner[1] >= outer[1] - tolerance
        and inner[2] <= outer[2] + tolerance and inner[3] <= outer[3] + tolerance
    )


def text_of(line: dict) -> str:
    return "".join(str(span.get("text", "")) for span in line.get("spans", []))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write source crops and update p.81 sidecar/DOM")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid p.81 overlay sidecar: {SIDECAR_PATH}")

    lines = [line for block in dom.get("blocks", []) for line in block.get("lines", [])]
    lines_by_id = {line.get("id"): line for line in lines}
    if len(lines_by_id) != len(lines):
        raise SystemExit("p.81 DOM line IDs are not unique")
    planned_lines: set[str] = set()

    with pymupdf.open(args.pdf) as document:
        page = document[PAGE_NUMBER - 1]
        source_images = page.get_image_info(xrefs=True)
        source_text_lines = [
            ("".join(span.get("text", "") for span in line.get("spans", [])), pymupdf.Rect(line["bbox"]))
            for block in page.get_text("dict")["blocks"]
            for line in block.get("lines", [])
        ]

        for name, config in COMPONENTS.items():
            bbox = config["bbox"]
            if "expected_images" in config:
                for expected in config["expected_images"]:
                    if not any(close_bbox(tuple(image["bbox"]), expected) for image in source_images):
                        raise SystemExit(f"Source-PDF card image changed or missing: {name} {expected}")
            if "expected_line_ids" in config:
                missing = [line_id for line_id in config["expected_line_ids"] if line_id not in lines_by_id]
                if missing:
                    raise SystemExit(f"Expected p.81 card-header text is missing: {missing}")

            intersecting = [line for line in lines if intersects(line["bbox"], bbox)]
            crossing = [line for line in intersecting if not contained(line["bbox"], bbox)]
            if crossing:
                refs = [f"{line.get('id')} {line.get('bbox')} {text_of(line)[:70]!r}" for line in crossing]
                raise SystemExit(f"Refusing to suppress text crossing {name} crop: {refs}")

            # The two white curls have no text. Fail if a crop would cover any
            # selectable heading text or adjacent live prose.
            if config.get("languageInvariant"):
                page_text_crossings = [text for text, rect in source_text_lines if rect.intersects(pymupdf.Rect(*bbox))]
                if page_text_crossings:
                    raise SystemExit(f"Invariant ornament crop intersects source text: {name}: {page_text_crossings}")

            if name == "alternate-combatant-card-pair":
                # All 107 intersecting lines are printed inside the physical
                # cards; nearby editable prose begins below y=489 pt.
                if len(intersecting) != 107:
                    raise SystemExit(f"Unexpected p.81 card duplicate count: {len(intersecting)} (expected 107)")
                planned_lines.update(line["id"] for line in intersecting)
                if args.apply:
                    for line in intersecting:
                        line["rasterizedDuplicate"] = True
                        line["rasterizedDuplicateLanguage"] = "en"
                        line["rasterizedDuplicateReason"] = "p.81 printed alternate combatant cards restored from an exact source-PDF crop"
                        line["rasterizedDuplicateEvidence"] = {
                            "auditId": AUDIT_ID,
                            "sourcePdfPage": PAGE_NUMBER,
                            "region": name,
                            "rule": "preserve card text in page data; suppress only its duplicate English paint over the source card artwork",
                            "evidenceRef": "docs/project-progress/2026-10-04-page81-alternate-tag-components.md",
                        }

            if name == "variation-card-header":
                if len(intersecting) != len(config["expected_line_ids"]) or {
                    line.get("id") for line in intersecting
                } != set(config["expected_line_ids"]):
                    raise SystemExit("The p.81 small variation-card header no longer matches its audited text lines")
                planned_lines.update(config["expected_line_ids"])

            if args.apply:
                filename = config.get("filename", f"fidelity-overlay-component-{name}.png")
                pixmap = page.get_pixmap(
                    matrix=pymupdf.Matrix(config["scale"], config["scale"]),
                    clip=pymupdf.Rect(*bbox),
                    alpha=False,
                )
                pixmap.save(str(PAGE_DIR / filename))
                url = f"/pages/page_081/{filename}"
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                entry = {
                    "url": url,
                    "bbox": bbox,
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "auditId": AUDIT_ID,
                    "category": "combatant-cards" if name in {"alternate-combatant-card-pair", "variation-card-header"} else "page-decoration",
                    "sourcePdfPage": PAGE_NUMBER,
                    "region": config["region"],
                }
                if config.get("languageInvariant"):
                    entry["languageInvariant"] = True
                else:
                    entry["language"] = config["language"]
                sidecar["overlays"].append(entry)

        if args.apply:
            for line_id in COMPONENTS["variation-card-header"]["expected_line_ids"]:
                line = lines_by_id[line_id]
                line["rasterizedDuplicate"] = True
                line["rasterizedDuplicateLanguage"] = "en"
                # Its text bbox is inside the crop, but the CSS debug outline
                # extends beyond the card into the next editable prose line.
                line["hideRasterizedDuplicateAdminMarker"] = True
                line["rasterizedDuplicateReason"] = "p.81 English source card header restored from an exact source-PDF crop"
                line["rasterizedDuplicateEvidence"] = {
                    "auditId": AUDIT_ID,
                    "sourcePdfPage": PAGE_NUMBER,
                    "region": "variation-card-header",
                    "rule": "retain editable text for localized rendering; hide only the English duplicate while its source crop is shown",
                    "evidenceRef": "docs/project-progress/2026-10-04-page81-alternate-tag-components.md",
                }

    if args.apply:
        DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"p.{PAGE_NUMBER}: source component crops={len(COMPONENTS)}; "
        f"EN duplicate lines covered={len(planned_lines)}; applied={args.apply}"
    )


if __name__ == "__main__":
    main()
