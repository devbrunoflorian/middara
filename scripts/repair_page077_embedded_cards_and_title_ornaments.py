"""Restore p.77's printed card components and white Conduit title ornaments.

The Conduit Summoning card and the overlapping Rook/Gevaudan card diagram are
printed components. Their extracted text was being rebuilt over the source
art. Restore those exact PDF regions and keep the extracted lines only as
editable source data. Two white header flourishes were also recolored green in
the viewer background, so restore those vector shapes independently.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = 77
AUDIT_ID = "2026-10-04-p077-embedded-cards-and-title-ornaments-v1"
PAGE_DIR = ROOT / "apps/web/public/pages/page_077"
DOM = PAGE_DIR / "page_077_dom.json"
SIDECAR = PAGE_DIR / "fidelity_overlays.json"

CARD_REGIONS = {
    "conduit-summoning-card": {
        "bbox": [499.6629943847656, 302.322998046875, 685.06298828125, 425.8030090332031],
        "source_images": [
            [499.6629943847656, 302.322998046875, 685.06298828125, 425.8030090332031],
        ],
        "region": "printed Conduit Summoning card in the example column",
    },
    "rook-gevaudan-overlapping-card-diagram": {
        "bbox": [429.1029968261719, 532.76904296875, 745.9240112304688, 710.5800170898438],
        "source_images": [
            [429.1029968261719, 532.76904296875, 600.822998046875, 681.0889892578125],
            [560.5239868164062, 544.260009765625, 745.9240112304688, 710.5800170898438],
        ],
        "region": "overlapping printed Rook Lars and Gevaudan cards with the connecting arrow",
    },
}

TITLE_FLOURISHES = {
    "conduit-example-left-flourish": {
        "bbox": [445.98, 35.79, 471.0, 56.69],
        "drawing_bbox": [445.98, 35.79, 471.0, 56.69],
        "region": "left white flourish in the Conduit Example banner",
    },
    "conduit-example-right-flourish": {
        "bbox": [706.1, 35.79, 731.11, 56.69],
        "drawing_bbox": [706.1, 35.79, 731.11, 56.69],
        "region": "right white flourish in the Conduit Example banner",
    },
}


def close_bbox(left: list[float] | tuple[float, ...], right: list[float], tolerance: float = 0.05) -> bool:
    return len(left) == len(right) == 4 and all(abs(float(a) - float(b)) <= tolerance for a, b in zip(left, right))


def contained(inner: list[float], outer: list[float], tolerance: float = 0.1) -> bool:
    return (
        inner[0] >= outer[0] - tolerance and inner[1] >= outer[1] - tolerance
        and inner[2] <= outer[2] + tolerance and inner[3] <= outer[3] + tolerance
    )


def line_text(line: dict) -> str:
    return "".join(str(span.get("text", "")) for span in line.get("spans", []))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write exact PDF crops and update p.77 DOM/overlay metadata")
    parser.add_argument("--pdf", type=Path, default=PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()

    dom = json.loads(DOM.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR.read_text(encoding="utf-8")) if SIDECAR.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid p.77 overlay sidecar: {SIDECAR}")
    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)

    lines = [line for block in dom.get("blocks", []) for line in block.get("lines", [])]
    changes: list[str] = []
    with pymupdf.open(args.pdf) as document:
        page = document[PAGE - 1]
        for name, config in CARD_REGIONS.items():
            for expected_bbox in config["source_images"]:
                if not any(
                    image.get("role") == "content" and close_bbox(image.get("bbox", []), expected_bbox)
                    for image in dom.get("images", [])
                ):
                    raise SystemExit(f"Missing source-confirmed p.77 card image region for {name}: {expected_bbox}")

            bbox = config["bbox"]
            intersecting = [
                line for line in lines
                if line["bbox"][0] < bbox[2] and line["bbox"][2] > bbox[0]
                and line["bbox"][1] < bbox[3] and line["bbox"][3] > bbox[1]
            ]
            crossing = [line for line in intersecting if not contained(line["bbox"], bbox)]
            if crossing:
                refs = [f"{line.get('id')} {line.get('bbox')}" for line in crossing]
                raise SystemExit(f"Refusing to suppress text crossing the {name} crop boundary: {refs}")

            for line in intersecting:
                if not line.get("rasterizedDuplicate") or line.get("rasterizedDuplicateLanguage") != "en":
                    changes.append(f"suppress {line.get('id')} in {name}: {line_text(line)[:36]!r}")
                if args.apply:
                    line["rasterizedDuplicate"] = True
                    line["rasterizedDuplicateLanguage"] = "en"
                    line["rasterizedDuplicateReason"] = f"p.77 {config['region']} restored from the exact source-PDF crop"
                    line["rasterizedDuplicateEvidence"] = {
                        "auditId": AUDIT_ID,
                        "sourcePdfPage": PAGE,
                        "region": name,
                        "rule": "retain extracted component text in source data; suppress the duplicate page rendering",
                        "evidenceRef": "docs/QA/drafts/2026-10-03-bookwide-visual-review-batch.md",
                    }

            if args.apply:
                filename = f"fidelity-overlay-component-{name}.png"
                pixmap = page.get_pixmap(
                    matrix=pymupdf.Matrix(args.scale, args.scale),
                    clip=pymupdf.Rect(*bbox),
                    alpha=False,
                )
                pixmap.save(str(PAGE_DIR / filename))
                url = f"/pages/page_077/{filename}"
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": bbox,
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "language": "en",
                    "auditId": AUDIT_ID,
                    "category": "component-artwork",
                    "sourcePdfPage": PAGE,
                    "region": config["region"],
                })

        drawings = page.get_drawings()
        for name, config in TITLE_FLOURISHES.items():
            if not any(
                drawing.get("fill") is not None
                and tuple(round(float(channel), 5) for channel in drawing["fill"]) == (1.0, 1.0, 1.0)
                and close_bbox(tuple(drawing["rect"]), config["drawing_bbox"])
                for drawing in drawings
            ):
                raise SystemExit(f"Source PDF no longer has the confirmed white title flourish: {name}")
            filename = f"fidelity-overlay-{name}.png"
            url = f"/pages/page_077/{filename}"
            if args.apply:
                pixmap = page.get_pixmap(
                    matrix=pymupdf.Matrix(args.scale, args.scale),
                    clip=pymupdf.Rect(*config["bbox"]),
                    alpha=False,
                )
                pixmap.save(str(PAGE_DIR / filename))
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": config["bbox"],
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "language": "en",
                    "languageInvariant": True,
                    "auditId": AUDIT_ID,
                    "category": "page-ornament",
                    "sourcePdfPage": PAGE,
                    "region": config["region"],
                })

    if args.apply:
        DOM.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        SIDECAR.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"p.77 plannedVisualSuppressions={len(changes)} plannedOverlays={len(CARD_REGIONS) + len(TITLE_FLOURISHES)} applied={args.apply}")
    for change in changes:
        print(f"  {change}")


if __name__ == "__main__":
    main()
