"""Restore p.18's printed hidden-card components from the source PDF.

Dry-run by default. On --apply this captures the complete component group as a
page-local fidelity overlay and marks only source text fully inside that group
as artwork-only. The source text remains in the DOM JSON for provenance.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PAGE = 18
PAGE_DIR = ROOT / "apps/web/public/pages/page_018"
DOM_PATH = PAGE_DIR / "page_018_dom.json"
OVERLAYS_PATH = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-23-p018-hidden-card-component-artwork-v1"
OVERLAY_NAME = "fidelity-overlay-hidden-card-deck-components.png"
OVERLAY_URL = f"/pages/page_018/{OVERLAY_NAME}"
# Includes all four physical components, their shadows and a narrow source-page
# background margin; it stops before the explanatory paragraph beginning at y=431.
REGION = [430.5, 337.0, 669.0, 429.0]
EXPECTED_CARD_X_RANGES = [(431.0, 489.0), (488.0, 527.0), (519.0, 565.0), (555.0, 669.0)]
DEFAULT_PDFS = [
    Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"),
    Path(r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"),
]


def intersects(bbox: list[float], region: list[float]) -> bool:
    return bbox[0] < region[2] and bbox[2] > region[0] and bbox[1] < region[3] and bbox[3] > region[1]


def contained(bbox: list[float], region: list[float], tolerance: float = 0.02) -> bool:
    return (
        bbox[0] >= region[0] - tolerance and bbox[1] >= region[1] - tolerance
        and bbox[2] <= region[2] + tolerance and bbox[3] <= region[3] + tolerance
    )


def source_pdf_path(requested: Path | None) -> Path:
    if requested:
        if not requested.is_file():
            raise FileNotFoundError(requested)
        return requested
    for candidate in DEFAULT_PDFS:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("Could not locate the official Middara Rulebook PDF.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the source overlay and page metadata")
    parser.add_argument("--pdf", type=Path, help="official source PDF; defaults to the project's configured local copy")
    parser.add_argument("--scale", type=float, default=8.0, help="overlay raster scale in pixels per PDF point")
    args = parser.parse_args()

    if args.scale < 2.0:
        raise SystemExit("Refusing a low-resolution artwork overlay; use at least 2 pixels per PDF point.")
    pdf_path = source_pdf_path(args.pdf)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if dom.get("page_number") != PAGE:
        raise SystemExit(f"Expected p.{PAGE} DOM, got {dom.get('page_number')}.")

    candidate_blocks = []
    crossing = []
    for block in dom.get("blocks", []):
        bbox = block.get("bbox")
        if not isinstance(bbox, list) or len(bbox) != 4 or not intersects(bbox, REGION):
            continue
        if not contained(bbox, REGION):
            crossing.append(f"{block.get('id')} bbox={bbox}")
            continue
        if any(not contained(line.get("bbox", []), REGION) for line in block.get("lines", [])):
            crossing.append(f"{block.get('id')} has a line crossing the component crop")
            continue
        evidence = block.get("artworkOnlyEvidence")
        if block.get("artworkOnly") and evidence and evidence.get("auditId") != AUDIT_ID:
            raise SystemExit(f"Refusing to replace existing artwork classification on {block.get('id')}.")
        candidate_blocks.append(block)
    if crossing:
        raise SystemExit("Refusing a crop that crosses editorial text: " + "; ".join(crossing))

    content_images = [
        image for image in dom.get("images", [])
        if image.get("role") == "content" and contained(image.get("bbox", []), REGION, tolerance=0.05)
    ]
    found_ranges = [
        any(left <= image["bbox"][0] <= right for image in content_images)
        for left, right in EXPECTED_CARD_X_RANGES
    ]
    if not all(found_ranges):
        raise SystemExit(f"Could not verify all four source card images inside crop; found={found_ranges}.")

    overlays = json.loads(OVERLAYS_PATH.read_text(encoding="utf-8")) if OVERLAYS_PATH.is_file() else {"overlays": []}
    if not isinstance(overlays.get("overlays"), list):
        raise SystemExit(f"Invalid fidelity overlay sidecar: {OVERLAYS_PATH}")
    existing = next((item for item in overlays["overlays"] if item.get("url") == OVERLAY_URL), None)
    if existing and (existing.get("auditId") != AUDIT_ID or existing.get("bbox") != REGION):
        raise SystemExit("Refusing to replace an unrelated fidelity overlay with the same URL.")

    print(json.dumps({
        "sourcePdf": str(pdf_path),
        "page": PAGE,
        "regionPt": REGION,
        "overlayUrl": OVERLAY_URL,
        "componentTextBlocks": len(candidate_blocks),
        "blockIds": [block.get("id") for block in candidate_blocks],
        "sourceImageRegionsVerified": found_ranges,
        "apply": args.apply,
    }, ensure_ascii=False, indent=2))
    if not args.apply:
        return

    with pymupdf.open(pdf_path) as document:
        if PAGE > len(document):
            raise SystemExit(f"The source PDF has only {len(document)} pages.")
        page = document[PAGE - 1]
        page_rect = pymupdf.Rect(0, 0, dom["width"], dom["height"])
        if not page_rect.contains(pymupdf.Rect(*REGION)):
            raise SystemExit("The component crop falls outside the physical source page.")
        pixmap = page.get_pixmap(
            matrix=pymupdf.Matrix(args.scale, args.scale),
            clip=pymupdf.Rect(*REGION),
            alpha=False,
        )
        pixmap.save(str(PAGE_DIR / OVERLAY_NAME))

    overlay = {
        "url": OVERLAY_URL,
        "bbox": REGION,
        "widthPx": pixmap.width,
        "heightPx": pixmap.height,
        "language": "en",
        "languageInvariant": True,
        "auditId": AUDIT_ID,
        "category": "component-artwork",
        "sourcePdfPage": PAGE,
        "region": "four printed hidden-card deck examples, including their overlaid card fronts",
    }
    overlays["overlays"] = [item for item in overlays["overlays"] if item.get("url") != OVERLAY_URL]
    overlays["overlays"].append(overlay)

    for block in candidate_blocks:
        block["artworkOnly"] = True
        block["artworkOnlyEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": PAGE,
            "region": "four printed hidden-card deck examples, including their overlaid card fronts",
            "rule": "preserve source component artwork as one exact source-PDF overlay; retain extracted text only as component provenance",
            "evidenceRef": "output/proofs/translation-readiness-2026-10-23/p018-hidden-card-artwork-overlay.json",
        }

    DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OVERLAYS_PATH.write_text(json.dumps(overlays, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Applied source-faithful component overlay: {pixmap.width}x{pixmap.height}px; classified {len(candidate_blocks)} embedded text blocks as artwork-only.")


if __name__ == "__main__":
    main()
