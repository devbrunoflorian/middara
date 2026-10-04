"""Restore p.73's embedded combatant card and remove the duplicated note text.

The Femke card is a printed component whose extracted title, abilities, tags,
curved stat labels, values, and callout fragments are incomplete or displaced
in the browser. Restore the exact source region and suppress only the matching
extracted lines, keeping them in the DOM. The lower-right note is ordinary
book text: restore its exact English appearance for EN while leaving the
source lines available to render translated text when the EN overlay is hidden.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = 73
AUDIT_ID = "2026-10-04-p073-combatant-card-and-note-v1"
PAGE_DIR = ROOT / "apps/web/public/pages/page_073"
DOM = PAGE_DIR / "page_073_dom.json"
SIDECAR = PAGE_DIR / "fidelity_overlays.json"

CARD_BBOX = [95.03900146484375, 121.23199462890625, 527.0390014648438, 481.23199462890625]
CARD_BLOCK_LINES = {
    "block_3": ["line_3_0", "line_3_1"],
    "block_5": [f"line_5_{i}" for i in range(6)],
    "block_11": [f"line_11_{i}" for i in range(7)],
    "block_18": [f"line_18_{i}" for i in range(8)],
    "block_26": ["line_26_0"],
    "block_27": [f"line_27_{i}" for i in range(5)],
    "block_32": ["line_32_0", "line_32_1"],
    "block_33": ["line_33_0", "line_33_1"],
    "block_35": ["line_35_0"],
    "block_36": [f"line_36_{i}" for i in range(4)],
    "block_40": [f"line_40_{i}" for i in range(4)],
    "block_44": [f"line_44_{i}" for i in range(3)],
    "block_47": [f"line_47_{i}" for i in range(4)],
    "block_51": [f"line_51_{i}" for i in range(10)],
    "block_61": [f"line_61_{i}" for i in range(8)],
    "block_69": ["line_69_0", "line_69_1"],
    "block_71": ["line_71_0", "line_71_1"],
    "block_73": [f"line_73_{i}" for i in range(5)],
    "block_76": [f"line_76_{i}" for i in range(3)],
    "block_79": [f"line_79_{i}" for i in range(4)],
    "block_80": [f"line_80_{i}" for i in range(4)],
    "block_82": [f"line_82_{i}" for i in range(4)],
    "block_83": [f"line_83_{i}" for i in range(4)],
    "block_84": [f"line_84_{i}" for i in range(3)],
    "block_85": [f"line_85_{i}" for i in range(4)],
    "block_87": ["line_87_0", "line_87_1"],
    "block_88": ["line_88_0"],
    "block_89": ["line_89_0"],
    "block_90": ["line_90_0"],
    "block_92": ["line_92_0"],
    "block_94": ["line_94_0"],
    "block_95": ["line_95_0"],
    "block_96": ["line_96_0", "line_96_1"],
    "block_98": ["line_98_0", "line_98_1"],
    "block_99": ["line_99_0", "line_99_1"],  # Keep H/arrow line_99_2 outside the card crop.
    "block_117": ["line_117_0"],
    "block_118": ["line_118_0"],
}
NOTE_BBOX = [498.1611328125, 693.3710327148438, 796.9609985351562, 771.3707275390625]
NOTE_BLOCK_LINES = {
    "block_126": ["line_126_0", "line_126_1"],
    "block_127": [f"line_127_{i}" for i in range(4)],
}


def contained(inner: list[float], outer: list[float], tolerance: float = 0.08) -> bool:
    return (
        inner[0] >= outer[0] - tolerance
        and inner[1] >= outer[1] - tolerance
        and inner[2] <= outer[2] + tolerance
        and inner[3] <= outer[3] + tolerance
    )


def find_line(block: dict, line_id: str) -> dict | None:
    return next((line for line in block.get("lines", []) if line.get("id") == line_id), None)


def mark_lines(blocks: dict[str, dict], line_map: dict[tuple[str, str], dict], config: dict[str, list[str]],
               *, duplicate_language: str, region: str, changes: list[str], apply: bool) -> None:
    for block_id, line_ids in config.items():
        block = blocks.get(block_id)
        if block is None:
            raise SystemExit(f"Missing p.73 {region} block {block_id}")
        for line_id in line_ids:
            line = line_map.get((block_id, line_id))
            if line is None:
                raise SystemExit(f"Missing p.73 {region} line {block_id}/{line_id}")
            if line.get("rasterizedDuplicateLanguage") != duplicate_language or not line.get("rasterizedDuplicate"):
                changes.append(f"source-only {block_id}/{line_id} language={duplicate_language}")
            if apply:
                line["rasterizedDuplicate"] = True
                line["rasterizedDuplicateLanguage"] = duplicate_language
                line["rasterizedDuplicateReason"] = f"p.73 {region} is restored from an exact source-PDF crop"
                line["rasterizedDuplicateEvidence"] = {
                    "auditId": AUDIT_ID,
                    "sourcePdfPage": PAGE,
                    "region": region,
                    "rule": "retain extracted text in source data; suppress only the duplicate page rendering",
                    "evidenceRef": "docs/QA/drafts/2026-10-03-bookwide-visual-review-batch.md",
                }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write exact source crops and p.73 overlay metadata")
    parser.add_argument("--pdf", type=Path, default=PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()

    dom = json.loads(DOM.read_text(encoding="utf-8"))
    blocks = {block.get("id"): block for block in dom.get("blocks", [])}
    lines = {
        (block.get("id"), line.get("id")): line
        for block in dom.get("blocks", [])
        for line in block.get("lines", [])
    }

    # The card region is taken from the extracted PDF image bbox. Refuse to
    # crop a stale or altered area.
    exact_card_image = any(
        image.get("role") == "content"
        and all(abs(float(a) - float(b)) <= 0.02 for a, b in zip(image.get("bbox", []), CARD_BBOX))
        for image in dom.get("images", [])
    )
    if not exact_card_image:
        raise SystemExit("p.73 card image bbox no longer matches the source-confirmed region")

    changes: list[str] = []
    for block_id, line_ids in CARD_BLOCK_LINES.items():
        block = blocks.get(block_id)
        if block is None:
            raise SystemExit(f"Missing p.73 card block {block_id}")
        for line_id in line_ids:
            line = lines.get((block_id, line_id))
            if line is None:
                raise SystemExit(f"Missing p.73 card line {block_id}/{line_id}")
            if not contained(line["bbox"], CARD_BBOX):
                raise SystemExit(f"Refusing to hide content outside the card crop: {block_id}/{line_id} {line['bbox']}")

    mark_lines(
        blocks, lines, CARD_BLOCK_LINES,
        duplicate_language="all", region="Femke combatant card and embedded labels",
        changes=changes, apply=args.apply,
    )
    mark_lines(
        blocks, lines, NOTE_BLOCK_LINES,
        duplicate_language="en", region="lower-right English note text",
        changes=changes, apply=args.apply,
    )

    sidecar = json.loads(SIDECAR.read_text(encoding="utf-8")) if SIDECAR.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid p.73 fidelity overlay sidecar: {SIDECAR}")

    if args.apply:
        if not args.pdf.is_file():
            raise FileNotFoundError(args.pdf)
        with pymupdf.open(args.pdf) as document:
            page = document[PAGE - 1]
            crops = [
                ("fidelity-overlay-component-femke-combatant-card.png", CARD_BBOX, True,
                 "Femke combatant card as printed in the source PDF"),
                ("fidelity-overlay-component-command-scaling-note-en.png", NOTE_BBOX, False,
                 "English note printed over the lower-right illustration"),
            ]
            for filename, bbox, invariant, region in crops:
                pixmap = page.get_pixmap(
                    matrix=pymupdf.Matrix(args.scale, args.scale),
                    clip=pymupdf.Rect(*bbox),
                    alpha=False,
                )
                pixmap.save(str(PAGE_DIR / filename))
                url = f"/pages/page_073/{filename}"
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": bbox,
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "language": "en",
                    "languageInvariant": invariant,
                    "auditId": AUDIT_ID,
                    "category": "component-artwork",
                    "sourcePdfPage": PAGE,
                    "region": region,
                })

        DOM.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        SIDECAR.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"p.73 plannedLines={sum(map(len, CARD_BLOCK_LINES.values())) + sum(map(len, NOTE_BLOCK_LINES.values()))} applied={args.apply}")
    for change in changes:
        print(f"  {change}")


if __name__ == "__main__":
    main()
