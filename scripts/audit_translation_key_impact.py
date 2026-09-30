"""Read-only mapping from sampled semantic units to current production editor keys.

The script never edits the app, page DOM JSON, localStorage, Payload, or SQLite.
It performs an optional read-only SQLite key count, then writes output under tmp/
and a reviewable Markdown summary.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SAMPLE_JSON = ROOT / "tmp/layout-sample/sample-layout-audit.json"
PAGE_DOM = {
    2: ROOT / "apps/web/public/pages/page_002/page_002_dom.json",
    3: ROOT / "apps/web/public/pages/page_003/page_003_dom.json",
    101: ROOT / "apps/web/public/pages/page_101/page_101_dom.json",
}


def intersection_over_unit(unit_bbox: list[float], block_bbox: list[float]) -> float:
    x0 = max(unit_bbox[0], block_bbox[0])
    y0 = max(unit_bbox[1], block_bbox[1])
    x1 = min(unit_bbox[2], block_bbox[2])
    y1 = min(unit_bbox[3], block_bbox[3])
    area = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    unit_area = max(0.0, unit_bbox[2] - unit_bbox[0]) * max(0.0, unit_bbox[3] - unit_bbox[1])
    return area / unit_area if unit_area else 0.0


def unit_text(unit: dict[str, Any]) -> str:
    return " ".join(str(unit.get("text", "")).split())


def map_unit(page_number: int, unit: dict[str, Any], dom: dict[str, Any]) -> dict[str, Any]:
    ranked = sorted(
        (
            (intersection_over_unit(unit["bbox"], block["bbox"]), index, block)
            for index, block in enumerate(dom.get("blocks", []))
        ),
        key=lambda item: (-item[0], item[1]),
    )
    top_score, top_index, top_block = ranked[0] if ranked else (0.0, -1, {})
    tied = [item for item in ranked if abs(item[0] - top_score) < 1e-9]
    source_ids = {int(value) for value in unit.get("sourceBlockIndices", [])}
    legacy_id_number = None
    legacy_id = top_block.get("id")
    if isinstance(legacy_id, str) and legacy_id.startswith("block_"):
        try:
            legacy_id_number = int(legacy_id.removeprefix("block_"))
        except ValueError:
            pass
    lineage_match = legacy_id_number in source_ids
    confidence = (
        "unique-containing-block"
        if top_score >= 0.98 and len(tied) == 1 and lineage_match
        else "ambiguous"
    )
    return {
        "page": page_number,
        "unitId": unit["unitId"],
        "kind": unit.get("kind"),
        "text": unit_text(unit),
        "sourceBlockIndices": unit.get("sourceBlockIndices", []),
        "legacyBlockId": top_block.get("id") if top_index >= 0 else None,
        "legacyArrayIndex": top_index if top_index >= 0 else None,
        "legacyKey": f"page_{page_number}_block_{top_index}" if top_index >= 0 else None,
        "bboxContainment": round(top_score, 6),
        "candidateCountAtBestScore": len(tied),
        "lineageMatchesLegacyBlockId": lineage_match,
        "mappingStatus": confidence,
    }


def load_units(sample: dict[str, Any]) -> dict[int, list[dict[str, Any]]]:
    return {
        2: sample["pages"]["2"]["credits"]["units"],
        3: sample["pages"]["3"]["contents"]["units"],
        101: sample["pages"]["101"]["index"]["units"],
    }


def read_database_impact(keys: list[str]) -> dict[str, Any]:
    """Count exact sampled keys in the current-schema local DB without writes."""
    path = ROOT / "apps/admin/apps-admin.db"
    if not path.exists():
        return {"status": "database-file-not-present"}
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
    try:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(translations)")}
        if "span_key" not in columns:
            return {"status": "current-span-key-schema-not-found"}
        placeholders = ",".join("?" for _ in keys)
        matches = connection.execute(
            f"SELECT span_key, COUNT(*) FROM translations WHERE span_key IN ({placeholders}) GROUP BY span_key",
            keys,
        ).fetchall()
        languages = connection.execute(
            f"SELECT language, COUNT(*) FROM translations WHERE span_key IN ({placeholders}) GROUP BY language",
            keys,
        ).fetchall()
        return {
            "status": "read-only-query-complete",
            "database": "apps/admin/apps-admin.db",
            "sampledKeys": len(keys),
            "matchingKeyCount": len(matches),
            "matchingRecordCount": sum(count for _, count in matches),
            "matchingLanguages": dict(languages),
        }
    finally:
        connection.close()


def render_report(results: list[dict[str, Any]], database: dict[str, Any]) -> str:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    pages: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for item in results:
        if item["legacyKey"]:
            groups[item["legacyKey"]].append(item)
        pages[item["page"]].append(item)

    lines = [
        "# Translation-key impact map (read-only)",
        "",
        "This report maps sample semantic units to the currently shipped DOM blocks and editor keys. It does not migrate data or activate new units.",
        "",
        "## Mapping method",
        "",
        "- Confirmed the key formula in `PageRenderer.tsx`: `page_${pageNumber}_block_${blockIdx}`, where `blockIdx` is the current DOM `blocks` array index.",
        "- Matched each sample unit's source bbox to the current production DOM block with the greatest area containment. A mapping is accepted only when one block contains at least 98% of the unit bbox and is the unique best match.",
        "- Cross-checked that the chosen DOM block's original `block_N` ID appears in the unit's source block lineage. The legacy DOM may merge several source blocks, so lineage alone cannot produce the editor array index or a one-to-one semantic mapping.",
        "",
        "## Coverage and fanout",
        "",
        "| Page | Sample units | Unique mapped | Ambiguous | Existing keys touched | Fanout keys | Max units per key |",
        "|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for page in (2, 3, 101):
        items = pages[page]
        mapped = [item for item in items if item["mappingStatus"] == "unique-containing-block"]
        per_key: dict[str, int] = defaultdict(int)
        for item in mapped:
            per_key[item["legacyKey"]] += 1
        lines.append(
            f"| {page} | {len(items)} | {len(mapped)} | {len(items) - len(mapped)} | {len(per_key)} | {sum(count > 1 for count in per_key.values())} | {max(per_key.values(), default=0)} |"
        )
    lines += ["", "## Existing keys with multiple candidate units", ""]
    for key, items in sorted(groups.items()):
        if len(items) <= 1:
            continue
        examples = "; ".join(f"`{item['unitId']}` {item['text'][:45]}" for item in items[:4])
        suffix = f"; +{len(items) - 4} more" if len(items) > 4 else ""
        lines.append(f"- **`{key}` → {len(items)} units:** {examples}{suffix}")
    lines += ["", "## Ambiguous or unmatched units", ""]
    ambiguous = [item for item in results if item["mappingStatus"] != "unique-containing-block"]
    if ambiguous:
        for item in ambiguous:
            lines.append(
                f"- Page {item['page']} `{item['unitId']}`: best containment {item['bboxContainment']:.3f}; candidates at best score {item['candidateCountAtBestScore']}; source blocks {item['sourceBlockIndices']}."
            )
    else:
        lines.append("- None under the bbox matching rule.")
    lines += [
        "",
        "## Consequences",
        "",
        "- Any key with multiple semantic units is a one-to-many split. Reusing that key for each new unit would collide in Payload and in the browser's per-key draft map; the old combined translation cannot be split automatically without translation-aware segmentation.",
        "- Page 3 units expose labels only; their printed page references are separate source lineage and should not be silently folded into the translated label. Dotted leaders are page artwork.",
        "- Page 2 credit categories are separate semantic units, but current combined blocks can group neighboring categories. Label/body style preservation is a separate editor/schema requirement.",
        "- Page 101 rows fan out from column-sized legacy blocks. These are not safe to activate under current keys without a compatibility strategy.",
        "- This audit does not inspect browser `localStorage`; local drafts remain an unverified persistence surface.",
        "- The full 253-unit mapping, including every legacy key, source block, bbox score, and text, is in `tmp/layout-sample/key-impact-map.json`.",
        "",
        "## Current-schema database snapshot",
        "",
    ]
    if database["status"] == "read-only-query-complete":
        lines.append(
            f"A read-only query of `{database['database']}` found {database['matchingRecordCount']} records for the {database['sampledKeys']} sampled existing keys ({database['matchingKeyCount']} keys matched). This describes only this local database snapshot; it says nothing about browser-local drafts or another deployed database."
        )
    else:
        lines.append(f"No matching-key conclusion was made: `{database['status']}`.")
    lines += [
        "",
        "## Safe next step",
        "",
        "Keep the sample semantic units inactive. Design a sidecar or versioned key scheme that leaves old keys readable and preserves the full old translation as a recoverable source value. Test a single page 2 credit category in the app before any key migration or batch extraction.",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=ROOT / "docs/architecture/sample-key-impact.md")
    parser.add_argument("--json", type=Path, default=ROOT / "tmp/layout-sample/key-impact-map.json")
    args = parser.parse_args()

    sample = json.loads(SAMPLE_JSON.read_text(encoding="utf-8"))
    results: list[dict[str, Any]] = []
    for page_number, units in load_units(sample).items():
        dom = json.loads(PAGE_DOM[page_number].read_text(encoding="utf-8"))
        results.extend(map_unit(page_number, unit, dom) for unit in units)

    expected_counts = {2: 17, 3: 39, 101: 197}
    for page_number, expected in expected_counts.items():
        page_results = [item for item in results if item["page"] == page_number]
        if len(page_results) != expected:
            raise SystemExit(f"Page {page_number}: expected {expected} units, found {len(page_results)}")
        if any(item["mappingStatus"] != "unique-containing-block" for item in page_results):
            raise SystemExit(f"Page {page_number}: at least one unit has ambiguous or unmatched legacy geometry")
    unit_ids = [(item["page"], item["unitId"]) for item in results]
    if len(unit_ids) != len(set(unit_ids)):
        raise SystemExit("Duplicate semantic unit IDs found")

    keys = sorted({item["legacyKey"] for item in results if item["legacyKey"]})
    database = read_database_impact(keys)

    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    detail = {"mappings": results, "databaseSnapshot": database}
    args.json.write_text(json.dumps(detail, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    args.report.write_text(render_report(results, database), encoding="utf-8")
    print(f"Mapped {len(results)} semantic units; report: {args.report}; detail: {args.json}")


if __name__ == "__main__":
    main()
