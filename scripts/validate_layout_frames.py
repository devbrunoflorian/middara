#!/usr/bin/env python3
"""Validate every layout frame sidecar without changing production data."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
OUT_ROOT = ROOT / "tmp" / "ghost-audit" / "bookwide-layout-policy"


def overlaps(a: list[float], b: list[float], tolerance: float = 0.5) -> bool:
    return a[0] < b[2] - tolerance and b[0] < a[2] - tolerance and a[1] < b[3] - tolerance and b[1] < a[3] - tolerance


def text_of(block: dict[str, Any]) -> str:
    return " ".join(
        str(span.get("text", ""))
        for line in block.get("lines", [])
        for span in line.get("spans", [])
    ).strip()[:120]


def main() -> None:
    rows: list[dict[str, Any]] = []
    parse_errors: list[dict[str, str]] = []
    sidecar_pages = 0
    frame_count = 0
    for sidecar_path in sorted(PAGE_ROOT.glob("page_*/layout_frames.json")):
        page = int(sidecar_path.parent.name.split("_")[1])
        dom_path = sidecar_path.parent / f"page_{page:03d}_dom.json"
        try:
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8-sig"))
            dom = json.loads(dom_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, ValueError) as error:
            parse_errors.append({"page": str(page), "error": str(error)})
            continue
        sidecar_pages += 1
        blocks = {str(block.get("id")): block for block in dom.get("blocks", [])}
        width = float(dom.get("width", 820.346))
        height = float(dom.get("height", 820.346))
        images = []
        for image in dom.get("images", []):
            if image.get("role") != "content" or len(image.get("bbox", [])) != 4:
                continue
            candidate = [float(value) for value in image["bbox"]]
            image_width = candidate[2] - candidate[0]
            image_height = candidate[3] - candidate[1]
            # Full-page textures and decorative rails are not editable
            # obstacles. Keep finite artwork, cards, maps, and illustrations.
            if image_width >= width * 0.85 or image_height >= height * 0.82:
                continue
            # The PDF extractor may expose a divider, rule, or flourish as a
            # thin content image. It is part of the frame decoration and does
            # not consume horizontal space for translated prose.
            if image_width >= width * 0.30 and image_height <= height * 0.05:
                continue
            images.append(candidate)
        for block_id, frame in sidecar.items():
            frame_count += 1
            block = blocks.get(block_id)
            if not block or not isinstance(frame, dict):
                rows.append({"page": page, "blockId": block_id, "status": "missing-block", "reason": "sidecar-key-not-in-dom"})
                continue
            x = float(frame.get("x", 0))
            frame_width = float(frame.get("width", 0))
            bbox = [float(value) for value in block.get("bbox", [])]
            frame_box = [x, bbox[1], x + frame_width, bbox[3]]
            issues: list[str] = []
            if frame_width <= 0:
                issues.append("non-positive-width")
            if x < -0.5 or x + frame_width > width + 0.5:
                issues.append("out-of-page")
            if any(overlaps(frame_box, image) for image in images):
                issues.append("content-image-intersection")
            for other_id, other in blocks.items():
                if other_id == block_id or len(other.get("bbox", [])) != 4:
                    continue
                # A source-confirmed duplicate is hidden in normal reading
                # mode; it must not turn the surviving title frame into a
                # false text-overlap review.
                other_lines = other.get("lines", [])
                if other_lines and all(line.get("rasterizedDuplicate") for line in other_lines):
                    continue
                other_box = [float(value) for value in other["bbox"]]
                if overlaps(frame_box, other_box) and not (other_box[1] >= bbox[3] - 0.5 or other_box[3] <= bbox[1] + 0.5):
                    issues.append("text-bbox-intersection")
                    break
            rows.append({
                "page": page,
                "blockId": block_id,
                "status": "ok" if not issues else "review",
                "reason": ";".join(issues),
                "x": round(x, 3),
                "width": round(frame_width, 3),
                "blockText": text_of(block),
            })

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    fields = ["page", "blockId", "status", "reason", "x", "width", "blockText"]
    with (OUT_ROOT / "frame-validation.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    summary = {
        "sidecarPages": sidecar_pages,
        "frameCount": frame_count,
        "okFrames": sum(row["status"] == "ok" for row in rows),
        "reviewFrames": sum(row["status"] == "review" for row in rows),
        "missingBlockFrames": sum(row["status"] == "missing-block" for row in rows),
        "reasonCounts": {
            reason: sum(reason in row.get("reason", "").split(";") for row in rows)
            for reason in ("out-of-page", "content-image-intersection", "text-bbox-intersection", "non-positive-width")
        },
        "parseErrors": parse_errors,
    }
    (OUT_ROOT / "frame-validation-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
