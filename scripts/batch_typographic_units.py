"""Discover/apply clearly separated size-based edit units with a frozen manifest.

Discovery is read-only unless --write-manifest is given. Applying requires that
manifest and revalidates every page, block, line, text, size, and font signature.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"
DEFAULT_MANIFEST = ROOT / "docs/project-progress/typographic-unit-batch-2026-10-01.csv"
MIN_FONT_SIZE = 6.0


def clean_lines(block: dict) -> list[tuple[dict, list[dict], float]]:
    result = []
    for line in block.get("lines", []):
        spans = [span for span in line.get("spans", []) if span.get("text", "").strip()]
        if not spans:
            continue
        sizes = {round(float(span.get("size", 0)), 2) for span in spans}
        if len(sizes) != 1:
            return []
        result.append((line, spans, next(iter(sizes))))
    return result


def candidate(block: dict) -> tuple[list[tuple[dict, list[dict], float]], str] | None:
    if block.get("suspectedGhost"):
        return None
    lines = clean_lines(block)
    if len(lines) < 2:
        return None
    if any(line.get("suspectedGhost") or line.get("rasterizedDuplicate") for line, _, _ in lines):
        return None
    first_size = lines[0][2]
    body_sizes = {item[2] for item in lines[1:]}
    if len(body_sizes) != 1:
        return None
    body_size = next(iter(body_sizes))
    if first_size == body_size or min(first_size, body_size) < MIN_FONT_SIZE:
        return None
    first_text = "".join(span.get("text", "") for span in lines[0][1]).strip()
    if not any(char.isalpha() for char in first_text):
        return None
    return lines, first_text


def font_set(lines: list[tuple[dict, list[dict], float]]) -> list[str]:
    return sorted({span.get("font", "") for _, spans, _ in lines for span in spans})


def manifest_rows() -> list[dict]:
    rows = []
    for page_number in range(1, 103):
        path = PAGE_DIR / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        if not path.is_file():
            continue
        page = json.loads(path.read_text(encoding="utf-8"))
        for block in page.get("blocks", []):
            if block.get("typographicUnits"):
                continue
            found = candidate(block)
            if not found:
                continue
            lines, heading_text = found
            body_lines = lines[1:]
            block_id = str(block.get("id", ""))
            if not block_id:
                continue
            rows.append({
                "page": page_number,
                "blockId": block_id,
                "firstLineId": lines[0][0].get("id", ""),
                "remainingLineIds": json.dumps([line.get("id", "") for line, _, _ in body_lines], ensure_ascii=False),
                "firstLineText": heading_text,
                "remainingLineTexts": json.dumps(["".join(span.get("text", "") for span in spans).strip() for _, spans, _ in body_lines], ensure_ascii=False),
                "firstLineSizePt": lines[0][2],
                "remainingSizePt": body_lines[0][2],
                "firstLineFonts": json.dumps(font_set(lines[:1]), ensure_ascii=False),
                "remainingFonts": json.dumps(font_set(body_lines), ensure_ascii=False),
            })
    return rows


def bbox_union(lines: list[dict]) -> list[float]:
    return [
        min(float(line["bbox"][0]) for line in lines),
        min(float(line["bbox"][1]) for line in lines),
        max(float(line["bbox"][2]) for line in lines),
        max(float(line["bbox"][3]) for line in lines),
    ]


def field(block: dict, lines: list[dict], unit_id: str) -> dict:
    first = lines[0]
    return {
        "id": unit_id + "-field",
        "lineIds": [line["id"] for line in lines],
        "bbox": bbox_union(lines),
        "frame": {
            "x": float(first.get("availableX", first["bbox"][0])),
            "width": float(first.get("availableWidth", block["bbox"][2] - block["bbox"][0])),
            "textAlign": "left",
            "lineHeight": 1,
        },
    }


def make_units(block: dict, lines: list[tuple[dict, list[dict], float]]) -> list[dict]:
    heading_lines = [lines[0][0]]
    body_lines = [line for line, _, _ in lines[1:]]
    block_key = re.sub(r"[^a-z0-9-]+", "-", str(block["id"]).casefold()).strip("-")
    heading_id = f"p{int(block['_auditPage'])}-{block_key}-first-size-{lines[0][2]:g}pt"
    body_id = f"p{int(block['_auditPage'])}-{block_key}-remaining-size-{lines[1][2]:g}pt"
    return [
        {"id": heading_id, "field": field(block, heading_lines, heading_id)},
        {"id": body_id, "field": field(block, body_lines, body_id)},
    ]


def load_manifest(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-manifest", action="store_true", help="write the current strict candidate list")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--apply", action="store_true", help="apply and validate all frozen manifest rows")
    args = parser.parse_args()
    fields = ["page", "blockId", "firstLineId", "remainingLineIds", "firstLineText", "remainingLineTexts", "firstLineSizePt", "remainingSizePt", "firstLineFonts", "remainingFonts"]

    if args.write_manifest:
        rows = manifest_rows()
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        with args.manifest.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
        print(f"Wrote {len(rows)} frozen candidates to {args.manifest}")
        print(f"Pages covered: {len({int(row['page']) for row in rows})}; each candidate has one first-line size and one distinct body size >= {MIN_FONT_SIZE:g}pt.")
        return

    if not args.apply:
        rows = manifest_rows()
        print(f"Read-only candidates: {len(rows)} across {len({int(row['page']) for row in rows})} pages")
        return

    if not args.manifest.is_file():
        raise SystemExit(f"Manifest not found: {args.manifest}")
    rows = load_manifest(args.manifest)
    grouped: dict[int, list[dict]] = {}
    for row in rows:
        grouped.setdefault(int(row["page"]), []).append(row)
    changed = []
    for page_number, page_rows in grouped.items():
        path = PAGE_DIR / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        page = json.loads(path.read_text(encoding="utf-8"))
        by_id = {block.get("id"): block for block in page.get("blocks", [])}
        for row in page_rows:
            block = by_id.get(row["blockId"])
            if not block:
                raise SystemExit(f"p.{page_number} missing block {row['blockId']}")
            block["_auditPage"] = page_number
            found = candidate(block)
            if not found:
                raise SystemExit(f"p.{page_number} {row['blockId']} no longer matches size-line candidate criteria")
            lines, heading_text = found
            body_lines = lines[1:]
            actual = {
                "firstLineId": str(lines[0][0].get("id", "")),
                "remainingLineIds": json.dumps([line.get("id", "") for line, _, _ in body_lines], ensure_ascii=False),
                "firstLineText": heading_text,
                "remainingLineTexts": json.dumps(["".join(span.get("text", "") for span in spans).strip() for _, spans, _ in body_lines], ensure_ascii=False),
                "firstLineSizePt": str(lines[0][2]),
                "remainingSizePt": str(body_lines[0][2]),
                "firstLineFonts": json.dumps(font_set(lines[:1]), ensure_ascii=False),
                "remainingFonts": json.dumps(font_set(body_lines), ensure_ascii=False),
            }
            for key, value in actual.items():
                expected = row[key]
                if key.endswith("SizePt"):
                    match = float(expected) == float(value)
                else:
                    match = expected == value
                if not match:
                    raise SystemExit(f"p.{page_number} {row['blockId']} signature mismatch in {key}: {expected!r} != {value!r}")
            units = make_units(block, lines)
            existing = block.get("typographicUnits")
            if existing is not None and existing != units:
                raise SystemExit(f"p.{page_number} {row['blockId']} has a conflicting existing typographicUnits definition")
            if existing is None:
                block["typographicUnits"] = units
                changed.append(block["id"])
            del block["_auditPage"]
        path.write_text(json.dumps(page, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Validated {len(rows)} manifest rows; added {len(changed)} block pairs across {len(grouped)} pages.")
    print("Source text, spans, bboxes, line IDs, and prior edit keys are preserved.")


if __name__ == "__main__":
    main()
