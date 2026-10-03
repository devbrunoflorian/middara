"""Read-only screen for repeated text-column geometry across the rulebook.

This ranks possible shared-frame groups from extracted page DOM geometry. It
does not certify layout, inspect translation drafts, or change production data.
All reports default to ignored tmp/ghost-audit/book-geometry/.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from statistics import median
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps/web/public/pages"
DEFAULT_OUT = ROOT / "tmp/ghost-audit/book-geometry"
X_TOLERANCE = 1.5
MIN_BLOCKS = 4
MIN_LINES = 2
MIN_TEXT_CHARS = 24


def text_of(block: dict[str, Any]) -> str:
    return "".join(
        str(span.get("text", ""))
        for line in block.get("lines", [])
        for span in line.get("spans", [])
    ).strip()


def primary_style(block: dict[str, Any]) -> str:
    for line in block.get("lines", []):
        for span in line.get("spans", []):
            if str(span.get("text", "")).strip():
                return f"{span.get('font', '?')}|{float(span.get('size', 0)):.2f}"
    return "unknown"


def filtered_content_images(data: dict[str, Any]) -> list[list[float]]:
    width, height = float(data["width"]), float(data["height"])
    seen: set[tuple[float, ...]] = set()
    result = []
    for image in data.get("images", []):
        if image.get("role") != "content":
            continue
        bbox = [float(value) for value in image.get("bbox", [])]
        if len(bbox) != 4:
            continue
        x0, y0, x1, y1 = bbox
        image_width, image_height = x1 - x0, y1 - y0
        if image_width <= 0 or image_height <= 0:
            continue
        # Full-page textures and broad page rails are common decorative layers.
        if image_width >= width * 0.85 or image_height >= height * 0.82:
            continue
        # Divider rules and flourishes are sometimes emitted as thin content
        # images. They decorate a text frame but do not reduce its usable
        # column width.
        if image_width >= width * 0.30 and image_height <= height * 0.05:
            continue
        key = tuple(round(value, 1) for value in bbox)
        if key in seen:
            continue
        seen.add(key)
        result.append(bbox)
    return result


def group_blocks(blocks: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    ordered = sorted(blocks, key=lambda block: float(block["bbox"][0]))
    groups: list[list[dict[str, Any]]] = []
    for block in ordered:
        x = float(block["bbox"][0])
        eligible = [
            group for group in groups
            if abs(x - median(float(item["bbox"][0]) for item in group)) <= X_TOLERANCE
        ]
        if eligible:
            min_spread_group = min(
                eligible,
                key=lambda group: max(float(item["bbox"][0]) for item in group)
                - min(float(item["bbox"][0]) for item in group),
            )
            min_spread_group.append(block)
        else:
            groups.append([block])
    return groups


def overlaps(a: list[float], b: list[float], tolerance: float = 1.0) -> bool:
    return a[0] < b[2] - tolerance and b[0] < a[2] - tolerance and a[1] < b[3] - tolerance and b[1] < a[3] - tolerance


def summarize_group(page: int, data: dict[str, Any], group: list[dict[str, Any]], images: list[list[float]]) -> dict[str, Any]:
    group = sorted(group, key=lambda block: (float(block["bbox"][1]), float(block["bbox"][0])))
    x_values = [float(block["bbox"][0]) for block in group]
    x = median(x_values)
    max_right = max(float(block["bbox"][2]) for block in group)
    min_top = min(float(block["bbox"][1]) for block in group)
    max_bottom = max(float(block["bbox"][3]) for block in group)
    overlaps_text = 0
    furthest_bottom = float("-inf")
    for block in group:
        y0, y1 = float(block["bbox"][1]), float(block["bbox"][3])
        if y0 < furthest_bottom - 1.0:
            overlaps_text += 1
        furthest_bottom = max(furthest_bottom, y1)
    candidate_box = [x, min_top, max_right, max_bottom]
    image_hits = sum(1 for image in images if overlaps(candidate_box, image))
    styles = Counter(primary_style(block) for block in group)
    reasons = []
    if overlaps_text:
        reasons.append("text-overlap")
    if image_hits:
        reasons.append("artwork-bbox-intersection")
    if len(styles) != 1:
        reasons.append("mixed-primary-style")
    if max(x_values) - min(x_values) > 1.0:
        reasons.append("x-axis-spread-over-1pt")
    if max_right - x > float(data["width"]) * 0.45:
        reasons.append("possible-gutter-crossing")
    status = "screen-clear" if not reasons else "visual-review"
    return {
        "page": page,
        "groupId": f"p{page:03d}-x{round(x, 1):.1f}",
        "status": status,
        "reviewReasons": ";".join(reasons),
        "blocks": len(group),
        "lines": sum(len(block.get("lines", [])) for block in group),
        "typographicUnits": sum(len(block.get("typographicUnits", [])) for block in group),
        "xMedian": round(x, 3),
        "xSpread": round(max(x_values) - min(x_values), 3),
        "inkRightMax": round(max_right, 3),
        "maxObservedWidth": round(max_right - x, 3),
        "yTop": round(min_top, 3),
        "yBottom": round(max_bottom, 3),
        "textOverlapCount": overlaps_text,
        "finiteImageHitCount": image_hits,
        "primaryStyleKinds": len(styles),
        "primaryStyles": "; ".join(f"{style}×{count}" for style, count in styles.most_common(4)),
        "blockIds": ";".join(str(block.get("id", "?")) for block in group),
        "texts": " | ".join(text_of(block).replace("\n", " ")[:96] for block in group),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="ignored output directory")
    args = parser.parse_args()

    page_files = sorted(PAGE_ROOT.glob("page_*/page_*_dom.json"))
    results: list[dict[str, Any]] = []
    statuses = Counter()
    loaded = missing = invalid = 0
    for page_file in page_files:
        try:
            data = json.loads(page_file.read_text(encoding="utf-8"))
            page = int(data["page_number"])
            width, height = float(data["width"]), float(data["height"])
            if width <= 0 or height <= 0 or not isinstance(data.get("blocks"), list):
                raise ValueError("invalid page dimensions or blocks")
            loaded += 1
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            invalid += 1
            continue

        eligible = []
        for block in data["blocks"]:
            bbox = block.get("bbox")
            if not isinstance(bbox, list) or len(bbox) != 4:
                continue
            lines = block.get("lines", [])
            if len(lines) < MIN_LINES or len(text_of(block)) < MIN_TEXT_CHARS:
                continue
            eligible.append(block)

        images = filtered_content_images(data)
        for group in group_blocks(eligible):
            if len(group) < MIN_BLOCKS:
                continue
            result = summarize_group(page, data, group, images)
            results.append(result)
            statuses[result["status"]] += 1

    expected = 102
    missing = max(0, expected - loaded - invalid)
    results.sort(key=lambda item: (item["status"] != "screen-clear", -item["blocks"], item["page"], item["xMedian"]))
    review_reasons = Counter(
        reason
        for item in results
        for reason in item["reviewReasons"].split(";")
        if reason
    )
    args.out.mkdir(parents=True, exist_ok=True)
    csv_path = args.out / "column-groups.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(results[0]) if results else ["page", "groupId", "status"])
        writer.writeheader()
        writer.writerows(results)
    summary = {
        "expectedPages": expected,
        "jsonFilesFound": len(page_files),
        "pagesLoaded": loaded,
        "pagesInvalid": invalid,
        "pagesMissing": missing,
        "candidateGroups": len(results),
        "groupsByStatus": dict(statuses),
        "pagesWithGroups": len({item["page"] for item in results}),
        "pagesWithScreenClearGroups": len({item["page"] for item in results if item["status"] == "screen-clear"}),
        "pagesWithVisualReviewGroups": len({item["page"] for item in results if item["status"] == "visual-review"}),
        "reviewReasonCounts": dict(review_reasons),
        "thresholds": {"xTolerancePt": X_TOLERANCE, "minBlocks": MIN_BLOCKS, "minLinesPerBlock": MIN_LINES, "minCharactersPerBlock": MIN_TEXT_CHARS},
        "interpretation": "screening only; image intersection and x alignment never authorize a frame change",
        "csv": str(csv_path.relative_to(ROOT)),
    }
    (args.out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
