"""Read-only detector for extracted PDF text laid over local artwork images.

This is a candidate generator, not an automatic ghost classifier. It correlates
page JSON lines with PyMuPDF's painted image/text bboxes and operation order.
It never edits page data or the source PDF.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from difflib import SequenceMatcher
from pathlib import Path

import pymupdf


def rect(values: list[float] | tuple[float, ...]) -> pymupdf.Rect:
    return pymupdf.Rect(values)


def overlap_metrics(a: pymupdf.Rect, b: pymupdf.Rect) -> tuple[float, float]:
    inter = a & b
    if inter.is_empty or inter.get_area() <= 0:
        return 0.0, 0.0
    coverage = inter.get_area() / max(a.get_area(), 0.01)
    iou = inter.get_area() / max((a | b).get_area(), 0.01)
    return coverage, iou


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def page_lines(page_json: dict) -> list[dict]:
    result = []
    for block_index, block in enumerate(page_json.get("blocks", [])):
        for line_index, line in enumerate(block.get("lines", [])):
            text = "".join(span.get("text", "") for span in line.get("spans", []))
            if not text.strip():
                continue
            result.append({
                "block_index": block_index,
                "block_id": block.get("id", ""),
                "line_index": line_index,
                "line_id": line.get("id", ""),
                "text": " ".join(text.split()),
                "span_texts": [span.get("text", "") for span in line.get("spans", []) if span.get("text", "").strip()],
                "bbox": rect(line.get("bbox", block.get("bbox"))),
                "suspected_ghost": bool(line.get("suspectedGhost", block.get("suspectedGhost", False))),
                "rasterized_duplicate": bool(line.get("rasterizedDuplicate", False)),
            })
    return result


def inspect_page(pdf_page: pymupdf.Page, page_json: dict) -> list[dict]:
    page_area = pdf_page.rect.get_area()
    image_ops = []
    for seqno, (kind, bbox) in enumerate(pdf_page.get_bboxlog()):
        if "image" not in kind:
            continue
        image_rect = rect(bbox)
        area = image_rect.get_area()
        # Full-page scans/backgrounds are not useful evidence of local artwork.
        # Page-sized and broad page-panel raster layers are backdrops, not
        # discrete cards/illustrations. Tiny icons are also not useful evidence.
        if (
            area / page_area < 0.008
            or area / page_area >= 0.90
            or image_rect.width / pdf_page.rect.width > 0.68
            or image_rect.height / pdf_page.rect.height > 0.68
        ):
            continue
        image_ops.append((seqno, kind, image_rect))

    traces = []
    for span in pdf_page.get_texttrace():
        span_rect = rect(span["bbox"])
        if span_rect.is_empty:
            continue
        text = "".join(chr(char[0]) for char in span.get("chars", []))
        if text.strip():
            traces.append((int(span.get("seqno", -1)), span_rect, text))

    candidates = []
    for line in page_lines(page_json):
        line_rect = line["bbox"]
        matching_traces = []
        for seqno, trace_rect, trace_text in traces:
            coverage, _ = overlap_metrics(trace_rect, line_rect)
            if coverage >= 0.35 or line_rect.contains(trace_rect):
                trace_norm = normalize(trace_text)
                span_norms = [normalize(part) for part in line["span_texts"]]
                textual_match = any(
                    len(part) >= 4
                    and (part == trace_norm or part in trace_norm or trace_norm in part
                         or SequenceMatcher(None, part, trace_norm).ratio() >= 0.90)
                    for part in span_norms
                )
                if textual_match:
                    matching_traces.append((seqno, trace_text))
        text_seq = max((item[0] for item in matching_traces), default=-1)
        trace_text = " ".join(item[1] for item in matching_traces)

        line_candidates = []
        for image_seq, image_kind, image_rect in image_ops:
            coverage, iou = overlap_metrics(line_rect, image_rect)
            if coverage < 0.50:
                continue
            line_candidates.append({
                "page": page_json.get("page_number", pdf_page.number + 1),
                "block_index": line["block_index"],
                "block_id": line["block_id"],
                "line_index": line["line_index"],
                "line_id": line["line_id"],
                "text": line["text"],
                "bbox": ",".join(f"{v:.2f}" for v in line_rect),
                "suspectedGhost": line["suspected_ghost"],
                "alreadyRasterizedDuplicate": line["rasterized_duplicate"],
                "imageSeq": image_seq,
                "imageBBox": ",".join(f"{v:.2f}" for v in image_rect),
                "imageCoverageOfText": round(coverage, 4),
                "bboxIoU": round(iou, 4),
                "lastTextSeq": text_seq,
                "textPaintedAfterImage": text_seq > image_seq if text_seq >= 0 else "unknown",
                "traceText": " ".join(trace_text.split())[:260],
                "signalsOnly": "candidate; content/bbox/order signals; visual confirmation required",
            })
        # PyMuPDF can report multiple image-mask/content operations for the
        # same visible card rectangle. Keep the strongest representative per
        # source line instead of inflating counts with duplicate operations.
        if line_candidates:
            line_candidates.sort(
                key=lambda row: (
                    row["textPaintedAfterImage"] is True,
                    row["imageCoverageOfText"],
                    row["bboxIoU"],
                ),
                reverse=True,
            )
            candidates.append(line_candidates[0])
    return candidates


def summarize_regions(candidates: list[dict]) -> list[dict]:
    """Group line-level signals into artwork review batches, never verdicts."""
    groups: dict[tuple[int, int, str], list[dict]] = {}
    for row in candidates:
        key = (int(row["page"]), int(row["imageSeq"]), str(row["imageBBox"]))
        groups.setdefault(key, []).append(row)

    summaries = []
    for (page, image_seq, image_bbox), rows in sorted(groups.items()):
        confirmed = sum(row["alreadyRasterizedDuplicate"] for row in rows)
        suspected = sum(row["suspectedGhost"] for row in rows)
        painted_after = sum(row["textPaintedAfterImage"] is True for row in rows)
        painted_before = sum(row["textPaintedAfterImage"] is False for row in rows)
        unknown_order = len(rows) - painted_after - painted_before
        examples = []
        seen = set()
        for row in rows:
            text = " ".join(str(row["text"]).split())
            if text and text.casefold() not in seen:
                examples.append(text[:100])
                seen.add(text.casefold())
            if len(examples) == 5:
                break

        summaries.append({
            "page": page,
            "regionId": f"p{page:03d}-imgseq{image_seq}",
            "imageSeq": image_seq,
            "imageBBox": image_bbox,
            "candidateLineCount": len(rows),
            "confirmedDuplicateLineCount": confirmed,
            "suspectedGhostLineCount": suspected,
            "textPaintedAfterImageCount": painted_after,
            "textPaintedBeforeImageCount": painted_before,
            "textPaintOrderUnknownCount": unknown_order,
            "maxImageCoverageOfText": max(row["imageCoverageOfText"] for row in rows),
            "maxBBoxIoU": max(row["bboxIoU"] for row in rows),
            "reviewStatus": (
                "all-candidate-lines-explicitly-confirmed"
                if confirmed == len(rows)
                else "needs-visual-review"
            ),
            "textExamples": " | ".join(examples),
        })
    return summaries


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--json-dir", required=True, type=Path, help="Directory containing page_NNN/page_NNN_dom.json")
    parser.add_argument("--out", required=True, type=Path, help="CSV output path, preferably under ignored tmp/")
    parser.add_argument(
        "--regions-out",
        type=Path,
        help="Optional grouped review queue CSV; summaries are signals, not automatic classifications",
    )
    parser.add_argument("--pages", help="Optional comma-separated 1-based page numbers")
    args = parser.parse_args()

    selected = {int(value) for value in args.pages.split(",")} if args.pages else None
    document = pymupdf.open(args.pdf)
    results = []
    for page_number in range(1, document.page_count + 1):
        if selected is not None and page_number not in selected:
            continue
        json_path = args.json_dir / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        if not json_path.exists():
            continue
        with json_path.open(encoding="utf-8") as handle:
            page_json = json.load(handle)
        results.extend(inspect_page(document[page_number - 1], page_json))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "page", "block_index", "block_id", "line_index", "line_id", "text", "bbox",
        "suspectedGhost", "alreadyRasterizedDuplicate", "imageSeq", "imageBBox",
        "imageCoverageOfText", "bboxIoU", "lastTextSeq", "textPaintedAfterImage",
        "traceText", "signalsOnly",
    ]
    with args.out.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(results)
    region_path = args.regions_out
    if region_path is not None:
        region_path.parent.mkdir(parents=True, exist_ok=True)
        region_rows = summarize_regions(results)
        region_fields = [
            "page", "regionId", "imageSeq", "imageBBox", "candidateLineCount",
            "confirmedDuplicateLineCount", "suspectedGhostLineCount",
            "textPaintedAfterImageCount", "textPaintedBeforeImageCount",
            "textPaintOrderUnknownCount", "maxImageCoverageOfText", "maxBBoxIoU",
            "reviewStatus", "textExamples",
        ]
        with region_path.open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=region_fields)
            writer.writeheader()
            writer.writerows(region_rows)
        print(f"Artwork review regions: {len(region_rows)}")
        print(f"Region CSV: {region_path.resolve()}")
    print(f"Pages scanned: {len(selected) if selected is not None else document.page_count}")
    print(f"Image-overlap candidates: {len(results)}")
    for page_number in (56, 74):
        count = sum(row["page"] == page_number for row in results)
        print(f"Page {page_number} candidates: {count}")
    print(f"CSV: {args.out.resolve()}")


if __name__ == "__main__":
    main()
