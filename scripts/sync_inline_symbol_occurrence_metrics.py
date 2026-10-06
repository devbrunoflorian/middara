"""Measure inline symbol boxes and baselines from each source occurrence.

Dry-run by default. It only changes geometric metrics in inline_elements.json;
source drawings, masks, translations, and the Payload database are untouched.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf as fitz

from build_inline_symbol_registry import PDF, ROOT, source_baseline


PAGES_ROOT = ROOT / "apps/web/public/pages"
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"


def source_owner_anchor(anchor: dict) -> dict:
    owner = anchor.get("ownerSpanRef")
    if not owner:
        return anchor
    return {
        **anchor,
        "lineId": owner.get("lineId", anchor["lineId"]),
        "spanIndex": owner["spanIndex"],
    }


def measure_metrics(element: dict, dom: dict, page: fitz.Page, baseline_cache: dict) -> dict:
    anchor = element["anchor"]
    size = float(anchor["sizePt"])
    x0, y0, x1, y1 = map(float, element["bbox"])
    baseline = source_baseline(page, dom, source_owner_anchor(anchor), baseline_cache)
    return {
        "widthEm": (x1 - x0) / size,
        "heightEm": (y1 - y0) / size,
        "verticalAlignEm": (y1 - baseline) / size,
    }


def verify_font_replacement(element: dict, dom: dict, registry: dict) -> None:
    anchor = element["anchor"]
    if anchor.get("side") != "replace" or element.get("drawingIndices"):
        raise ValueError(f"No metrics on non-glyph source adapter: {element.get('symbolId')}")
    symbol = registry.get(element["symbolId"], {})
    legacy = symbol.get("legacy", {})
    line = next(line for line in dom["blocks"][anchor["blockIndex"]]["lines"] if line["id"] == anchor["lineId"])
    span = line["spans"][anchor["spanIndex"]]
    if legacy.get("font") != span.get("font") or span.get("text") not in legacy.get("characters", []):
        raise ValueError(f"Source glyph mismatch for {element['symbolId']} at {anchor['lineId']}:{anchor['spanIndex']}")


def sync(apply: bool, selected_pages: set[int] | None = None) -> dict:
    registry_entries = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    registry = {entry["id"]: entry for entry in registry_entries}
    changed = []
    examined = 0
    glyph_replacements = 0
    same_line_owners = 0
    wrapped_owners_preserved = 0
    baseline_cache: dict[int, list[dict]] = {}

    with fitz.open(PDF) as source:
        for sidecar_path in sorted(PAGES_ROOT.glob("page_*/inline_elements.json")):
            page_no = int(sidecar_path.parent.name.removeprefix("page_"))
            if selected_pages and page_no not in selected_pages:
                continue
            dom_path = sidecar_path.parent / f"page_{page_no:03d}_dom.json"
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
            dom = json.loads(dom_path.read_text(encoding="utf-8"))
            page = source[page_no - 1]

            for element in sidecar.get("elements", []):
                anchor = element.get("anchor", {})
                metrics = element.get("metrics")
                is_font_replacement = (
                    anchor.get("side") == "replace"
                    and not element.get("drawingIndices")
                    and bool(registry.get(element.get("symbolId"), {}).get("legacy"))
                )
                owner = anchor.get("ownerSpanRef")
                owner_line_id = owner.get("lineId", anchor.get("lineId")) if owner else None
                has_same_line_owner = bool(owner and owner_line_id == anchor.get("lineId"))
                has_wrapped_owner = bool(owner and not has_same_line_owner)
                if not is_font_replacement and not has_same_line_owner:
                    if has_wrapped_owner:
                        wrapped_owners_preserved += 1
                    continue
                examined += 1
                if is_font_replacement:
                    verify_font_replacement(element, dom, registry)
                    glyph_replacements += 1
                if has_same_line_owner:
                    same_line_owners += 1

                measured = measure_metrics(element, dom, page, baseline_cache)
                old = metrics or {}
                updated = {**old, **measured}
                delta = max((abs(float(old[key]) - value) for key, value in measured.items() if key in old), default=None)
                needs_update = metrics is None or delta is None or delta > 1e-6
                if needs_update:
                    changed.append({
                        "page": page_no,
                        "symbolId": element.get("symbolId"),
                        "lineId": anchor.get("lineId"),
                        "reason": "source-glyph metrics missing" if metrics is None and is_font_replacement else "source-glyph/owner metrics mismatch",
                        "previous": {key: old.get(key) for key in measured},
                        "measured": measured,
                    })
                    element["metrics"] = updated

            if apply and any(item["page"] == page_no for item in changed):
                sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return {
        "mode": "apply" if apply else "dry-run",
        "examined": examined,
        "glyphReplacements": glyph_replacements,
        "sameLineOwnerRefs": same_line_owners,
        "wrappedOwnerRefsPreserved": wrapped_owners_preserved,
        "changes": len(changed),
        "pagesChanged": sorted({item["page"] for item in changed}),
        "details": changed,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write measured metrics into inline sidecars")
    parser.add_argument("--pages", type=int, nargs="+", help="limit to selected PDF page numbers")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)
    print(json.dumps(sync(args.apply, set(args.pages) if args.pages else None), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
