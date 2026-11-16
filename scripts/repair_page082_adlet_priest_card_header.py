"""Restore p.82's printed Adlet Priest card header from the source PDF.

The physical card header contains title, stat-tab, and type text already baked
into its artwork. The extracted DOM lines remain editable for localization but
must not be painted a second time in the English source view.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_NUMBER = 82
PAGE_DIR = ROOT / "apps/web/public/pages/page_082"
DOM_PATH = PAGE_DIR / "page_082_dom.json"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-04-p082-adlet-priest-card-header-v1"

# Includes the whole printed header plus its small left marker. The crop ends
# below the card frame and extracted footer fragments, before live note text.
CROP_BBOX = [90.0, 208.5, 389.0, 255.8]
SOURCE_IMAGE_BBOX = [97.396, 209.061, 388.276, 258.021]
SOURCE_FRAME_BBOX = [99.196, 210.861, 386.116, 255.501]
DARK_CARD_FILL = (0.13669031858444214, 0.12195010483264923, 0.1252918243408203)

# Exact lines printed on the card header. Their DOM rows remain in place to
# preserve page_82_block_* keys and to accept future PT-BR translation.
TARGET_LINES = {
    "line_13_0": "Adlet Priest",
    "line_18_0": "1",
    "line_18_1": "2",
    "line_18_2": "3",
    "line_18_3": "INTELLIGENT",
    "line_18_4": "TYPE: ADLET",
    "line_18_5": "ALTERNATE",
    "line_21_0": "SWARM",
    "line_26_0": "y",
    "line_26_1": "p",
    "line_26_2": "p",
    "line_26_3": "g",
    "line_26_4": "g",
    "line_26_5": "y",
}


def close_bbox(actual: tuple[float, ...], expected: list[float], tolerance: float = 0.08) -> bool:
    return len(actual) == len(expected) == 4 and all(
        abs(float(left) - right) <= tolerance for left, right in zip(actual, expected)
    )


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
    parser.add_argument("--apply", action="store_true", help="write the source crop and p.82 metadata")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    blocks = dom.get("blocks", [])
    lines = [line for block in blocks for line in block.get("lines", [])]
    line_by_id = {line.get("id"): line for line in lines}
    missing = [line_id for line_id in TARGET_LINES if line_id not in line_by_id]
    if missing:
        raise SystemExit(f"Missing p.82 Adlet Priest source lines: {missing}")
    for line_id, expected_text in TARGET_LINES.items():
        actual = line_text(line_by_id[line_id]).strip()
        if actual != expected_text:
            raise SystemExit(f"p.82 {line_id} changed: expected {expected_text!r}, found {actual!r}")

    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8")) if SIDECAR_PATH.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid p.82 overlay sidecar: {SIDECAR_PATH}")

    bbox = CROP_BBOX
    intersecting = [line for line in lines if intersects(line.get("bbox", []), bbox)]
    crossing = [line for line in intersecting if not contained(line["bbox"], bbox)]
    if crossing:
        refs = [f"{line.get('id')} {line.get('bbox')} {line_text(line)[:70]!r}" for line in crossing]
        raise SystemExit(f"Refusing to crop across a text line: {refs}")
    unexpected = [line for line in intersecting if line.get("id") not in TARGET_LINES]
    if unexpected:
        refs = [f"{line.get('id')} {line_text(line)[:70]!r}" for line in unexpected]
        raise SystemExit(f"Unexpected text inside the card crop: {refs}")
    if len(intersecting) != len(TARGET_LINES):
        raise SystemExit(f"Expected {len(TARGET_LINES)} card lines inside the crop; found {len(intersecting)}")

    with pymupdf.open(args.pdf) as document:
        page = document[PAGE_NUMBER - 1]
        images = page.get_image_info(xrefs=True)
        if not any(close_bbox(tuple(image["bbox"]), SOURCE_IMAGE_BBOX) for image in images):
            raise SystemExit(f"Source-PDF Adlet Priest header image missing: {SOURCE_IMAGE_BBOX}")
        drawings = page.get_drawings()
        if not any(
            close_bbox(tuple(drawing["rect"]), SOURCE_FRAME_BBOX)
            and drawing.get("fill") is not None
            and all(abs(float(a) - b) <= 1e-4 for a, b in zip(drawing["fill"], DARK_CARD_FILL))
            for drawing in drawings
        ):
            raise SystemExit(f"Source-PDF Adlet Priest card frame missing: {SOURCE_FRAME_BBOX}")

        crop_path = PAGE_DIR / "fidelity-overlay-component-adlet-priest-card-header.png"
        pixmap = page.get_pixmap(
            matrix=pymupdf.Matrix(args.scale, args.scale),
            clip=pymupdf.Rect(*bbox),
            alpha=False,
        )
        url = f"/pages/page_082/{crop_path.name}"
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
            "region": "printed Adlet Priest card header, stat tabs, and card-type label",
        })

        if args.apply:
            pixmap.save(str(crop_path))

    print(f"p.{PAGE_NUMBER}: source card header crop={bbox}; confirmed EN duplicate lines={len(intersecting)}; applied={args.apply}")
    if args.apply:
        for line_id in TARGET_LINES:
            line = line_by_id[line_id]
            line["rasterizedDuplicate"] = True
            line["rasterizedDuplicateLanguage"] = "en"
            line["rasterizedDuplicateReason"] = "p.82 printed Adlet Priest card header restored from an exact source-PDF crop"
            line["rasterizedDuplicateEvidence"] = {
                "auditId": AUDIT_ID,
                "sourcePdfPage": PAGE_NUMBER,
                "region": "adlet-priest-card-header",
                "rule": "keep card text editable for localization; suppress duplicate English rendering over the printed card",
                "evidenceRef": "docs/project-progress/2026-10-04-page82-adlet-priest-card-header.md",
            }
        DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
