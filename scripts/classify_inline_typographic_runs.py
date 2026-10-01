"""Inventory mixed-size PDF runs on the same source line; this does not edit pages."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"


def has_pua(text: str) -> bool:
    return any(
        0xE000 <= ord(char) <= 0xF8FF
        or 0xF0000 <= ord(char) <= 0xFFFFD
        or 0x100000 <= ord(char) <= 0x10FFFD
        for char in text
    )


def family_name(font: str) -> str:
    return re.sub(r"[-_ ]?(regular|bold|italic|oblique|medium|demi|black|heavy|extrablack).*?$", "", font, flags=re.I)


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-dir", type=Path, default=PAGE_DIR)
    parser.add_argument("--out-dir", type=Path, default=ROOT / "tmp/typography-audit/inline-runs")
    parser.add_argument("--pages", type=int, nargs="+", help="Page numbers; default scans all 102 pages")
    args = parser.parse_args()

    rows: list[dict] = []
    groups: dict[str, list[dict]] = defaultdict(list)
    for page_number in args.pages or range(1, 103):
        path = args.json_dir / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        if not path.is_file():
            continue
        page = json.loads(path.read_text(encoding="utf-8"))
        width = float(page.get("pageSize", [0, 0])[0] or 0)
        for block_index, block in enumerate(page.get("blocks", [])):
            block_ghost = bool(block.get("suspectedGhost", False))
            for line_index, line in enumerate(block.get("lines", [])):
                spans = [span for span in line.get("spans", []) if span.get("text", "")]
                sizes = {round(float(span.get("size", 0)), 2) for span in spans}
                if len(sizes) < 2:
                    continue
                normalized = []
                boxes = []
                for span in spans:
                    bbox = span.get("bbox", line.get("bbox", []))
                    box = [float(value) for value in bbox] if len(bbox) == 4 else [0.0] * 4
                    boxes.append(box)
                    font = str(span.get("font", ""))
                    flags = int(span.get("flags", 0))
                    normalized.append({
                        "family": family_name(font),
                        "size": round(float(span.get("size", 0)), 2),
                        "bold": bool(flags & 16) or bool(re.search(r"bold|black|heavy|extrablack", font, re.I)),
                        "italic": bool(flags & 2) or bool(re.search(r"italic|oblique", font, re.I)),
                        "text": str(span.get("text", "")),
                    })
                signature = " | ".join(
                    f"{run['family']}:{run['size']:g}:b{int(run['bold'])}:i{int(run['italic'])}"
                    for run in normalized
                )
                line_box = line.get("bbox", [0, 0, 0, 0])
                y_top = float(line_box[1]) if len(line_box) == 4 else 0.0
                y_bottom = float(line_box[3]) if len(line_box) == 4 else 0.0
                baseline_spread = round(max(box[3] for box in boxes) - min(box[3] for box in boxes), 3) if boxes else 0.0
                gaps = [round(boxes[index + 1][0] - boxes[index][2], 3) for index in range(len(boxes) - 1)]
                text = "".join(run["text"] for run in normalized)
                record = {
                    "page": page_number,
                    "blockIndex": block_index,
                    "blockId": block.get("id", ""),
                    "lineIndex": line_index,
                    "lineId": line.get("id", ""),
                    "signature": signature,
                    "runCount": len(spans),
                    "distinctSizes": ",".join(f"{size:g}" for size in sorted(sizes)),
                    "text": " ".join(text.split())[:600],
                    "bbox": ",".join(f"{float(value):.2f}" for value in line_box) if len(line_box) == 4 else "",
                    "columnCenterPct": round(((float(line_box[0]) + float(line_box[2])) / 2 / width) * 100, 2) if width and len(line_box) == 4 else "",
                    "baselineSpreadPt": baseline_spread,
                    "spanGapsPt": ",".join(f"{gap:g}" for gap in gaps),
                    "spanBboxes": json.dumps([[round(value, 3) for value in box] for box in boxes], separators=(",", ":")),
                    "suspectedGhost": bool(line.get("suspectedGhost", block_ghost)),
                    "rasterizedDuplicate": bool(line.get("rasterizedDuplicate", False)),
                    "hasPUA": has_pua(text),
                }
                rows.append(record)
                groups[signature].append(record)

    pattern_rows = []
    for signature, records in sorted(groups.items(), key=lambda item: (-len(item[1]), item[0])):
        pattern_rows.append({
            "count": len(records),
            "pages": len({record["page"] for record in records}),
            "ghosts": sum(record["suspectedGhost"] for record in records),
            "rasterDuplicates": sum(record["rasterizedDuplicate"] for record in records),
            "puaLines": sum(record["hasPUA"] for record in records),
            "maxBaselineSpreadPt": max(float(record["baselineSpreadPt"]) for record in records),
            "signature": signature,
            "examples": " || ".join(record["text"][:90] for record in records[:4]),
        })
    rows.sort(key=lambda row: (row["page"], row["blockIndex"], row["lineIndex"]))
    write_csv(args.out_dir / "mixed-size-lines.csv", rows, list(rows[0].keys()) if rows else ["page"])
    write_csv(args.out_dir / "pattern-groups.csv", pattern_rows, list(pattern_rows[0].keys()) if pattern_rows else ["signature"])
    summary = {
        "pagesScanned": len({row["page"] for row in rows}),
        "mixedSizeLines": len(rows),
        "mixedSizeLinesMin6pt": sum(min(float(value) for value in row["distinctSizes"].split(",")) >= 6 for row in rows),
        "mixedSizeLinesWithAnyRunBelow6pt": sum(min(float(value) for value in row["distinctSizes"].split(",")) < 6 for row in rows),
        "pagesWithMixedSizeLines": len({row["page"] for row in rows}),
        "signatureGroups": len(pattern_rows),
        "patterns": pattern_rows,
        "outputs": ["mixed-size-lines.csv", "pattern-groups.csv"],
        "note": "Read-only structural grouping. Identical signatures do not prove identical semantic roles or permit an automatic split.",
    }
    (args.out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Mixed-size lines: {len(rows)} across {summary['pagesWithMixedSizeLines']} pages")
    print(f"All runs >=6 pt: {summary['mixedSizeLinesMin6pt']}; at least one run <6 pt: {summary['mixedSizeLinesWithAnyRunBelow6pt']}")
    print(f"Structural signatures: {len(pattern_rows)}")
    for row in pattern_rows[:12]:
        print(f"{row['count']:4} lines / {row['pages']:2} pages / ghost={row['ghosts']:3} / PUA={row['puaLines']:3} :: {row['signature']}")
    print(f"Outputs: {args.out_dir.resolve()}")


if __name__ == "__main__":
    main()
