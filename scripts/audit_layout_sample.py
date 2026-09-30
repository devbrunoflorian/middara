"""Read-only layout audit for the representative Middara pages 2, 3, and 101.

This deliberately does not write production page JSON. Its output keeps each
editable unit separate from its source line geometry and styled text runs so
that segmentation can be reviewed before the production extractor changes.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from statistics import median
from typing import Any

import pymupdf


DEFAULT_PDF = Path(
    r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
)
DEFAULT_OUTPUT = Path("tmp/layout-sample")
BASELINE_TOLERANCE = 1.25
PAGE_REFERENCE_PATTERN = r"\d+(?:,\d+)*(?:-\d+(?:,\d+)*)*"


def union_bbox(boxes: list[list[float]]) -> list[float]:
    return [
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    ]


def normalize_run(span: dict[str, Any]) -> dict[str, Any]:
    color = span.get("color", 0)
    return {
        "text": span.get("text", ""),
        "bbox": list(span.get("bbox", (0, 0, 0, 0))),
        "origin": list(span.get("origin", (0, 0))),
        "font": span.get("font", ""),
        "size": span.get("size", 0),
        "color": f"#{color & 0xFFFFFF:06x}",
        "flags": span.get("flags", 0),
    }


def normalize_line(line: dict[str, Any], block_index: int, line_index: int) -> dict[str, Any]:
    runs = [normalize_run(span) for span in line.get("spans", [])]
    baselines = [run["origin"][1] for run in runs if run["text"].strip()]
    if not baselines:
        baselines = [run["origin"][1] for run in runs]
    baseline = median(baselines) if baselines else line["bbox"][3]
    return {
        "sourceBlockIndex": block_index,
        "sourceLineIndex": line_index,
        "bbox": list(line.get("bbox", (0, 0, 0, 0))),
        "baseline": baseline,
        "runs": runs,
    }


def line_text(line: dict[str, Any], *, omit_tabs: bool = False) -> str:
    value = "".join(run["text"] for run in line["runs"])
    return value.replace("\t", " ") if omit_tabs else value


def baseline_groups(lines: list[dict[str, Any]], tolerance: float = BASELINE_TOLERANCE) -> list[list[dict[str, Any]]]:
    groups: list[list[dict[str, Any]]] = []
    for line in sorted(lines, key=lambda item: (item["baseline"], item["bbox"][0])):
        if not groups or line["baseline"] - median(item["baseline"] for item in groups[-1]) > tolerance:
            groups.append([line])
        else:
            groups[-1].append(line)
    return groups


def page_blocks(page: pymupdf.Page) -> list[dict[str, Any]]:
    result = []
    for block_index, block in enumerate(page.get_text("dict").get("blocks", [])):
        if block.get("type") != 0:
            continue
        lines = [normalize_line(line, block_index, line_index) for line_index, line in enumerate(block.get("lines", []))]
        result.append({"sourceBlockIndex": block_index, "bbox": list(block["bbox"]), "lines": lines})
    return result


def make_unit(unit_id: str, kind: str, lines: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    ordered = sorted(lines, key=lambda line: (line["baseline"], line["bbox"][0]))
    return {
        "unitId": unit_id,
        "kind": kind,
        "sourceBlockIndices": sorted({line["sourceBlockIndex"] for line in ordered}),
        "sourceLines": ordered,
        "bbox": union_bbox([line["bbox"] for line in ordered]),
        "text": "".join(line_text(line) for line in ordered).strip(),
        **extra,
    }


def is_credit_heading(line: dict[str, Any]) -> bool:
    for run in line["runs"]:
        text = run["text"].strip()
        if text and "bold" in run["font"].lower() and text.endswith(":"):
            return True
    return False


def make_credit_unit(unit_id: str, region_id: str, lines: list[dict[str, Any]]) -> dict[str, Any]:
    unit = make_unit(unit_id, "credit-category", lines, regionId=region_id)
    label_style = next(
        (run for run in lines[0]["runs"] if "bold" in run["font"].lower() and run["text"].strip().endswith(":")),
        None,
    )
    heading = label_style["text"].strip() if label_style else ""
    unit["label"] = heading[:-1] if heading else ""
    remaining = []
    label_removed = False
    for line in lines:
        for run in line["runs"]:
            if not label_removed and label_style is not None and run is label_style:
                label_removed = True
                continue
            remaining.append(run["text"])
    unit["body"] = " ".join("".join(remaining).replace("\n", " ").split())
    unit["labelStyle"] = label_style
    return unit


def extract_page2_credits(blocks: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    candidates = [block for block in blocks if 520 <= block["bbox"][1] <= 790 and 250 <= block["bbox"][0] <= 750]
    candidates.sort(key=lambda block: block["bbox"][0])
    xs = sorted({round(block["bbox"][0], 1) for block in candidates})
    x_to_column = {x: f"credits-column-{index + 1}" for index, x in enumerate(xs)}
    regions: dict[str, Any] = {}
    units: list[dict[str, Any]] = []
    number = 0

    for block in candidates:
        x = round(block["bbox"][0], 1)
        region_id = x_to_column[x]
        region = regions.setdefault(region_id, {"regionId": region_id, "kind": "credit-column", "sourceBlockIndices": [], "sourceBboxes": []})
        region["sourceBlockIndices"].append(block["sourceBlockIndex"])
        region["sourceBboxes"].append(block["bbox"])

        current: list[dict[str, Any]] = []
        for line in block["lines"]:
            if is_credit_heading(line) and current:
                units.append(make_credit_unit(f"p2-credit-{number:02d}", region_id, current))
                number += 1
                current = []
            current.append(line)
        if current:
            units.append(make_credit_unit(f"p2-credit-{number:02d}", region_id, current))
            number += 1

    for region in regions.values():
        region["sourceBounds"] = union_bbox(region.pop("sourceBboxes"))
        region["layoutFrameStatus"] = "not-inferred-from-ink"
    return {"regions": list(regions.values()), "units": units}, units


def extract_page3_contents(blocks: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    label_lines: list[dict[str, Any]] = []
    page_ref_lines: list[dict[str, Any]] = []
    for block in blocks:
        for line in block["lines"]:
            x0, y0, x1, _ = line["bbox"]
            if not 110 <= y0 <= 760:
                continue
            text = line_text(line).strip()
            if not text:
                continue
            if x0 >= 600 and re.fullmatch(r"\d+(?:,\d+)*", text):
                page_ref_lines.append(line)
            elif 140 <= x0 <= 400 and x1 <= 550:
                label_lines.append(line)

    units = []
    matched_ref_ids: set[tuple[int, int]] = set()
    for index, label in enumerate(sorted(label_lines, key=lambda line: line["baseline"])):
        nearest = min(page_ref_lines, key=lambda line: abs(line["baseline"] - label["baseline"]), default=None)
        ref_delta = abs(nearest["baseline"] - label["baseline"]) if nearest else None
        refs = []
        if nearest and ref_delta is not None and ref_delta <= 1.5:
            refs = [nearest]
            matched_ref_ids.add((nearest["sourceBlockIndex"], nearest["sourceLineIndex"]))
        unit = make_unit(f"p3-toc-{index:02d}", "contents-entry", [label])
        unit["pageReference"] = "".join(run["text"] for line in refs for run in line["runs"]).strip()
        unit["pageReferenceLineage"] = [
            {"sourceBlockIndex": line["sourceBlockIndex"], "sourceLineIndex": line["sourceLineIndex"], "bbox": line["bbox"]}
            for line in refs
        ]
        unit["referenceBaselineDelta"] = ref_delta if refs else None
        units.append(unit)

    unmatched = [
        {"sourceBlockIndex": line["sourceBlockIndex"], "sourceLineIndex": line["sourceLineIndex"], "text": line_text(line).strip(), "baseline": line["baseline"]}
        for line in page_ref_lines
        if (line["sourceBlockIndex"], line["sourceLineIndex"]) not in matched_ref_ids
    ]
    all_boxes = [unit["bbox"] for unit in units]
    all_boxes.extend(line["bbox"] for line in page_ref_lines)
    region_bbox = union_bbox(all_boxes) if all_boxes else [0, 0, 0, 0]
    region = {
        "regionId": "contents-body",
        "kind": "table-of-contents",
        "sourceBounds": region_bbox,
        "layoutFrameStatus": "not-inferred-from-ink",
        "units": units,
        "unmatchedPageReferences": unmatched,
    }
    return region, units


def split_index_page_ref(group: list[dict[str, Any]], region_right: float) -> tuple[str, str | None, dict[str, Any] | None, str | None]:
    ordered = sorted(group, key=lambda line: line["bbox"][0])
    text_parts: list[str] = []
    page_ref: str | None = None
    ref_run: dict[str, Any] | None = None
    right_edge_text: str | None = None
    for line in ordered:
        for run in sorted(line["runs"], key=lambda item: item["bbox"][0]):
            raw = run["text"]
            compact = raw.replace("\t", " ").strip()
            match = re.fullmatch(rf"\s*({PAGE_REFERENCE_PATTERN})\s*", raw)
            if match and run["bbox"][2] >= (region_right - 8):
                page_ref = match.group(1)
                ref_run = run
                continue
            # Some right-aligned page refs share a span with tab padding.
            trailing = re.search(rf"\s+({PAGE_REFERENCE_PATTERN})\s*$", raw)
            if trailing and run["bbox"][2] >= (region_right - 8):
                page_ref = trailing.group(1)
                ref_run = run
                label_part = raw[: trailing.start()].replace("\t", " ").strip()
                if label_part:
                    text_parts.append(label_part)
                continue
            if run["bbox"][2] >= (region_right - 8) and compact:
                right_edge_text = compact
                continue
            if compact:
                text_parts.append(compact)
    return " ".join(text_parts).strip(), page_ref, ref_run, right_edge_text


def extract_page101_index(blocks: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    columns = [block for block in blocks if block["bbox"][1] >= 110 and block["bbox"][1] < 770 and len(block["lines"]) > 100]
    columns.sort(key=lambda block: block["bbox"][0])
    regions, units = [], []
    for column_number, block in enumerate(columns, 1):
        region_id = f"index-column-{column_number}"
        region_bbox = block["bbox"]
        groups = baseline_groups(block["lines"])
        regions.append({
            "regionId": region_id,
            "kind": "index-column",
            "sourceBlockIndices": [block["sourceBlockIndex"]],
            "sourceBounds": region_bbox,
            "layoutFrameStatus": "not-inferred-from-ink",
            "baselineGroupCount": len(groups),
        })
        for row_number, group in enumerate(groups, 1):
            label, page_ref, page_ref_run, right_edge_text = split_index_page_ref(group, region_bbox[2])
            unit = make_unit(
                f"p101-c{column_number}-r{row_number:03d}",
                "index-entry",
                group,
                regionId=region_id,
                baseline=median(line["baseline"] for line in group),
                label=label,
                pageReference=page_ref,
                pageReferenceRun=page_ref_run,
                unparsedRightEdgeText=right_edge_text,
                indentation=max(0, min(line["bbox"][0] for line in group) - region_bbox[0]),
            )
            unit["manualReview"] = bool(right_edge_text and not page_ref)
            unit["manualReviewReason"] = "unexpected nonnumeric text at the page-reference edge" if unit["manualReview"] else None
            units.append(unit)
    return {"regions": regions, "units": units}, units


def build_report(sample: dict[str, Any]) -> str:
    p2 = sample["pages"]["2"]["credits"]
    p3 = sample["pages"]["3"]["contents"]
    p101 = sample["pages"]["101"]["index"]
    page2_units = p2["units"]
    p3_units = p3["units"]
    p101_regions = p101["regions"]
    p101_units = p101["units"]
    ref_deltas = [unit["referenceBaselineDelta"] for unit in p3_units if unit["pageReference"]]
    unresolved_index_units = [unit for unit in p101_units if not unit["pageReference"]]
    manual_review_units = [unit for unit in unresolved_index_units if unit["manualReview"]]
    credit_styles = Counter(
        (run["font"], run["size"], run["color"])
        for unit in page2_units
        for line in unit["sourceLines"]
        for run in line["runs"]
        if run["text"].strip()
    )
    lines = [
        "# Sample Layout Extraction Audit",
        "",
        "Read-only sample analysis against the source PDF. No production page JSON, translation key, or database record was written.",
        "",
        "## Page 2: credit categories",
        "",
        f"- Visual regions/columns: {len(p2['regions'])}.",
        f"- Candidate editable categories split at bold labels ending in a colon: {len(page2_units)}.",
        f"- Categories with source lines and original styled runs preserved: {sum(bool(unit['sourceLines']) for unit in page2_units)}/{len(page2_units)}.",
        f"- Categories with a bold-label/regular-body split in the sample model: {sum(bool(unit.get('label') and unit.get('labelStyle')) for unit in page2_units)}/{len(page2_units)}.",
        "- Source style/color evidence: " + "; ".join(f"{font} {size:g} pt {color} × {count}" for (font, size, color), count in credit_styles.most_common()) + ".",
        "- The boundary is a semantic style cue (bold `Label:`), not vertical proximity; original line/span geometry remains attached as lineage.",
        "",
        "## Page 3: contents rows",
        "",
        f"- Candidate entry labels: {len(p3_units)}.",
        f"- Page references paired by baseline within 1.5 pt: {sum(bool(unit['pageReference']) for unit in p3_units)}.",
        f"- Numeric page-reference lines left unmatched: {len(p3['unmatchedPageReferences'])}.",
        f"- Matched baseline delta range: {min(ref_deltas, default=0):.2f}..{max(ref_deltas, default=0):.2f} pt.",
        "- The dotted leaders are not treated as editable text; they remain part of the original page artwork. Page references retain separate source line/span lineage.",
        "",
        "### First matched entries",
        "",
        "| Entry | Page | Baseline delta (pt) |",
        "|---|---:|---:|",
    ]
    for unit in p3_units:
        if unit["pageReference"]:
            entry_label = unit["text"].replace("|", "\\|")
            lines.append(f"| {entry_label} | {unit['pageReference']} | {unit['referenceBaselineDelta']:.2f} |")
        if sum(1 for line in lines if line.startswith("| ")) >= 5:
            break
    lines.extend([
        "",
        "## Page 101: index entries",
        "",
        f"- Visual columns identified from independent source blocks: {len(p101_regions)}.",
        f"- Candidate editable rows grouped by baseline (tolerance {BASELINE_TOLERANCE:.2f} pt): {len(p101_units)}.",
        "- Per-column row counts: " + ", ".join(str(region["baselineGroupCount"]) for region in p101_regions) + ".",
        f"- Numeric page references parsed from the right side, including comma lists/ranges: {sum(bool(unit['pageReference']) for unit in p101_units)}.",
        f"- Rows without numeric refs: {len(unresolved_index_units)}; right-edge anomalies requiring human review: {len(manual_review_units)}.",
        "- Each row retains all same-baseline fragments and their original styled runs, including the tab/leader geometry. A numeric right-side run is exposed as a page reference when detected; the raw run remains in lineage.",
        "",
        "### First rows per column",
        "",
    ])
    for region in p101_regions:
        example = next((unit for unit in p101_units if unit["regionId"] == region["regionId"]), None)
        if example:
            lines.append(f"- `{region['regionId']}`: **{example['label']}** -> `{example['pageReference'] or 'unparsed'}`; {len(example['sourceLines'])} source fragments at baseline {example['baseline']:.2f} pt.")
    if manual_review_units:
        lines.extend(["", "### Manual-review rows", ""])
        for unit in manual_review_units:
            lines.append(f"- `{unit['unitId']}`: `{unit['label']}`; unparsed right-edge text: `{unit['unparsedRightEdgeText']}`.")
    lines.extend([
        "",
        "## What this proves, and what it does not",
        "",
        "- It proves that line/baseline grouping can recover separate contents rows and separate index rows from PyMuPDF's large raw blocks while retaining exact source lineage.",
        "- The reported region bounds are observed ink/text extents only; the audit does not promote them to translation frames. Frame geometry needs separate visual/design evidence.",
        "- It demonstrates a reproducible credit-category boundary, but the 3-column credit region and all split units still need comparison in the app before adopting the serialized model.",
        "- It does not write final page JSON, migrate legacy translation keys, or claim that every numeric index run has been parsed correctly.",
        "- The sample output is evidence for the schema proposal: region geometry, semantic editable unit, original line boxes, style runs, and source lineage remain distinct fields.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, help="Optional tracked Markdown report destination; JSON remains in --output-dir.")
    args = parser.parse_args()
    if not args.pdf.exists():
        raise SystemExit(f"PDF not found: {args.pdf}")

    document = pymupdf.open(args.pdf)
    sample = {"sourcePdf": str(args.pdf), "baselineTolerancePt": BASELINE_TOLERANCE, "pages": {}}
    for page_number in (2, 3, 101):
        blocks = page_blocks(document[page_number - 1])
        page_result: dict[str, Any] = {"pageNumber": page_number}
        if page_number == 2:
            page_result["credits"], _ = extract_page2_credits(blocks)
        elif page_number == 3:
            page_result["contents"], _ = extract_page3_contents(blocks)
        else:
            page_result["index"], _ = extract_page101_index(blocks)
        sample["pages"][str(page_number)] = page_result
    document.close()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / "sample-layout-audit.json"
    report_path = args.output_dir / "sample-layout-audit.md"
    json_path.write_text(json.dumps(sample, ensure_ascii=False, indent=2), encoding="utf-8")
    report = build_report(sample)
    report_path.write_text(report, encoding="utf-8")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(report, encoding="utf-8")
    print(f"Wrote read-only sample audit JSON to {json_path}")
    print(f"Wrote Markdown audit report to {args.report or report_path}")
    print(report)


if __name__ == "__main__":
    main()
