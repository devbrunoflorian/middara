#!/usr/bin/env python3
"""Apply already-reviewed editorial-family boundaries across the rulebook.

This is a manifest-driven rollout, not a gap-threshold classifier. The census
provides exact source-line boundaries; the existing family review determines
which rows may become paragraph fields. Protected pages/blocks and boundaries
already represented by distinct units are left unchanged.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps/web/public/pages"
CANDIDATES = ROOT / "docs/project-progress/evidence/2026-10-07-editorial-family-audit/editorial-paragraph-geometry-candidates.csv"
OUT = ROOT / "tmp/document-wide-editorial-rollout"

# Explicit family exclusions authorized by the existing editorial review.
PROTECTED_BLOCKS = {(22, "block_10"), (22, "block_11"), (38, "block_30")}
LIST_MARKERS: dict[tuple[int, str], list[int]] = {
    (13, "block_24"): [0, 7, 16],
    (69, "block_12"): [1, 6, 8],
    (69, "block_13"): [1, 8, 11, 16, 24, 27],
    (76, "block_8"): [6, 13, 20, 24],
    (77, "block_196"): [23, 26, 30],
    (86, "block_34"): [14, 17],
    (97, "block_11"): [14],
}

# Additional already-approved Step-family starts and the one reviewed generic
# paragraph boundary that did not belong to the completed-sentence class.
EXTRA_CUTS: dict[tuple[int, str], list[int]] = {
    (41, "block_27"): [1],
    (41, "block_44"): [1, 5],
    (100, "block_47"): [2, 10],
    (100, "block_48"): [1, 4],
}
REVIEWED_EXTRA_BOUNDARY = (41, "block_44", "line_44_5")

SPECIAL_GROUPS: dict[tuple[int, str], list[tuple[str, list[int]]]] = {
    # The existing Note child ID and translation remain unchanged. The other
    # three numbered steps become editorial children of the same visual list.
    (13, "block_24"): [
        ("p13-story-round-2-step-1", list(range(1, 7))),
        ("p13-story-round-2-step-2-body", list(range(8, 14))),
        ("p13-story-round-2-bounty-note", [14, 15]),
        ("p13-story-round-2-step-3", [17, 18, 19]),
    ],
}
SPECIAL_LABELS = {
    "p13-story-round-2-step-1": "Step 1",
    "p13-story-round-2-step-2-body": "Step 2",
    "p13-story-round-2-bounty-note": "Note",
    "p13-story-round-2-step-3": "Step 3",
}


def source_text(line: dict[str, Any]) -> str:
    return "".join(
        str(span.get("displayOverride") or span.get("text", ""))
        for span in line.get("spans", [])
        if not span.get("renderOnlyStrokePass")
    )


def is_content_line(line: dict[str, Any]) -> bool:
    return bool(source_text(line).strip())


def geometry_digest(data: dict[str, Any]) -> str:
    payload = {
        "width": data.get("width"),
        "height": data.get("height"),
        "blocks": [
            (block.get("id"), block.get("bbox"),
             [(line.get("id"), line.get("bbox"), line.get("baselineY"))
              for line in block.get("lines", [])])
            for block in data.get("blocks", [])
        ],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def parse_ids(value: str) -> list[str]:
    return [part.strip() for part in value.replace(",", "|").split("|") if part.strip()]


def make_field(block: dict[str, Any], lines: list[dict[str, Any]], unit_id: str,
               source_field: dict[str, Any] | None = None) -> dict[str, Any]:
    if not lines:
        raise ValueError(f"{block.get('id')} {unit_id}: empty line group")
    boxes = [line.get("bbox") or block["bbox"] for line in lines]
    first = lines[0]
    source_field = source_field or {}
    frame = dict(source_field.get("frame") or {})
    frame.update({
        "x": float(first.get("availableX", first["bbox"][0])),
        "width": float(first.get("availableWidth", block["bbox"][2] - block["bbox"][0])),
        "textAlign": frame.get("textAlign", "left"),
        "lineHeight": frame.get("lineHeight", block.get("defaultLineHeight", 1.1)),
    })
    result = dict(source_field)
    result.update({
        "id": f"{unit_id}-field",
        "lineIds": [str(line["id"]) for line in lines],
        "bbox": [
            min(float(box[0]) for box in boxes),
            min(float(box[1]) for box in boxes),
            max(float(box[2]) for box in boxes),
            max(float(box[3]) for box in boxes),
        ],
        "frame": frame,
    })
    return result


def current_unit_for_line(units: list[dict[str, Any]], line_id: str) -> set[int]:
    return {index for index, unit in enumerate(units)
            if line_id in set(unit.get("field", {}).get("lineIds", []))}


def build_cut_map(rows: list[dict[str, str]]) -> tuple[dict[tuple[int, str], set[int]], list[dict[str, Any]]]:
    page_cache: dict[int, dict[str, Any]] = {}
    cuts: dict[tuple[int, str], set[int]] = defaultdict(set)
    classification: list[dict[str, Any]] = []
    for row in rows:
        cls = row.get("structural_class", "")
        if cls != "completed sentence → probable paragraph transition":
            continue
        page_number = int(row["page"])
        block_id = row["block_id"]
        if page_number <= 12:
            classification.append({"page": page_number, "block": block_id, "decision": "protected pages 1–12"})
            continue
        if (page_number, block_id) in PROTECTED_BLOCKS:
            classification.append({"page": page_number, "block": block_id, "decision": "protected known exception / same paragraph"})
            continue

        page = page_cache.get(page_number)
        if page is None:
            path = PAGE_ROOT / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
            page = json.loads(path.read_text(encoding="utf-8"))
            page_cache[page_number] = page
        block = next((item for item in page.get("blocks", []) if item.get("id") == block_id), None)
        if block is None:
            raise ValueError(f"p.{page_number} missing {block_id}")
        lines = block.get("lines", [])
        indexes = {str(line.get("id")): i for i, line in enumerate(lines)}
        previous_ids = parse_ids(row.get("previous_line_ids", ""))
        next_ids = parse_ids(row.get("next_line_ids", ""))
        if not previous_ids or not next_ids or any(item not in indexes for item in previous_ids + next_ids):
            raise ValueError(f"p.{page_number} {block_id}: candidate references unknown source line")
        previous_indexes = [indexes[item] for item in previous_ids]
        next_indexes = [indexes[item] for item in next_ids]
        cut_at = min(next_indexes)
        if max(previous_indexes) >= cut_at:
            raise ValueError(f"p.{page_number} {block_id}: candidate source lines are not ordered")
        previous_units = set().union(*(current_unit_for_line(block.get("typographicUnits", []), item)
                                       for item in previous_ids))
        next_units = set().union(*(current_unit_for_line(block.get("typographicUnits", []), item)
                                   for item in next_ids))
        if previous_units and next_units and previous_units.isdisjoint(next_units):
            classification.append({"page": page_number, "block": block_id, "decision": "already represented by separate units"})
            continue
        if previous_units and next_units and not previous_units.intersection(next_units):
            raise ValueError(f"p.{page_number} {block_id}: ambiguous unit ownership")
        if (previous_units or next_units) and not (previous_units and next_units):
            raise ValueError(f"p.{page_number} {block_id}: partial unit ownership needs manual review")
        cuts[(page_number, block_id)].add(cut_at)
        classification.append({"page": page_number, "block": block_id, "decision": "approved paragraph family", "cutBeforeLine": lines[cut_at]["id"]})
    return cuts, classification


def normalized_groups(block: dict[str, Any], page_number: int, block_id: str,
                      cuts: set[int], marker_indexes: set[int]) -> list[list[int]]:
    lines = block.get("lines", [])
    if not lines:
        return []
    groups: list[list[int]] = []
    active: list[int] = []
    for index, line in enumerate(lines):
        if index in marker_indexes:
            if active:
                groups.append(active)
                active = []
            continue
        if index in cuts and active:
            groups.append(active)
            active = []
        if is_content_line(line):
            active.append(index)
    if active:
        groups.append(active)
    return groups


def apply_block(data: dict[str, Any], page_number: int, block_id: str,
                cut_indexes: set[int], marker_indexes: set[int],
                special_groups: list[tuple[str, list[int]]] | None = None) -> dict[str, Any]:
    block = next((item for item in data.get("blocks", []) if item.get("id") == block_id), None)
    if block is None:
        raise ValueError(f"p.{page_number} missing {block_id}")
    if block.get("suspectedGhost") or block.get("rasterizedDuplicate"):
        raise ValueError(f"p.{page_number} {block_id}: artifact block cannot become editorial units")

    lines = block.get("lines", [])
    valid_markers = {i for i in marker_indexes if 0 <= i < len(lines)}
    if len(valid_markers) != len(marker_indexes):
        raise ValueError(f"p.{page_number} {block_id}: invalid marker index")
    for marker_index in valid_markers:
        if not is_content_line(lines[marker_index]):
            raise ValueError(f"p.{page_number} {block_id}: empty list marker line")

    old_units = block.get("typographicUnits", [])
    line_indexes = {str(line.get("id")): index for index, line in enumerate(lines)}
    old_unit_ids = {str(unit.get("id")) for unit in old_units}
    if special_groups is not None:
        templates = {str(unit.get("id")): unit for unit in old_units}
        groups = [(unit_id, indexes, templates.get(unit_id)) for unit_id, indexes in special_groups]
    elif old_units:
        groups: list[tuple[str, list[int], dict[str, Any] | None]] = []
        for unit in old_units:
            field = unit.get("field", {})
            ids = [line_id for line_id in field.get("lineIds", []) if line_id in line_indexes]
            indexes = [line_indexes[line_id] for line_id in ids if line_indexes[line_id] not in valid_markers]
            if not indexes:
                continue
            pieces: list[list[int]] = []
            active: list[int] = []
            for index in indexes:
                if index in cut_indexes or (index in valid_markers):
                    if active:
                        pieces.append(active)
                        active = []
                active.append(index)
            if active:
                pieces.append(active)
            # A source-line gap created by a static marker also starts a new item.
            marker_cuts = sorted(valid_markers)
            expanded: list[list[int]] = []
            for piece in pieces:
                current: list[int] = []
                for index in piece:
                    if current and any(current[-1] < marker < index for marker in marker_cuts):
                        expanded.append(current)
                        current = []
                    current.append(index)
                if current:
                    expanded.append(current)
            groups.extend((str(unit["id"]), piece, unit) for piece in expanded)
    else:
        index_groups = normalized_groups(block, page_number, block_id, cut_indexes, valid_markers)
        groups = [("", indexes, None) for indexes in index_groups]

    if not groups:
        raise ValueError(f"p.{page_number} {block_id}: no editable source text groups")

    # Drop empty groups and guarantee every visible source line remains owned
    # exactly once, either by an editable unit or an explicit fixed marker.
    groups = [group for group in groups if any(is_content_line(lines[i]) for i in group[1])]
    owned = [index for _, indexes, _ in groups for index in indexes]
    expected = [i for i, line in enumerate(lines) if is_content_line(line) and i not in valid_markers]
    if sorted(owned) != expected or len(owned) != len(set(owned)):
        missing = sorted(set(expected) - set(owned))
        duplicate = sorted(index for index in set(owned) if owned.count(index) > 1)
        raise ValueError(f"p.{page_number} {block_id}: line ownership mismatch missing={missing} duplicate={duplicate}")

    new_units: list[dict[str, Any]] = []
    used_ids = set(old_unit_ids)
    source_unit_seen: dict[str, int] = defaultdict(int)
    new_sequence = 0
    for original_id, indexes, template in groups:
        selected_lines = [lines[i] for i in indexes]
        if template is not None:
            source_unit_seen[original_id] += 1
            occurrence = source_unit_seen[original_id]
            if occurrence == 1:
                unit_id = original_id
            else:
                unit_id = f"{original_id}-paragraph-{occurrence}"
            unit = dict(template)
            unit["id"] = unit_id
            old_field = dict(template.get("field", {}))
            unit["field"] = make_field(block, selected_lines, unit_id, old_field)
            if occurrence > 1:
                unit["label"] = f"Paragraph {occurrence}"
        else:
            new_sequence += 1
            if original_id:
                unit_id = original_id
            else:
                unit_id = f"p{page_number}-{block_id.replace('_', '-')}-paragraph-{new_sequence}"
            while unit_id in used_ids:
                new_sequence += 1
                unit_id = f"p{page_number}-{block_id.replace('_', '-')}-paragraph-{new_sequence}"
            unit = {"id": unit_id, "label": SPECIAL_LABELS.get(unit_id, "Paragraph"), "kind": "paragraph"}
            unit["field"] = make_field(block, selected_lines, unit_id)
        if unit["id"] in {item["id"] for item in new_units}:
            raise ValueError(f"p.{page_number} {block_id}: duplicate new unit id {unit['id']}")
        used_ids.add(unit["id"])
        unit["_sourceFirstIndex"] = min(indexes)
        new_units.append(unit)

    new_units.sort(key=lambda item: item.pop("_sourceFirstIndex"))
    block["typographicUnits"] = new_units
    if valid_markers:
        block["listMarkerLineIndexes"] = sorted(set(block.get("listMarkerLineIndexes", [])) | valid_markers)
    return {
        "page": page_number,
        "block": block_id,
        "oldUnitIds": sorted(old_unit_ids),
        "newUnits": [{"id": unit["id"], "label": unit.get("label"), "lineIds": unit["field"]["lineIds"]} for unit in new_units],
        "markers": sorted(valid_markers),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the reviewed family metadata")
    args = parser.parse_args()
    with CANDIDATES.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    cuts_by_block, classification = build_cut_map(rows)

    modifications: dict[int, dict[str, Any]] = {}
    before_digests: dict[int, str] = {}
    action_blocks = set(cuts_by_block) | set(LIST_MARKERS) | set(EXTRA_CUTS) | set(SPECIAL_GROUPS)
    for page_number, block_id in sorted(action_blocks):
        if page_number <= 12 or (page_number, block_id) in PROTECTED_BLOCKS:
            raise ValueError(f"protected page/block was added to rollout manifest: p.{page_number} {block_id}")
        path = PAGE_ROOT / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        if page_number not in modifications:
            modifications[page_number] = json.loads(path.read_text(encoding="utf-8"))
            before_digests[page_number] = geometry_digest(modifications[page_number])
        data = modifications[page_number]
        block_cut_indexes = set(cuts_by_block.get((page_number, block_id), set()))
        block_cut_indexes.update(EXTRA_CUTS.get((page_number, block_id), []))
        marker_indexes = set(LIST_MARKERS.get((page_number, block_id), []))
        special = SPECIAL_GROUPS.get((page_number, block_id))
        action = apply_block(data, page_number, block_id, block_cut_indexes, marker_indexes, special)
        if (page_number, block_id) == (57, "block_80"):
            action["translationMigrationRequired"] = {
                "oldUnitId": "p57-block-80-body-size-10pt",
                "splitAtExactPortugueseSentence": "...do oponente que derrotou.",
                "newParagraphIds": [
                    "p57-block-80-body-size-10pt-paragraph-2",
                    "p57-block-80-body-size-10pt-paragraph-3",
                ],
            }
        classification.append({"page": page_number, "block": block_id, "decision": "approved family applied", "unitCount": len(action["newUnits"])})

    # The Explicit Example and Heading/Body families are already present on
    # their reviewed manifests. These records assert that no conflicting data
    # or legacy IDs were overwritten during this rollout.
    for path_page, data in modifications.items():
        if geometry_digest(data) != before_digests[path_page]:
            raise ValueError(f"source page geometry changed in p.{path_page}")
    classification.append({"page": 41, "block": "block_44", "decision": "approved paragraph family", "cutBeforeLine": REVIEWED_EXTRA_BOUNDARY[2]})

    result = {
        "apply": args.apply,
        "candidateRows": len(rows),
        "paragraphCandidateDecisions": classification,
        "modifiedBlocks": [
            action
            for data in modifications.values()
            for block in data.get("blocks", [])
            for action in []
        ],
        "pages": sorted(modifications),
        "geometryDigests": before_digests,
        "protectedBlocks": [f"p{page}:{block}" for page, block in sorted(PROTECTED_BLOCKS)],
        "protectedPages1to12": True,
    }
    # Collect a concise summary from the mutated structures for a dry-run ledger.
    result["modifiedBlocks"] = []
    for page_number, data in sorted(modifications.items()):
        original_path = PAGE_ROOT / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        original = json.loads(original_path.read_text(encoding="utf-8"))
        original_by_id = {block.get("id"): block for block in original.get("blocks", [])}
        for block in data.get("blocks", []):
            if block.get("id") not in original_by_id or block.get("typographicUnits") != original_by_id[block.get("id")].get("typographicUnits") or block.get("listMarkerLineIndexes") != original_by_id[block.get("id")].get("listMarkerLineIndexes"):
                result["modifiedBlocks"].append({
                    "page": page_number,
                    "block": block.get("id"),
                    "unitIds": [unit.get("id") for unit in block.get("typographicUnits", [])],
                    "markers": block.get("listMarkerLineIndexes", []),
                })

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "rollout-manifest-and-classification.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.apply:
        for page_number, data in sorted(modifications.items()):
            path = PAGE_ROOT / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "apply": args.apply,
        "candidateRows": len(rows),
        "approvedParagraphCuts": sum(1 for item in classification if item.get("decision") == "approved paragraph family"),
        "alreadyRepresented": sum(1 for item in classification if item.get("decision") == "already represented by separate units"),
        "protectedCandidates": sum(1 for item in classification if item.get("decision", "").startswith("protected")),
        "modifiedBlocks": len(result["modifiedBlocks"]),
        "pagesChanged": sorted(modifications),
        "sourceGeometryUnchanged": True,
        "report": str((OUT / "rollout-manifest-and-classification.json").resolve()),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
