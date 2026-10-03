#!/usr/bin/env python3
"""Enforce the editable font-size boundary rule across the 102 page corpus.

Every source block that contains two or more editable font sizes (6 pt or
larger) must expose explicit typography units.  Small traces below 6 pt are
kept in the source JSON for visual fidelity, but are classified as decorative
artifacts so they do not become false editing blocks.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
OUT = ROOT / "tmp" / "font-size-boundaries"
MIN_EDIT_SIZE = 6.0


def span_size(span: dict[str, Any]) -> float:
    try:
        return round(float(span.get("size", 0.0) or 0.0), 2)
    except (TypeError, ValueError):
        return 0.0


def has_units(block: dict[str, Any]) -> bool:
    return any(
        block.get(key)
        for key in ("typographicUnits", "typographicSpanUnits", "creditUnits", "creditUnit")
    )


def has_size_boundary_units(block: dict[str, Any]) -> bool:
    """Return whether a mixed-size block exposes selectable size boundaries."""
    # A semantic unit can still contain inline 9 pt/10 pt runs.  Those runs
    # are only independently editable when typographicSpanUnits is present.
    return bool(block.get("typographicSpanUnits"))


def classify(block: dict[str, Any]) -> dict[str, Any]:
    spans = [
        span
        for line in block.get("lines", [])
        for span in line.get("spans", [])
        if isinstance(span, dict) and str(span.get("text", "")).strip()
    ]
    sizes = sorted({span_size(span) for span in spans})
    editable_sizes = sorted({size for size in sizes if size >= MIN_EDIT_SIZE})
    mixed_source = len(sizes) >= 2
    editable_mixed = len(editable_sizes) >= 2
    tiny_trace_mix = mixed_source and not editable_mixed
    return {
        "mixedSource": mixed_source,
        "editableMixed": editable_mixed,
        "tinyTraceMix": tiny_trace_mix,
        "editableSizesPt": editable_sizes,
        "allSizesPt": sizes,
        "hasUnits": has_units(block),
        "hasSizeBoundaryUnits": has_size_boundary_units(block),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-missing",
        action="store_true",
        help="write the report but return success even if editable mixed blocks lack units",
    )
    args = parser.parse_args()

    pages: set[int] = set()
    rows: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for dom_path in sorted(PAGE_ROOT.glob("page_*/page_*_dom.json")):
        try:
            data = json.loads(dom_path.read_text(encoding="utf-8"))
            page = int(data["page_number"])
            pages.add(page)
            for block in data.get("blocks", []):
                result = classify(block)
                if result["mixedSource"] or result["editableMixed"]:
                    rows.append({
                        "page": page,
                        "blockId": str(block.get("id", "")),
                        **result,
                    })
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            errors.append({"file": str(dom_path.relative_to(ROOT)), "error": str(exc)})

    missing = [row for row in rows if row["editableMixed"] and not row["hasSizeBoundaryUnits"]]
    counts = Counter()
    for row in rows:
        if row["mixedSource"]:
            counts["mixed_source"] += 1
        if row["editableMixed"]:
            counts["editable_mixed"] += 1
            counts["editable_mixed_with_units" if row["hasSizeBoundaryUnits"] else "editable_mixed_without_units"] += 1
        if row["tinyTraceMix"]:
            counts["tiny_trace_residual"] += 1

    summary = {
        "pagesFound": len(pages),
        "blocksScanned": sum(
            len(json.loads(path.read_text(encoding="utf-8")).get("blocks", []))
            for path in PAGE_ROOT.glob("page_*/page_*_dom.json")
        ) if not errors else None,
        "minimumEditableSizePt": MIN_EDIT_SIZE,
        "counts": dict(sorted(counts.items())),
        "mixedSourceBlocks": len([row for row in rows if row["mixedSource"]]),
        "editableMixedBlocks": len([row for row in rows if row["editableMixed"]]),
        "editableMixedBlocksWithUnits": len([row for row in rows if row["editableMixed"] and row["hasSizeBoundaryUnits"]]),
        "editableMixedBlocksWithoutUnits": len(missing),
        "tinyTraceResidualBlocks": len([row for row in rows if row["tinyTraceMix"]]),
        "errors": errors,
        "status": "pass" if not missing and not errors else "fail",
        "rule": "Every block with at least two source font sizes >= 6 pt must have explicit typographicSpanUnits for the size boundaries; semantic units alone do not satisfy this rule.",
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "font-size-boundary-validation.json").write_text(
        json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if (args.allow_missing or summary["status"] == "pass") else 1


if __name__ == "__main__":
    raise SystemExit(main())
