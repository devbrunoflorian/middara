"""Restore confirmed component and diagram regions from the source PDF.

The rulebook contains real game cards, tokens, maps, and player-aid diagrams.
Those regions are not translation prose.  This script renders exact PDF crops,
registers them as language-scoped fidelity overlays, and suppresses only the
extracted HTML lines whose centres fall inside each audited component region.

The region list is intentionally explicit.  It is evidence-backed by the
2026-10-03 component audit and must not be generalized by visual similarity.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGES = ROOT / "apps/web/public/pages"
AUDIT_ID = "2026-10-03-component-artwork-audit-v1"
EVIDENCE = "docs/QA/drafts/2026-10-03-component-artwork-and-marker-audit.md"


# PDF point coordinates.  Each target is a complete, self-contained component
# or diagram, with prose outside the crop left editable for future translation.
TARGETS: list[dict[str, object]] = [
    # Item cards and the item-card breakdown.
    {"page": 26, "name": "item-card-types", "bbox": [76, 112, 742, 276], "category": "item-cards"},
    {"page": 26, "name": "war-axe-front", "bbox": [183, 351, 350, 601], "category": "item-cards"},
    {"page": 26, "name": "war-axe-back", "bbox": [477, 349, 645, 601], "category": "item-cards"},
    {"page": 27, "name": "long-sword-front", "bbox": [59, 550, 170, 714], "category": "item-cards"},
    {"page": 27, "name": "long-sword-back", "bbox": [160, 547, 272, 714], "category": "item-cards"},
    {"page": 27, "name": "wand-front", "bbox": [311, 550, 423, 714], "category": "item-cards"},
    {"page": 27, "name": "wand-back", "bbox": [412, 547, 525, 714], "category": "item-cards"},
    {"page": 27, "name": "deflection-core-front", "bbox": [557, 550, 668, 714], "category": "item-cards"},
    {"page": 27, "name": "deflection-core-back", "bbox": [658, 547, 770, 714], "category": "item-cards"},
    # Discipline tree cards and the discipline-card breakdown.
    {"page": 32, "name": "assemblage-card", "bbox": [85, 240, 244, 351], "category": "discipline-cards"},
    {"page": 32, "name": "cruor-card", "bbox": [579, 348, 739, 460], "category": "discipline-cards"},
    {"page": 32, "name": "martial-card", "bbox": [85, 456, 244, 566], "category": "discipline-cards"},
    {"page": 32, "name": "sanctus-card", "bbox": [579, 563, 739, 675], "category": "discipline-cards"},
    {"page": 32, "name": "subterfuge-card", "bbox": [85, 668, 244, 782], "category": "discipline-cards"},
    {"page": 33, "name": "magic-staff-card", "bbox": [422, 58, 581, 294], "category": "item-cards"},
    {"page": 33, "name": "deflection-core-card", "bbox": [569, 57, 729, 295], "category": "item-cards"},
    {"page": 33, "name": "quick-blow-card", "bbox": [311, 541, 511, 680], "category": "discipline-cards"},
    # Game-table setup and player-aid diagrams.
    {"page": 34, "name": "game-table-setup-components", "bbox": [80, 84, 740, 785], "category": "diagram"},
    {"page": 35, "name": "adventurer-play-area-components", "bbox": [112, 344, 732, 707], "category": "diagram"},
    {"page": 36, "name": "initiative-track-round", "bbox": [176, 445, 642, 573], "category": "initiative-cards"},
    {"page": 36, "name": "initiative-track-shuffle", "bbox": [176, 623, 642, 748], "category": "initiative-cards"},
    {"page": 37, "name": "exhaust-cards", "bbox": [475, 153, 678, 279], "category": "item-cards"},
    {"page": 37, "name": "flip-cards", "bbox": [475, 363, 678, 488], "category": "item-cards"},
    {"page": 44, "name": "line-of-sight-diagram", "bbox": [126, 96, 693, 384], "category": "diagram"},
    {"page": 44, "name": "damage-healing-components", "bbox": [421, 538, 721, 706], "category": "item-cards"},
    {"page": 46, "name": "encounter-action-map", "bbox": [114, 357, 363, 576], "category": "diagram"},
    {"page": 51, "name": "flanking-diagram-grid", "bbox": [78, 68, 743, 748], "category": "diagram"},
    {"page": 53, "name": "gore-shot-card", "bbox": [500, 529, 656, 639], "category": "discipline-cards"},
    {"page": 59, "name": "padric-command-card", "bbox": [82, 108, 541, 496], "category": "combatant-cards"},
    {"page": 59, "name": "padric-portrait-card", "bbox": [562, 96, 739, 309], "category": "combatant-cards"},
    {"page": 83, "name": "spawn-map", "bbox": [480, 96, 733, 345], "category": "diagram"},
    {"page": 83, "name": "cave-sickle-reference", "bbox": [128, 239, 417, 303], "category": "combatant-cards"},
    {"page": 83, "name": "loot-level-reference", "bbox": [190, 423, 348, 513], "category": "combatant-cards"},
    {"page": 83, "name": "cave-sickle-card-pair", "bbox": [132, 454, 407, 568], "category": "combatant-cards"},
]


def inside(cx: float, cy: float, bbox: list[float]) -> bool:
    x0, y0, x1, y1 = bbox
    return x0 <= cx <= x1 and y0 <= cy <= y1


def render_crop(page: pymupdf.Page, bbox: list[float], output: Path, scale: float) -> tuple[int, int]:
    clip = pymupdf.Rect(*bbox)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip, alpha=False)
    output.parent.mkdir(parents=True, exist_ok=True)
    pix.save(str(output))
    return pix.width, pix.height


def load_overlay_json(path: Path) -> dict:
    if not path.is_file():
        return {"overlays": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("overlays"), list):
        raise ValueError(f"Invalid overlay sidecar: {path}")
    return data


def apply_target(document: pymupdf.Document, target: dict[str, object], scale: float, apply: bool) -> dict[str, object]:
    page_number = int(target["page"])
    name = str(target["name"])
    bbox = [float(value) for value in target["bbox"]]  # type: ignore[arg-type]
    page_dir = PAGES / f"page_{page_number:03d}"
    dom_path = page_dir / f"page_{page_number:03d}_dom.json"
    overlay_path = page_dir / "fidelity_overlays.json"
    asset = page_dir / f"fidelity-overlay-component-{name}.png"
    page = document[page_number - 1]
    width_px, height_px = render_crop(page, bbox, asset, scale) if apply else (0, 0)

    data = json.loads(dom_path.read_text(encoding="utf-8"))
    touched: list[str] = []
    for block in data.get("blocks", []):
        for line in block.get("lines", []):
            line_bbox = line.get("bbox") or []
            if len(line_bbox) != 4:
                continue
            cx = (float(line_bbox[0]) + float(line_bbox[2])) / 2
            cy = (float(line_bbox[1]) + float(line_bbox[3])) / 2
            if inside(cx, cy, bbox):
                # A pre-existing unrelated confirmation is retained.  Existing
                # page-specific suppressions often cover only the card title;
                # the source crop can safely complete the same component.
                evidence = line.get("rasterizedDuplicateEvidence") or {}
                if line.get("rasterizedDuplicate") and evidence.get("auditId") not in (None, AUDIT_ID):
                    touched.append(str(line.get("id")))
                    continue
                line["rasterizedDuplicate"] = True
                line["rasterizedDuplicateReason"] = "component or diagram copy is restored as an exact source-PDF crop"
                line["rasterizedDuplicateEvidence"] = {
                    "auditId": AUDIT_ID,
                    "sourcePdfPage": page_number,
                    "region": name,
                    "category": target["category"],
                    "rule": "suppress only HTML lines whose centres are inside the audited source-PDF component crop",
                    "evidenceRef": EVIDENCE,
                }
                touched.append(str(line.get("id")))

    if apply:
        dom_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        overlays = load_overlay_json(overlay_path)
        url = f"/pages/page_{page_number:03d}/{asset.name}"
        overlays["overlays"] = [item for item in overlays["overlays"] if item.get("url") != url]
        overlays["overlays"].append({
            "url": url,
            "bbox": bbox,
            "widthPx": width_px,
            "heightPx": height_px,
            "language": "en",
            "languageInvariant": True,
            "auditId": AUDIT_ID,
            "category": target["category"],
            "sourcePdfPage": page_number,
            "region": name,
        })
        overlay_path.write_text(json.dumps(overlays, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    elif asset.exists():
        asset.unlink()

    return {"page": page_number, "region": name, "category": target["category"], "bbox": bbox, "lines": touched, "asset": str(asset.relative_to(ROOT))}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=PDF)
    parser.add_argument("--scale", type=float, default=4.0)
    parser.add_argument("--pages", help="optional comma-separated pages")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    selected = {int(item) for item in args.pages.split(",")} if args.pages else None
    targets = [target for target in TARGETS if selected is None or int(target["page"]) in selected]
    with pymupdf.open(args.pdf) as document:
        results = [apply_target(document, target, args.scale, not args.dry_run) for target in targets]
    report = ROOT / "tmp/component-audit/component-overlay-apply.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"auditId": AUDIT_ID, "dryRun": args.dry_run, "targets": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Targets: {len(results)}; lines marked: {sum(len(row['lines']) for row in results)}; dry-run={args.dry_run}")
    print(f"Report: {report}")


if __name__ == "__main__":
    main()
