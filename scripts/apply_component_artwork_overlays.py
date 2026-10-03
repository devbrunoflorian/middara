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
    {"page": 26, "name": "war-axe-front", "bbox": [183, 352.5, 350, 601], "category": "item-cards"},
    {"page": 26, "name": "war-axe-back", "bbox": [477, 354.5, 645, 599.4], "category": "item-cards"},
    {"page": 27, "name": "long-sword-double-tag-pair", "bbox": [37, 548, 272, 708.4], "category": "item-cards"},
    {"page": 27, "name": "wand-double-tag-pair", "bbox": [289, 548, 525, 708.4], "category": "item-cards"},
    {"page": 27, "name": "deflection-core-double-tag-pair", "bbox": [541, 548, 770, 708.4], "category": "item-cards"},
    # Discipline tree cards and the discipline-card breakdown.
    {"page": 32, "name": "assemblage-card", "bbox": [85, 240, 244, 351], "category": "discipline-cards"},
    {"page": 32, "name": "cruor-card", "bbox": [579, 348, 739, 460], "category": "discipline-cards"},
    {"page": 32, "name": "martial-card", "bbox": [85, 456, 244, 566], "category": "discipline-cards"},
    {"page": 32, "name": "sanctus-card", "bbox": [579, 563, 739, 675], "category": "discipline-cards"},
    {"page": 32, "name": "subterfuge-card", "bbox": [85, 668, 244, 782], "category": "discipline-cards"},
    {"page": 33, "name": "magic-staff-card", "bbox": [422, 58, 581, 289.3], "category": "item-cards"},
    {"page": 33, "name": "deflection-core-card", "bbox": [569, 57, 729, 295], "category": "item-cards"},
    {"page": 33, "name": "quick-blow-card", "bbox": [311, 541, 511, 680], "category": "discipline-cards"},
    # Game-table setup and player-aid diagrams.
    {"page": 34, "name": "game-table-setup-components", "bbox": [80, 84, 740, 785], "category": "diagram"},
    {"page": 35, "name": "adventurer-play-area-components", "bbox": [112, 365, 732, 707], "category": "diagram"},
    {"page": 36, "name": "initiative-track-round", "bbox": [150, 430, 670, 561.2], "category": "initiative-cards"},
    {"page": 36, "name": "initiative-track-shuffle", "bbox": [176, 623, 642, 748], "category": "initiative-cards"},
    {"page": 37, "name": "exhaust-cards", "bbox": [475, 153, 678, 269.3], "category": "item-cards"},
    {"page": 37, "name": "flip-cards", "bbox": [475, 363, 678, 480.5], "category": "item-cards"},
    {"page": 44, "name": "line-of-sight-diagram", "bbox": [126, 96, 693, 384], "category": "diagram"},
    {"page": 44, "name": "damage-healing-components", "bbox": [421, 538, 721, 706], "category": "item-cards"},
    {"page": 46, "name": "encounter-action-map", "bbox": [114, 357, 363, 576], "category": "diagram"},
    {"page": 51, "name": "flanking-diagram-grid", "bbox": [78, 74.9, 743, 748], "category": "diagram"},
    {"page": 53, "name": "gore-shot-card", "bbox": [500, 529, 656, 625.8], "category": "discipline-cards"},
    {"page": 55, "name": "spell-like-combatant-panels", "bbox": [444, 105, 700, 440], "category": "combatant-cards"},
    {"page": 55, "name": "combat-dice-example", "bbox": [164, 405, 306, 450], "category": "diagram"},
    {"page": 55, "name": "conviction-dice-example", "bbox": [523, 488, 617, 531], "category": "diagram"},
    {"page": 56, "name": "combatant-type-tags", "bbox": [146, 168, 333, 216], "category": "combatant-cards"},
    {"page": 56, "name": "intelligent-combatant-tag-card", "bbox": [493, 644, 654, 720.8], "category": "combatant-cards"},
    {"page": 45, "name": "making-an-attack-combatant-and-item-panel", "bbox": [419, 100, 705, 458], "category": "combatant-cards"},
    {"page": 47, "name": "intervention-card", "bbox": [478, 182, 667, 311], "category": "discipline-cards"},
    {"page": 47, "name": "master-work-card", "bbox": [406, 616, 527, 820], "category": "item-cards"},
    {"page": 57, "name": "item-loot-card", "bbox": [527, 621, 623, 759.8], "category": "item-cards"},
    {"page": 61, "name": "animate-combatant-card", "bbox": [94, 118, 520, 491], "category": "combatant-cards"},
    {"page": 74, "name": "nightingale-adventurer-card", "bbox": [37, 104, 419, 418], "category": "combatant-cards"},
    {"page": 74, "name": "magic-staff-card", "bbox": [443, 104, 583, 311], "category": "item-cards"},
    {"page": 74, "name": "cuirass-card", "bbox": [607, 104, 746, 311], "category": "item-cards"},
    {"page": 74, "name": "summoning-card", "bbox": [420, 320, 579, 426], "category": "discipline-cards"},
    {"page": 74, "name": "nirvanas-mark-card", "bbox": [597, 320, 756, 426], "category": "discipline-cards"},
    {"page": 74, "name": "zulfiqar-combatant-card", "bbox": [56, 446, 340, 683], "category": "combatant-cards"},
    {"page": 59, "name": "padric-command-card", "bbox": [82.5, 112.5, 540.3, 496], "category": "combatant-cards"},
    {"page": 59, "name": "padric-portrait-card", "bbox": [562, 96, 739, 309], "category": "combatant-cards"},
    {"page": 83, "name": "spawn-map", "bbox": [471.5, 96, 733, 345], "category": "diagram"},
    {"page": 83, "name": "inline-blue-totem-token", "bbox": [198.953, 149.792, 219.636, 170.475], "category": "tokens"},
    {"page": 83, "name": "cave-sickle-reference", "bbox": [128, 239, 417, 294.5], "category": "combatant-cards"},
    {"page": 83, "name": "loot-level-reference", "bbox": [190, 308, 349, 338], "category": "combatant-cards"},
    {"page": 83, "name": "loot-level-tag-strip", "bbox": [190, 383, 349, 419], "category": "combatant-cards"},
    {"page": 83, "name": "cave-sickle-card-pair", "bbox": [132, 457, 407, 561], "category": "combatant-cards"},
    # Reference tables on p.100 retain fragments of their source text in the
    # background raster. Restore the complete source regions to prevent a
    # second HTML copy from showing through around their beige table fills.
    {"page": 100, "name": "attack-steps-reference-table", "bbox": [55, 262, 393, 695], "category": "reference-table"},
    {"page": 100, "name": "spell-steps-reference-table", "bbox": [393, 362, 820.346, 800], "category": "reference-table"},
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
    overlay_path = page_dir / "fidelity_overlays.json"
    asset = page_dir / f"fidelity-overlay-component-{name}.png"
    page = document[page_number - 1]
    width_px, height_px = render_crop(page, bbox, asset, scale) if apply else (0, 0)

    if apply:
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

    return {"page": page_number, "region": name, "category": target["category"], "bbox": bbox, "asset": str(asset.relative_to(ROOT))}


def reconcile_page_suppressions(page_number: int, targets: list[dict[str, object]]) -> list[str]:
    """Synchronize only suppressions owned by this audit with current crops.

    This also clears stale flags when a crop is tightened. Without this pass,
    old centre-in-crop decisions survive after the crop is corrected.
    """
    page_dir = PAGES / f"page_{page_number:03d}"
    dom_path = page_dir / f"page_{page_number:03d}_dom.json"
    data = json.loads(dom_path.read_text(encoding="utf-8"))
    changed: list[str] = []
    for block in data.get("blocks", []):
        for line in block.get("lines", []):
            line_bbox = line.get("bbox") or []
            if len(line_bbox) != 4:
                continue
            cx = (float(line_bbox[0]) + float(line_bbox[2])) / 2
            cy = (float(line_bbox[1]) + float(line_bbox[3])) / 2
            matching = next((target for target in targets if inside(cx, cy, [float(v) for v in target["bbox"]])), None)
            evidence = line.get("rasterizedDuplicateEvidence") or {}
            owned = evidence.get("auditId") == AUDIT_ID
            foreign_confirmation = line.get("rasterizedDuplicate") and evidence.get("auditId") not in (None, AUDIT_ID)

            if matching is None:
                if owned:
                    line.pop("rasterizedDuplicate", None)
                    line.pop("rasterizedDuplicateReason", None)
                    line.pop("rasterizedDuplicateEvidence", None)
                    changed.append(str(line.get("id")))
                continue
            if foreign_confirmation:
                continue

            target = matching
            new_evidence = {
                "auditId": AUDIT_ID,
                "sourcePdfPage": page_number,
                "region": str(target["name"]),
                "category": str(target["category"]),
                "rule": "suppress HTML lines whose centres are inside the currently audited source-PDF component crop",
                "evidenceRef": EVIDENCE,
            }
            new_reason = "component or diagram copy is restored as an exact source-PDF crop"
            if not line.get("rasterizedDuplicate") or line.get("rasterizedDuplicateReason") != new_reason or evidence != new_evidence:
                line["rasterizedDuplicate"] = True
                line["rasterizedDuplicateReason"] = new_reason
                line["rasterizedDuplicateEvidence"] = new_evidence
                changed.append(str(line.get("id")))

    dom_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def prune_page_overlays(page_number: int, targets: list[dict[str, object]]) -> list[str]:
    """Remove obsolete regions owned by this audit after a target is replaced."""
    page_dir = PAGES / f"page_{page_number:03d}"
    overlay_path = page_dir / "fidelity_overlays.json"
    data = load_overlay_json(overlay_path)
    valid_regions = {str(target["name"]) for target in targets}
    kept = []
    removed: list[str] = []
    for item in data["overlays"]:
        obsolete = (
            item.get("auditId") == AUDIT_ID
            and int(item.get("sourcePdfPage", -1)) == page_number
            and str(item.get("region", "")) not in valid_regions
        )
        if not obsolete:
            kept.append(item)
            continue
        url = str(item.get("url", ""))
        filename = Path(url.split("?", 1)[0]).name
        asset = page_dir / filename
        if filename.startswith("fidelity-overlay-component-") and asset.is_file():
            asset.unlink()
        removed.append(str(item.get("region", url)))
    if removed:
        data["overlays"] = kept
        overlay_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return removed


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
    suppression_changes = []
    if not args.dry_run:
        for page_number in sorted({int(target["page"]) for target in targets}):
            page_targets = [target for target in targets if int(target["page"]) == page_number]
            removed_regions = prune_page_overlays(page_number, page_targets)
            if removed_regions:
                print(f"Page {page_number}: removed obsolete regions {', '.join(removed_regions)}")
            suppression_changes.extend(reconcile_page_suppressions(page_number, page_targets))
    report = ROOT / "tmp/component-audit/component-overlay-apply.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"auditId": AUDIT_ID, "dryRun": args.dry_run, "targets": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Targets: {len(results)}; lines synchronized: {len(suppression_changes)}; dry-run={args.dry_run}")
    print(f"Report: {report}")


if __name__ == "__main__":
    main()
