#!/usr/bin/env python3
"""Apply and report the approved book-wide layout policy.

The policy deliberately separates continuous prose from annotated, tabular,
and image-led pages. It consumes the existing geometry inventory and only adds
frames to a sidecar when a group is both screen-clear and in the prose class.
The default mode is read-only; ``--apply`` is required to write production
sidecars.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from statistics import median
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
GROUPS_CSV = ROOT / "tmp" / "ghost-audit" / "book-geometry" / "column-groups.csv"
OUT_ROOT = ROOT / "tmp" / "ghost-audit" / "bookwide-layout-policy"

# Pages whose composition is not continuous prose, even when a local text
# group happens to have stable x coordinates. They remain in the review queue.
STRUCTURAL_EXCEPTIONS: dict[int, str] = {
    1: "cover",
    2: "narrative-and-credits",
    3: "contents",
    4: "component-catalog",
    5: "component-catalog",
    6: "component-catalog",
    7: "component-catalog",
    11: "adventure-sheet-and-art",
    12: "annotated-sheet-and-markers",
    15: "annotated-encounter-breakdown",
    16: "annotated-encounter-breakdown",
    20: "loot-table-grid",
    25: "annotated-adventurer-card",
    26: "annotated-item-cards",
    31: "illustrated-transition",
    32: "discipline-card-diagram",
    33: "ability-card-example",
    34: "game-table-setup-diagram",
    35: "setup-diagram-and-labels",
    38: "action-table",
    40: "movement-diagram",
    44: "damage-diagram",
    45: "attack-example-diagram",
    46: "encounter-action-example",
    51: "flanking-diagram",
    54: "spell-example-diagram",
    55: "attack-example-diagram",
    57: "combatant-icons-and-cards",
    58: "combatant-comparison-and-cards",
    59: "annotated-combatant-card",
    61: "annotated-combatant-card",
    63: "ai-card-and-example",
    64: "ai-example-diagram",
    65: "ai-example-diagram",
    66: "ai-example-diagram",
    67: "ai-example-diagram",
    73: "annotated-combatant-card",
    74: "combatant-card-layout",
    75: "summoning-card-and-diagram",
    76: "esper-card-and-rules",
    77: "combatant-card-example",
    78: "discipline-card-and-rules",
    79: "combatant-card-and-table",
    80: "combatant-card-and-rules",
    81: "combatant-card-and-rules",
    82: "combatant-card-and-rules",
    83: "spawning-example-diagram",
    84: "spawning-example-diagram",
    88: "illustrated-transition",
    95: "condition-table",
    96: "action-table",
    97: "token-table",
    98: "token-table",
    99: "illustrated-transition",
    100: "reference-tables",
    101: "index",
    102: "reference-chart",
}


def read_groups() -> list[dict[str, str]]:
    with GROUPS_CSV.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def read_sidecar(page: int) -> tuple[Path, dict[str, Any]]:
    path = PAGE_ROOT / f"page_{page:03d}" / "layout_frames.json"
    if not path.exists():
        return path, {}
    return path, json.loads(path.read_text(encoding="utf-8-sig"))


def group_frame(row: dict[str, str]) -> dict[str, float | str]:
    x = float(row["xMedian"])
    right = x + float(row["maxObservedWidth"])
    return {"x": x, "width": right - x, "textAlign": "left"}


def classify(row: dict[str, str]) -> tuple[str, str]:
    page = int(row["page"])
    if page in STRUCTURAL_EXCEPTIONS:
        return "structural-exception", STRUCTURAL_EXCEPTIONS[page]
    if row["status"] != "screen-clear":
        return "medium-review", row["reviewReasons"] or "geometry-review"
    width = float(row["maxObservedWidth"])
    blocks = int(row["blocks"])
    if blocks < 4:
        return "medium-review", "too-few-peer-blocks"
    if width < 240 or width > 340:
        return "medium-review", "frame-width-outside-prose-band"
    return "high-confidence-prose", "stable-column-no-image-hit"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="add high-confidence frames to production sidecars")
    args = parser.parse_args()

    rows = read_groups()
    report_rows: list[dict[str, Any]] = []
    added: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    for row in rows:
        category, reason = classify(row)
        page = int(row["page"])
        frame = group_frame(row)
        sidecar_path, sidecar = read_sidecar(page)
        block_ids = [value for value in row["blockIds"].split(";") if value]
        missing_ids = [block_id for block_id in block_ids if block_id not in sidecar]
        conflicting_ids = []
        for block_id in block_ids:
            existing = sidecar.get(block_id)
            if not existing:
                continue
            if abs(float(existing.get("x", frame["x"])) - float(frame["x"])) > 0.05 or abs(float(existing.get("width", frame["width"])) - float(frame["width"])) > 0.05:
                conflicting_ids.append(block_id)
        report_rows.append({
            "page": page,
            "groupId": row["groupId"],
            "category": category,
            "reason": reason,
            "blocks": len(block_ids),
            "lines": int(row["lines"]),
            "x": round(float(frame["x"]), 3),
            "width": round(float(frame["width"]), 3),
            "existingFrameCount": len(block_ids) - len(missing_ids),
            "missingFrameCount": len(missing_ids),
            "conflictingFrameCount": len(conflicting_ids),
            "blockIds": ";".join(block_ids),
            "texts": row["texts"],
        })
        if category == "high-confidence-prose" and missing_ids:
            if conflicting_ids:
                conflicts.append({"page": page, "groupId": row["groupId"], "blockIds": conflicting_ids})
                continue
            if args.apply:
                for block_id in missing_ids:
                    sidecar[block_id] = frame
                sidecar_path.parent.mkdir(parents=True, exist_ok=True)
                sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            added.append({"page": page, "groupId": row["groupId"], "count": len(missing_ids), "applied": args.apply})

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    fields = list(report_rows[0]) if report_rows else ["page", "groupId", "category"]
    for name, selected in (
        ("all-candidates.csv", report_rows),
        ("high-confidence-prose.csv", [row for row in report_rows if row["category"] == "high-confidence-prose"]),
        ("review-queue.csv", [row for row in report_rows if row["category"] != "high-confidence-prose"]),
    ):
        with (OUT_ROOT / name).open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(selected)

    summary = {
        "groupsScanned": len(rows),
        "highConfidenceGroups": sum(row["category"] == "high-confidence-prose" for row in report_rows),
        "mediumReviewGroups": sum(row["category"] == "medium-review" for row in report_rows),
        "structuralExceptionGroups": sum(row["category"] == "structural-exception" for row in report_rows),
        "highConfidencePages": sorted({row["page"] for row in report_rows if row["category"] == "high-confidence-prose"}),
        "reviewPages": sorted({row["page"] for row in report_rows if row["category"] != "high-confidence-prose"}),
        "framesAddedOrPlanned": sum(item["count"] for item in added),
        "addedGroups": added,
        "conflicts": conflicts,
        "applied": args.apply,
        "structuralExceptionPages": STRUCTURAL_EXCEPTIONS,
        "policy": "continuous prose only; common local frame; no image/table/card/diagram/callout zone; Admin uses the same layoutFrame",
    }
    (OUT_ROOT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
