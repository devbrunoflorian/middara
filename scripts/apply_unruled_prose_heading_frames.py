#!/usr/bin/env python3
"""Apply safe heading frames when the PDF has no matching divider vector.

The first heading pass required a source divider. This pass handles the common
prose variant where the heading is followed by an aligned body block but the
divider was extracted as part of another drawing. Structural pages remain
excluded by the same book-wide policy used by the geometry audit.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from audit_bookwide_layout_policy import STRUCTURAL_EXCEPTIONS


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
INPUT = ROOT / "tmp" / "ghost-audit" / "heading-frames" / "candidate-heading-body-pairs.csv"
OUT = ROOT / "tmp" / "ghost-audit" / "heading-frames"

# Extracted card lettering is still a block in the DOM, but it is part of the
# raster card image and must never receive a prose frame.
IMAGE_HEADING_EXCEPTIONS = {(56, "block_92"), (56, "block_97")}

# A token strip interrupts the heading/body sequence on p. 17. Its three
# headings still belong to the two ordinary text columns, so they are kept as
# a small explicit page-local exception.
LOCAL_HEADING_FRAMES = {
    (17, "block_21"): {"x": 86.173, "width": 320.0, "textAlign": "left"},
    (17, "block_35"): {"x": 86.173, "width": 320.0, "textAlign": "left"},
    (17, "block_125"): {"x": 415.842, "width": 321.0, "textAlign": "left"},
}


def num(value: str) -> float:
    return float(value)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write approved heading frames to page sidecars")
    args = parser.parse_args()

    rows = list(csv.DictReader(INPUT.open(encoding="utf-8-sig", newline="")))
    selected: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    changed: list[dict[str, Any]] = []
    history: list[dict[str, Any]] = []

    # The heading scanner already established the local relationship. These
    # bounds keep this pass inside ordinary prose columns and avoid treating a
    # card label or a decorative title as a column frame.
    for row in rows:
        page = int(row["page"])
        if row["frame_exists"] == "True":
            if row["rule_supported"] == "False" and (page, row["heading_id"]) not in IMAGE_HEADING_EXCEPTIONS:
                history.append({
                    "page": page,
                    "heading_id": row["heading_id"],
                    "heading": row["heading"],
                    "x": num(row["x_pt"]),
                    "width": num(row["current_frame_width_pt"]),
                    "body_id": row["body_id"],
                    "appliedPreviously": True,
                })
            continue
        reason = ""
        if (page, row["heading_id"]) in IMAGE_HEADING_EXCEPTIONS:
            reason = "card-lettering-raster-image"
        elif page in STRUCTURAL_EXCEPTIONS:
            reason = STRUCTURAL_EXCEPTIONS[page]
        elif num(row["body_width_pt"]) < 175 or num(row["body_width_pt"]) > 675:
            reason = "body-width-outside-local-prose-band"
        elif num(row["gap_to_body_pt"]) > 32:
            reason = "heading-body-gap-too-large"
        elif num(row["proposed_extra_width_pt"]) < 35:
            reason = "heading-already-near-body-width"
        else:
            selected.append(row)
        if reason:
            skipped.append({"page": page, "heading_id": row["heading_id"], "heading": row["heading"], "reason": reason})

    by_page: dict[int, list[dict[str, Any]]] = {}
    for row in selected:
        by_page.setdefault(int(row["page"]), []).append(row)

    for page, page_rows in by_page.items():
        sidecar_path = PAGE_ROOT / f"page_{page:03d}" / "layout_frames.json"
        sidecar = json.loads(sidecar_path.read_text(encoding="utf-8-sig")) if sidecar_path.exists() else {}
        for row in page_rows:
            block_id = row["heading_id"]
            frame = {
                "x": num(row["x_pt"]),
                "width": num(row["body_width_pt"]),
                "textAlign": "left",
            }
            existing = sidecar.get(block_id)
            if existing:
                skipped.append({"page": page, "heading_id": block_id, "heading": row["heading"], "reason": "sidecar-conflict"})
                continue
            changed.append({
                "page": page,
                "heading_id": block_id,
                "heading": row["heading"],
                "x": frame["x"],
                "width": frame["width"],
                "body_id": row["body_id"],
                "applied": args.apply,
            })
            if args.apply:
                sidecar[block_id] = frame
        if args.apply and any(item["page"] == page for item in changed):
            sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # This is a local diagram label, not a prose heading. It is recorded
    # explicitly so it does not get mistaken for an ordinary section title.
    value_sidecar_path = PAGE_ROOT / "page_072" / "layout_frames.json"
    value_sidecar = json.loads(value_sidecar_path.read_text(encoding="utf-8-sig")) if value_sidecar_path.exists() else {}
    value_frame = {"x": 86.80709887695312, "width": 318.0, "textAlign": "left"}
    value_entry = {"page": 72, "heading_id": "block_53", "heading": "Value:", "x": value_frame["x"], "width": value_frame["width"], "reason": "diagram-label-local-frame", "applied": args.apply}
    if "block_53" not in value_sidecar:
        changed.append(value_entry)
        if args.apply:
            value_sidecar["block_53"] = value_frame
            value_sidecar_path.write_text(json.dumps(value_sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        history.append({**value_entry, "appliedPreviously": True})
        skipped.append({"page": 72, "heading_id": "block_53", "heading": "Value:", "reason": "sidecar-conflict"})

    for (page, block_id), frame in LOCAL_HEADING_FRAMES.items():
        sidecar_path = PAGE_ROOT / f"page_{page:03d}" / "layout_frames.json"
        sidecar = json.loads(sidecar_path.read_text(encoding="utf-8-sig")) if sidecar_path.exists() else {}
        if block_id in sidecar:
            history.append({"page": page, "heading_id": block_id, "heading": "page-local token-strip heading", **frame, "appliedPreviously": True})
            continue
        entry = {"page": page, "heading_id": block_id, "heading": "page-local token-strip heading", **frame, "reason": "token-strip-local-frame", "applied": args.apply}
        changed.append(entry)
        if args.apply:
            sidecar[block_id] = frame
            sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    summary = {
        "candidatePairs": len(rows),
        "selectedProseHeadings": len(selected),
        "skipped": len(skipped),
        "plannedOrApplied": len(changed),
        "alreadyApplied": len(history),
        "applied": args.apply,
        "appliedPages": sorted({item["page"] for item in changed}),
        "structuralPagesExcluded": sorted(STRUCTURAL_EXCEPTIONS),
        "policy": "aligned heading/body pair; local prose width; structural, card, diagram, table and image-led pages remain excluded",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "unruled-prose-heading-frames.json").write_text(json.dumps(history + changed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "unruled-prose-heading-skips.json").write_text(json.dumps(skipped, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "unruled-prose-heading-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
