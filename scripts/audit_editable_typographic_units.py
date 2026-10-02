"""Create read-only candidates for typographic edit units and legacy-key impact.

Different point sizes are hard boundaries. Equal sizes alone never merge text;
line continuity and bbox geometry are also required. Output is an audit report,
not production page data and not an instruction to migrate a legacy key.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"
PDF_PATH = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")


def union_bbox(boxes: list[list[float]]) -> list[float]:
    return [
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    ]


def bbox_overlap_ratio(a: list[float], b: list[float]) -> float:
    overlap = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    denominator = max(0.01, min(a[2] - a[0], b[2] - b[0]))
    return overlap / denominator


def span_key(span: dict) -> tuple:
    bbox = tuple(round(float(value), 2) for value in span.get("bbox", []))
    return (
        span.get("text", ""),
        span.get("font", ""),
        round(float(span.get("size", 0.0)), 2),
        bbox,
    )


def load_pdf_baselines(pdf_path: Path, pages: list[int], include_images: bool = False) -> tuple[dict, int]:
    """Match JSON spans to source PDF span origins without writing source data."""
    if not pdf_path.is_file():
        return {}, 0
    baselines = {}
    with pymupdf.open(pdf_path) as document:
        page_count = document.page_count
        for page_number in pages:
            if page_number < 1 or page_number > page_count:
                raise ValueError(f"Page {page_number} is outside the PDF ({page_count} pages)")
            page = document[page_number - 1]
            if include_images:
                source_blocks = page.get_text("dict").get("blocks", [])
            else:
                text_flags = pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES
                source_blocks = page.get_text("dict", flags=text_flags).get("blocks", [])
            for block in source_blocks:
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        origin = span.get("origin")
                        if origin and len(origin) > 1:
                            baselines[span_key(span)] = float(origin[1])
    return baselines, page_count


def line_fragments(block: dict, block_index: int, baselines: dict) -> list[dict]:
    fragments = []
    for line_index, line in enumerate(block.get("lines", [])):
        current = None
        for span_index, span in enumerate(line.get("spans", [])):
            text = span.get("text", "")
            if not text.strip():
                continue
            size = round(float(span.get("size", 0.0)), 2)
            if current is None or current["size"] != size:
                if current is not None:
                    fragments.append(current)
                current = {
                    "block_index": block_index,
                    "block_id": block.get("id", f"block_{block_index}"),
                    "line_index": line_index,
                    "line_id": line.get("id", f"line_{line_index}"),
                    "first_span_index": span_index,
                    "size": size,
                    "spans": [],
                    "line_bbox": line.get("bbox", block.get("bbox", [])),
                    "ghost_flag": bool(line.get("suspectedGhost", block.get("suspectedGhost", False))),
                    "rasterized_duplicate": bool(line.get("rasterizedDuplicate", False)),
                }
            current["spans"].append(span)
        if current is not None:
            fragments.append(current)

    for fragment in fragments:
        boxes = [span.get("bbox") for span in fragment["spans"] if span.get("bbox")]
        fragment["bbox"] = union_bbox(boxes) if boxes else list(fragment["line_bbox"])
        fragment["text"] = "".join(span.get("text", "") for span in fragment["spans"])
        fragment["font_families"] = sorted({span.get("font", "") for span in fragment["spans"]})
        fragment["flags"] = sorted({int(span.get("flags", 0)) for span in fragment["spans"]})
        matched = [baselines[span_key(span)] for span in fragment["spans"] if span_key(span) in baselines]
        fragment["baseline_y"] = sum(matched) / len(matched) if matched else None
    return fragments


def may_join(group: dict, fragment: dict) -> bool:
    last = group["fragments"][-1]
    if fragment["line_index"] <= last["line_index"]:
        return False
    if fragment["size"] != group["size"]:
        return False

    a, b = last["bbox"], fragment["bbox"]
    base_a = last["baseline_y"]
    base_b = fragment["baseline_y"]
    center_a = (a[1] + a[3]) / 2
    center_b = (b[1] + b[3]) / 2
    center_delta = (base_b - base_a) if base_a is not None and base_b is not None else center_b - center_a
    # 1.30 em admits ordinary paragraph leading but tends to reject paragraph gaps.
    # The resulting groups remain candidates and must be visually reviewed.
    if center_delta < 0 or center_delta > max(2.0, group["size"] * 1.30):
        return False

    left_delta = abs(a[0] - b[0])
    overlap = bbox_overlap_ratio(a, b)
    return overlap >= 0.2 or left_delta <= max(2.0, group["size"] * 1.5)


def candidate_groups(block: dict, block_index: int, baselines: dict) -> list[dict]:
    fragments = line_fragments(block, block_index, baselines)
    groups: list[dict] = []
    block_text = "".join(fragment["text"] for fragment in fragments).strip()
    numeric_reference_block = bool(block_text) and not re.search(r"[A-Za-z]", block_text)
    uppercase_heading_block = bool(block_text) and block_text.upper() == block_text and bool(re.search(r"[A-Za-z]", block_text))
    source_lines = [
        "".join(span.get("text", "") for span in line.get("spans", [])).strip()
        for line in block.get("lines", [])
    ]
    reference_rows = sum(
        bool(re.search(r"[A-Za-z].*\s\d{1,3}(?:\s*[,/-]\s*\d{1,3})*\s*$", line))
        for line in source_lines
    )
    index_row_block = len(source_lines) >= 20 and reference_rows / max(1, len(source_lines)) >= 0.65
    all_spans = [span for line in block.get("lines", []) for span in line.get("spans", []) if span.get("text", "")]
    tab_only_spans = sum(1 for span in all_spans if "\t" in span.get("text", "") and not span.get("text", "").strip())
    numeric_reference_lines = sum(
        bool(re.fullmatch(r"\d{1,3}(?:\s*[,/-]\s*\d{1,3})*", line))
        for line in source_lines
    )
    tabbed_row_block = (
        len(source_lines) >= 20
        and tab_only_spans / max(1, len(all_spans)) >= 0.15
        and numeric_reference_lines >= 20
    )

    for fragment in fragments:
        # A tabbed InDesign index stores the label and page reference as
        # separate line objects at the same baseline, with empty tab spans
        # between them. Reconstruct one entry per baseline inside this source
        # block/column, while keeping font-size runs distinct.
        if tabbed_row_block:
            same_row = next((
                group for group in groups
                if group["size"] == fragment["size"]
                and group["fragments"][0]["baseline_y"] is not None
                and fragment["baseline_y"] is not None
                and abs(group["baseline_y"] - fragment["baseline_y"]) <= 0.75
            ), None)
            if same_row is None:
                groups.append({"size": fragment["size"], "fragments": [fragment], "baseline_y": fragment["baseline_y"]})
            else:
                same_row["fragments"].append(fragment)
                baselines_in_row = [item["baseline_y"] for item in same_row["fragments"] if item["baseline_y"] is not None]
                same_row["baseline_y"] = sum(baselines_in_row) / len(baselines_in_row)
            continue

        # Lists of page references and headings are row-like, not prose. Keep
        # each line separately; later baseline analysis can pair references
        # with the matching label without merging the whole column.
        if numeric_reference_block or uppercase_heading_block or index_row_block:
            groups.append({"size": fragment["size"], "fragments": [fragment]})
            continue
        eligible = [group for group in groups if may_join(group, fragment)]
        if eligible:
            group = min(
                eligible,
                key=lambda item: (
                    abs(fragment["bbox"][1] - item["fragments"][-1]["bbox"][1]),
                    abs(fragment["bbox"][0] - item["fragments"][-1]["bbox"][0]),
                ),
            )
            group["fragments"].append(fragment)
        else:
            groups.append({"size": fragment["size"], "fragments": [fragment]})

    for group_index, group in enumerate(groups):
        group["unit_index"] = group_index
        group["bbox"] = union_bbox([fragment["bbox"] for fragment in group["fragments"]])
        group["text"] = "".join(fragment["text"] for fragment in group["fragments"])
        group["font_families"] = sorted({font for fragment in group["fragments"] for font in fragment["font_families"]})
        group["bold_flag_spans"] = sum(
            1 for fragment in group["fragments"] for span in fragment["spans"] if int(span.get("flags", 0)) & 16
        )
        group["italic_flag_spans"] = sum(
            1 for fragment in group["fragments"] for span in fragment["spans"] if int(span.get("flags", 0)) & 2
        )
        group["rasterized_duplicate_lines"] = sum(fragment["rasterized_duplicate"] for fragment in group["fragments"])
        group["suspected_ghost_lines"] = sum(fragment["ghost_flag"] for fragment in group["fragments"])
        group["line_ids"] = sorted({fragment["line_id"] for fragment in group["fragments"]})
        baselines_in_group = [fragment["baseline_y"] for fragment in group["fragments"] if fragment["baseline_y"] is not None]
        group["baseline_y"] = sum(baselines_in_group) / len(baselines_in_group) if baselines_in_group else None
        group["span_refs"] = [
            f"{fragment['line_id']}:{index}"
            for fragment in group["fragments"]
            for index, _span in enumerate(fragment["spans"])
        ]
    return groups


def column_gutter_candidates(page: dict, page_number: int) -> list[dict]:
    """Infer possible x₀ gutters from recurring block start/end bbox bands."""
    columns = []
    for block_index, block in enumerate(page.get("blocks", [])):
        bbox = block.get("bbox")
        text = " ".join(
            "".join(span.get("text", "") for span in line.get("spans", []))
            for line in block.get("lines", [])
        ).split()
        text = " ".join(text)
        sizes = [
            float(span.get("size", 0))
            for line in block.get("lines", [])
            for span in line.get("spans", [])
            if span.get("text", "").strip()
        ]
        if (
            not bbox
            or len(text) < 20
            or block.get("suspectedGhost", False)
            or not sizes
            or min(sizes) < 5.0
        ):
            continue
        width = bbox[2] - bbox[0]
        if width <= 0 or width > page["width"] * 0.72:
            continue
        columns.append({
            "x0": float(bbox[0]),
            "bbox": bbox,
            "lineBoxes": [line.get("bbox", bbox) for line in block.get("lines", [])],
            "text": text[:120],
            "ref": block.get("id", f"block_{block_index}"),
        })

    columns.sort(key=lambda item: item["x0"])
    clusters = []
    x_tolerance = max(15.0, page["width"] * 0.025)
    for column in columns:
        if not clusters or column["x0"] - clusters[-1]["center"] > x_tolerance:
            clusters.append({"center": column["x0"], "blocks": [column]})
        else:
            cluster = clusters[-1]
            cluster["blocks"].append(column)
            cluster["center"] = sum(item["x0"] for item in cluster["blocks"]) / len(cluster["blocks"])

    def percentile(values: list[float], fraction: float) -> float:
        ordered = sorted(values)
        return ordered[round((len(ordered) - 1) * fraction)]

    results = []
    min_gutter = max(8.0, page["width"] * 0.012)
    for index, (left, right) in enumerate(zip(clusters, clusters[1:])):
        left_blocks, right_blocks = left["blocks"], right["blocks"]
        left_lines = [line for item in left_blocks for line in item["lineBoxes"]]
        right_lines = [line for item in right_blocks for line in item["lineBoxes"]]
        left_edge = percentile([box[2] for box in left_lines], 0.9)
        right_edge = percentile([box[0] for box in right_lines], 0.1)
        gap = right_edge - left_edge
        left_top = min(item["bbox"][1] for item in left_blocks)
        left_bottom = max(item["bbox"][3] for item in left_blocks)
        right_top = min(item["bbox"][1] for item in right_blocks)
        right_bottom = max(item["bbox"][3] for item in right_blocks)
        vertical_overlap = max(0.0, min(left_bottom, right_bottom) - max(left_top, right_top))
        shorter_column = max(0.01, min(left_bottom - left_top, right_bottom - right_top))
        if gap < min_gutter or vertical_overlap / shorter_column < 0.35:
            continue
        results.append({
            "page": page_number,
            "candidateId": f"p{page_number:03d}_g{index:02d}",
            "candidateX0": f"{(left_edge + right_edge) / 2:.2f}",
            "leftTextEdgeP90": f"{left_edge:.2f}",
            "rightTextStartP10": f"{right_edge:.2f}",
            "leftSupportingBlocks": len(left_blocks),
            "rightSupportingBlocks": len(right_blocks),
            "examples": f"{left_blocks[0]['text']} || {right_blocks[0]['text']}",
            "blockRefs": f"{'|'.join(item['ref'] for item in left_blocks[:5])} || {'|'.join(item['ref'] for item in right_blocks[:5])}",
            "review": "candidate gutter only; confirm column family against PDF before using",
        })
    return results


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-dir", type=Path, default=PAGE_DIR)
    parser.add_argument("--out-dir", type=Path, default=ROOT / "tmp/editable-unit-audit")
    parser.add_argument("--pdf", type=Path, default=PDF_PATH)
    parser.add_argument("--pages", type=int, nargs="+", help="Page numbers to scan; default scans all 102 JSON files")
    args = parser.parse_args()
    pages = args.pages or list(range(1, 103))
    pdf_baselines, pdf_page_count = load_pdf_baselines(args.pdf, pages)

    units_out, key_impact, page_summary, gutters_out, unmatched_spans, baseline_rows_out = [], [], [], [], [], []
    baseline_fallback_pages = set()
    total_blocks = total_fragments = total_units = total_split_blocks = 0
    total_mixed_size_blocks = 0
    total_json_spans = total_matched_spans = 0
    for page_number in pages:
        path = args.json_dir / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        if not path.is_file():
            raise FileNotFoundError(f"Missing page JSON: {path}")
        page = json.loads(path.read_text(encoding="utf-8"))
        gutters_out.extend(column_gutter_candidates(page, page_number))
        page_spans = [
            span
            for block in page.get("blocks", [])
            for line in block.get("lines", [])
            for span in line.get("spans", [])
            if span.get("text", "")
        ]
        page_unmatched = [span for span in page_spans if span_key(span) not in pdf_baselines]
        if page_unmatched:
            # Excluding image payloads is fast, but in some composited pages it
            # can omit text spans over image placements. Recheck only those pages
            # with PyMuPDF's full dictionary before classifying source mismatches.
            page_baselines, _ = load_pdf_baselines(args.pdf, [page_number], include_images=True)
            pdf_baselines.update(page_baselines)
            baseline_fallback_pages.add(page_number)
        total_json_spans += len(page_spans)
        total_matched_spans += sum(1 for span in page_spans if span_key(span) in pdf_baselines)
        for block_index, block in enumerate(page.get("blocks", [])):
            for line_index, line in enumerate(block.get("lines", [])):
                for span_index, span in enumerate(line.get("spans", [])):
                    if span.get("text", "") and span_key(span) not in pdf_baselines:
                        unmatched_spans.append({
                            "page": page_number,
                            "blockIndex": block_index,
                            "blockId": block.get("id", ""),
                            "lineIndex": line_index,
                            "lineId": line.get("id", ""),
                            "spanIndex": span_index,
                            "text": span.get("text", ""),
                            "font": span.get("font", ""),
                            "sizePt": span.get("size", ""),
                            "bbox": ",".join(f"{value:.2f}" for value in span.get("bbox", [])),
                        })
        page_blocks = page_fragments = page_units = page_split = 0
        page_unit_rows = []

        for block_index, block in enumerate(page.get("blocks", [])):
            groups = candidate_groups(block, block_index, pdf_baselines)
            original_key = f"page_{page_number}_block_{block_index}"
            distinct_font_sizes = {
                round(float(span.get("size", 0.0)), 2)
                for line in block.get("lines", [])
                for span in line.get("spans", [])
                if span.get("text", "")
            }
            mandatory_size_boundary = len(distinct_font_sizes) > 1
            total_mixed_size_blocks += mandatory_size_boundary
            structural_units = block.get("creditUnits") or ([block["creditUnit"]] if block.get("creditUnit") else [])
            if structural_units:
                key_impact.append({
                    "page": page_number,
                    "blockIndex": block_index,
                    "sourceId": block.get("id", ""),
                    "legacyKey": original_key,
                    "candidateUnitCount": len(structural_units),
                    "status": "existing_semantic_sidecar",
                    "note": "existing credit-unit definitions remain authoritative; candidate span grouping is diagnostic only",
                })
                continue

            page_blocks += 1
            total_blocks += 1
            page_fragments += sum(len(group["fragments"]) for group in groups)
            total_fragments += sum(len(group["fragments"]) for group in groups)
            page_units += len(groups)
            total_units += len(groups)
            split = len(groups) > 1
            if split:
                page_split += 1
                total_split_blocks += 1

            for group in groups:
                box = group["bbox"]
                line_ids = group["line_ids"]
                units_out.append({
                    "page": page_number,
                    "blockIndex": block_index,
                    "sourceId": block.get("id", ""),
                    "legacyKey": original_key,
                    "candidateUnit": f"p{page_number:03d}_b{block_index:03d}_u{group['unit_index']:02d}",
                    "legacyKeyImpact": "split_requires_compatibility" if split else "one_candidate_unit",
                    "hardFontSizeBoundaryInSource": mandatory_size_boundary,
                    "distinctSourceFontSizesPt": "|".join(f"{value:.2f}" for value in sorted(distinct_font_sizes)),
                    "fontSizePt": f"{group['size']:.2f}",
                    "fontFamilies": "|".join(group["font_families"]),
                    "lineIds": "|".join(line_ids),
                    "spanRefs": "|".join(group["span_refs"]),
                    "bbox": ",".join(f"{value:.2f}" for value in box),
                    "baselineY": f"{group['baseline_y']:.2f}" if group["baseline_y"] is not None else "",
                    "boldFlagSpans": group["bold_flag_spans"],
                    "italicFlagSpans": group["italic_flag_spans"],
                    "suspectedGhostLines": group["suspected_ghost_lines"],
                    "rasterizedDuplicateLines": group["rasterized_duplicate_lines"],
                    "text": " ".join(group["text"].split())[:500],
                    "review": "candidate only; same size is not proof of semantic grouping",
                })
                if len(group["fragments"]) == 1 and group["baseline_y"] is not None:
                    page_unit_rows.append({
                        "candidateUnit": units_out[-1]["candidateUnit"],
                        "baselineY": group["baseline_y"],
                        "bbox": box,
                        "text": " ".join(group["text"].split())[:120],
                    })

            key_impact.append({
                "page": page_number,
                "blockIndex": block_index,
                "sourceId": block.get("id", ""),
                "legacyKey": original_key,
                "candidateUnitCount": len(groups),
                "hardFontSizeBoundaryInSource": mandatory_size_boundary,
                "status": "split_requires_compatibility" if split else "one_candidate_unit",
                "note": "no production keys changed; any split requires migration/fallback design",
            })

        page_summary.append({
            "page": page_number,
            "blocks": page_blocks,
            "lineFragments": page_fragments,
            "candidateUnits": page_units,
            "blocksRequiringKeyReview": page_split,
            "mixedFontSizeSourceBlocks": sum(
                1 for block in page.get("blocks", [])
                if len({round(float(span.get("size", 0.0)), 2) for line in block.get("lines", []) for span in line.get("spans", []) if span.get("text", "")}) > 1
            ),
        })

        aligned_rows = []
        for unit in sorted(page_unit_rows, key=lambda item: item["baselineY"]):
            if not aligned_rows or abs(unit["baselineY"] - aligned_rows[-1]["baselineY"]) > 0.75:
                aligned_rows.append({"baselineY": unit["baselineY"], "units": [unit]})
            else:
                row = aligned_rows[-1]
                row["units"].append(unit)
                row["baselineY"] = sum(item["baselineY"] for item in row["units"]) / len(row["units"])
        for row_index, row in enumerate(aligned_rows):
            if len(row["units"]) < 2:
                continue
            ordered = sorted(row["units"], key=lambda item: item["bbox"][0])
            has_text = any(re.search(r"[A-Za-z]", item["text"]) for item in ordered)
            has_reference = any(re.fullmatch(r"\d{1,3}(?:\s*[,/-]\s*\d{1,3})*", item["text"].strip()) for item in ordered)
            baseline_rows_out.append({
                "page": page_number,
                "rowIndex": row_index,
                "baselineY": f"{row['baselineY']:.2f}",
                "alignmentSpreadPt": f"{max(item['baselineY'] for item in ordered) - min(item['baselineY'] for item in ordered):.2f}",
                "candidateType": "text_plus_page_reference" if has_text and has_reference else "same_baseline_multi_unit",
                "unitCount": len(ordered),
                "unitsLeftToRight": " || ".join(f"{item['candidateUnit']}: {item['text']}" for item in ordered),
                "review": "baseline relationship candidate; check column x₀ and original PDF before pairing as one entry",
            })

    args.out_dir.mkdir(parents=True, exist_ok=True)
    unit_fields = list(units_out[0]) if units_out else ["page"]
    key_fields = list(key_impact[0]) if key_impact else ["page"]
    write_csv(args.out_dir / "candidate-units.csv", units_out, unit_fields)
    write_csv(args.out_dir / "legacy-key-impact.csv", key_impact, key_fields)
    write_csv(args.out_dir / "pages.csv", page_summary, list(page_summary[0]) if page_summary else ["page"])
    gutter_fields = list(gutters_out[0]) if gutters_out else ["page"]
    write_csv(args.out_dir / "column-gutters.csv", gutters_out, gutter_fields)
    baseline_row_fields = list(baseline_rows_out[0]) if baseline_rows_out else ["page"]
    write_csv(args.out_dir / "baseline-rows.csv", baseline_rows_out, baseline_row_fields)
    unmatched_fields = list(unmatched_spans[0]) if unmatched_spans else ["page"]
    write_csv(args.out_dir / "baseline-unmatched.csv", unmatched_spans, unmatched_fields)
    summary = {
        "pages": len(page_summary),
        "sourcePdfPageCount": pdf_page_count,
        "uniqueSourcePdfSpanKeysWithBaseline": len(pdf_baselines),
        "jsonSpansWithSourcePdfMatch": total_matched_spans,
        "jsonSpansWithoutSourcePdfMatch": total_json_spans - total_matched_spans,
        "jsonSpanSourceMatchRate": round(total_matched_spans / total_json_spans, 6) if total_json_spans else None,
        "pagesRecheckedWithImagePayloads": sorted(baseline_fallback_pages),
        "blocks": total_blocks,
        "lineFragments": total_fragments,
        "candidateUnits": total_units,
        "blocksRequiringKeyReview": total_split_blocks,
        "mixedFontSizeSourceBlocks": total_mixed_size_blocks,
        "notes": [
            "Different point sizes are hard boundaries, including within one PDF line.",
            "Candidate grouping uses same source block plus vertical/bbox continuity; it is not a semantic truth or visual approval.",
            "Bold/italic flags and original font family are preserved as source evidence; optical weight differences may be absent from metadata.",
            "This command is read-only and does not alter production JSON, translation storage, or drafts.",
        ],
        "outputs": ["candidate-units.csv", "legacy-key-impact.csv", "pages.csv", "column-gutters.csv", "baseline-rows.csv", "baseline-unmatched.csv"],
    }
    (args.out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"Pages: {len(page_summary)}; blocks: {total_blocks}; line fragments: {total_fragments}; "
        f"candidate units: {total_units}; blocks requiring key review: {total_split_blocks}"
    )
    print(f"Outputs: {args.out_dir.resolve()}")


if __name__ == "__main__":
    main()
