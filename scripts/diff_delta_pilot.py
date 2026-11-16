"""Rasterize the official PDF at viewer capture scale and report page deltas.

This is a detector, not a semantic classifier. It creates raw pixel signals,
an antialias-tolerant structural mask, connected regions and a post-hoc p67
control correlation. It never writes to app data or source assets.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageFilter


P67_DRAWING_INDEX = 220
STRUCTURAL_THRESHOLD = 32
BLUR_RADIUS_PX = 1.5
STRUCTURAL_BLURRED_THRESHOLD = 128
MIN_REGION_PIXELS = 8
MORPHOLOGY_KERNEL = 3


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--manifest",
        default="docs/project-progress/evidence/2026-10-08-delta-driven-viewer-capture/capture-manifest.json",
    )
    parser.add_argument(
        "--pdf",
        default="C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf",
    )
    return parser.parse_args()


def rect_values(rect: pymupdf.Rect) -> list[float]:
    return [round(float(value), 6) for value in rect]


def components(binary: np.ndarray) -> list[dict[str, int]]:
    """8-connected components; bbox right/bottom are exclusive."""
    height, width = binary.shape
    seen = np.zeros((height, width), dtype=bool)
    found: list[dict[str, int]] = []
    for row, col in zip(*np.nonzero(binary)):
        if seen[row, col]:
            continue
        stack = [(int(row), int(col))]
        seen[row, col] = True
        left = right = int(col)
        top = bottom = int(row)
        area = 0
        while stack:
            y, x = stack.pop()
            area += 1
            left = min(left, x)
            right = max(right, x)
            top = min(top, y)
            bottom = max(bottom, y)
            for next_y in range(max(0, y - 1), min(height, y + 2)):
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    if binary[next_y, next_x] and not seen[next_y, next_x]:
                        seen[next_y, next_x] = True
                        stack.append((next_y, next_x))
        found.append({
            "left": left,
            "top": top,
            "right": right + 1,
            "bottom": bottom + 1,
            "area": area,
        })
    return sorted(found, key=lambda item: item["area"], reverse=True)


def save_gray(path: Path, values: np.ndarray) -> None:
    Image.fromarray(np.asarray(values, dtype=np.uint8), mode="L").save(path)


def capture_map(manifest: dict) -> dict[tuple[int, str], dict]:
    return {(entry["page"], entry["state"]): entry for entry in manifest["captures"]}


def correlate_p67_control(
    doc: pymupdf.Document,
    page_diff: dict,
    source: Image.Image,
    viewer: Image.Image,
    raw_delta: np.ndarray,
    structural_delta: np.ndarray,
    structural_mask: np.ndarray,
) -> dict:
    page = doc[66]
    drawings = page.get_drawings()
    drawing = drawings[P67_DRAWING_INDEX]
    bbox = pymupdf.Rect(drawing["rect"])
    width_px, height_px = viewer.size
    scale_x = width_px / page.rect.width
    scale_y = height_px / page.rect.height
    left = max(0, int(np.floor((bbox.x0 - page.rect.x0) * scale_x)))
    top = max(0, int(np.floor((bbox.y0 - page.rect.y0) * scale_y)))
    right = min(width_px, int(np.ceil((bbox.x1 - page.rect.x0) * scale_x)))
    bottom = min(height_px, int(np.ceil((bbox.y1 - page.rect.y0) * scale_y)))
    roi_delta = raw_delta[top:bottom, left:right]
    roi_structural_delta = structural_delta[top:bottom, left:right]
    roi_mask = structural_mask[top:bottom, left:right]

    target = {"left": left, "top": top, "right": right, "bottom": bottom}
    candidates = []
    for region in page_diff["regions"]:
        region_box = region["bboxPx"]
        ix0, iy0 = max(left, region_box[0]), max(top, region_box[1])
        ix1, iy1 = min(right, region_box[2]), min(bottom, region_box[3])
        intersection = max(0, ix1 - ix0) * max(0, iy1 - iy0)
        if intersection:
            candidates.append({
                "regionId": region["regionId"],
                "intersectionPx": intersection,
                "intersectionOverTargetBbox": round(intersection / max(1, (right - left) * (bottom - top)), 6),
                "regionBBoxPx": region_box,
            })

    significant = roi_mask.astype(bool)
    return {
        "drawingIndex": P67_DRAWING_INDEX,
        "sourceDrawingBBoxPt": rect_values(bbox),
        "bboxPx": [left, top, right, bottom],
        "bboxAreaPx": int((right - left) * (bottom - top)),
        "rawThresholdPixelsAt32": int(np.count_nonzero(np.max(roi_delta, axis=2) >= STRUCTURAL_THRESHOLD)),
        "blurredThresholdPixelsAt128": int(np.count_nonzero(np.max(roi_structural_delta, axis=2) >= STRUCTURAL_BLURRED_THRESHOLD)),
        "structuralMaskPixels": int(np.count_nonzero(significant)),
        "structuralMaskFractionOfBBox": round(float(np.count_nonzero(significant) / max(1, significant.size)), 6),
        "meanMaxChannelDelta": round(float(np.mean(np.max(roi_delta, axis=2))), 4),
        "peakMaxChannelDelta": int(np.max(roi_delta)) if roi_delta.size else 0,
        "matchingRegions": candidates,
        "semanticInterpretation": "post-hoc match to the known capsule control; not used to generate the page mask",
    }


def main() -> None:
    args = parse_args()
    manifest_path = Path(args.manifest).resolve()
    output_dir = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    captures = capture_map(manifest)
    pdf_path = Path(args.pdf).resolve()

    structural_dir = output_dir / "diff"
    source_dir = output_dir / "source"
    structural_dir.mkdir(parents=True, exist_ok=True)
    source_dir.mkdir(parents=True, exist_ok=True)

    results: list[dict] = []
    region_rows: list[dict] = []
    with pymupdf.open(pdf_path) as doc:
        for page_number, state in sorted(captures, key=lambda item: (item[0], item[1])):
            capture = captures[(page_number, state)]
            page = doc[page_number - 1]
            viewer_path = output_dir / capture["file"]
            viewer = Image.open(viewer_path).convert("RGB")
            if page.rotation != 0:
                raise RuntimeError(f"p{page_number} rotation {page.rotation} needs an explicit mapping")
            if not np.allclose(np.asarray(page.mediabox), np.asarray(page.cropbox), atol=0.01):
                raise RuntimeError(f"p{page_number} MediaBox/CropBox differ; no crop policy is configured")
            if abs(page.rect.width - page.rect.height) > 0.02:
                raise RuntimeError(f"p{page_number} is not square within tolerance: {page.rect}")
            if viewer.width != viewer.height:
                raise RuntimeError(f"Viewer capture is not square: {viewer_path} = {viewer.size}")

            width_px, height_px = viewer.size
            source_scale_x = width_px / page.rect.width
            source_scale_y = height_px / page.rect.height
            if abs(source_scale_x - source_scale_y) > 1e-7:
                raise RuntimeError(f"p{page_number} would require a non-uniform source transform")
            source_pix = page.get_pixmap(
                matrix=pymupdf.Matrix(source_scale_x, source_scale_y),
                alpha=False,
                annots=False,
            )
            if (source_pix.width, source_pix.height) != viewer.size:
                raise RuntimeError(
                    f"No manual resizing permitted: source p{page_number} rendered "
                    f"{source_pix.width}x{source_pix.height}, viewer is {viewer.width}x{viewer.height}"
                )
            source = Image.frombytes("RGB", (source_pix.width, source_pix.height), source_pix.samples)
            source_filename = f"source-page-{page_number:03}.png"
            source.save(source_dir / source_filename)

            source_array = np.asarray(source, dtype=np.int16)
            viewer_array = np.asarray(viewer, dtype=np.int16)
            delta = np.abs(viewer_array - source_array)
            max_channel = delta.max(axis=2).astype(np.uint8)
            threshold_mask = max_channel >= STRUCTURAL_THRESHOLD
            blurred_source = np.asarray(source.filter(ImageFilter.GaussianBlur(BLUR_RADIUS_PX)), dtype=np.int16)
            blurred_viewer = np.asarray(viewer.filter(ImageFilter.GaussianBlur(BLUR_RADIUS_PX)), dtype=np.int16)
            structural_delta = np.abs(blurred_viewer - blurred_source)
            structural_max_channel = structural_delta.max(axis=2).astype(np.uint8)
            structural_threshold_mask = structural_max_channel >= STRUCTURAL_BLURRED_THRESHOLD

            # Join one-pixel rasterization gaps, then discard isolated regions
            # smaller than the documented 8-pixel noise floor. Raw signal stays intact.
            threshold_image = Image.fromarray((structural_threshold_mask * 255).astype(np.uint8), mode="L")
            closed_image = threshold_image.filter(ImageFilter.MaxFilter(MORPHOLOGY_KERNEL))
            closed_image = closed_image.filter(ImageFilter.MinFilter(MORPHOLOGY_KERNEL))
            closed = np.asarray(closed_image) > 0
            all_regions = components(closed)
            regions = [region for region in all_regions if region["area"] >= MIN_REGION_PIXELS]
            kept_mask = np.zeros_like(closed, dtype=bool)
            region_records = []
            for index, region in enumerate(regions, start=1):
                left, top, right, bottom = (region[key] for key in ("left", "top", "right", "bottom"))
                kept_mask[top:bottom, left:right] |= closed[top:bottom, left:right]
                roi = max_channel[top:bottom, left:right]
                structural_roi = structural_max_channel[top:bottom, left:right]
                roi_threshold = threshold_mask[top:bottom, left:right]
                bbox_pt = [
                    round(page.rect.x0 + left / source_scale_x, 3),
                    round(page.rect.y0 + top / source_scale_y, 3),
                    round(page.rect.x0 + right / source_scale_x, 3),
                    round(page.rect.y0 + bottom / source_scale_y, 3),
                ]
                record = {
                    "regionId": f"{page_number:03}-{state}-{index:03}",
                    "bboxPx": [left, top, right, bottom],
                    "bboxPt": bbox_pt,
                    "bboxNorm": [round(left / width_px, 6), round(top / height_px, 6), round(right / width_px, 6), round(bottom / height_px, 6)],
                    "structuralAreaPx": int(region["area"]),
                    "rawThresholdPixelsInBBox": int(np.count_nonzero(roi_threshold)),
                    "meanMaxChannelDelta": round(float(np.mean(roi[roi_threshold])) if roi_threshold.any() else 0.0, 3),
                    "peakMaxChannelDelta": int(roi.max()) if roi.size else 0,
                    "meanBlurredMaxChannelDelta": round(float(np.mean(structural_roi[closed[top:bottom, left:right]])) if closed[top:bottom, left:right].any() else 0.0, 3),
                    "classification": "INCONCLUSIVE",
                }
                region_records.append(record)
                region_rows.append({
                    "page": page_number,
                    "state": state,
                    "regionId": record["regionId"],
                    "classification": record["classification"],
                    "bboxPx": json.dumps(record["bboxPx"]),
                    "bboxPt": json.dumps(record["bboxPt"]),
                    "structuralAreaPx": record["structuralAreaPx"],
                    "rawThresholdPixelsInBBox": record["rawThresholdPixelsInBBox"],
                    "meanMaxChannelDelta": record["meanMaxChannelDelta"],
                    "peakMaxChannelDelta": record["peakMaxChannelDelta"],
                    "meanBlurredMaxChannelDelta": record["meanBlurredMaxChannelDelta"],
                })

            state_name = "historical-no-pill" if state == "historical-no-pill" else "current"
            prefix = f"page-{page_number:03}-{state_name}"
            Image.fromarray(max_channel, mode="L").save(structural_dir / f"{prefix}-raw-max-channel-delta.png")
            save_gray(structural_dir / f"{prefix}-threshold-mask-raw.png", threshold_mask * 255)
            save_gray(structural_dir / f"{prefix}-threshold-mask-blurred.png", structural_threshold_mask * 255)
            save_gray(structural_dir / f"{prefix}-structural-mask.png", kept_mask * 255)
            heat = np.asarray(viewer, dtype=np.uint8).copy()
            heat[kept_mask] = (
                (heat[kept_mask].astype(np.uint16) * 45 + np.array([255, 0, 0], dtype=np.uint16) * 210) // 255
            ).astype(np.uint8)
            Image.fromarray(heat, mode="RGB").save(structural_dir / f"{prefix}-regions-overlay.png")

            raw_nonzero = max_channel > 0
            result = {
                "page": page_number,
                "state": state,
                "viewerFile": capture["file"],
                "sourceFile": f"source/{source_filename}",
                "viewerPx": [width_px, height_px],
                "sourcePx": [source_pix.width, source_pix.height],
                "mediaBoxPt": rect_values(page.mediabox),
                "cropBoxPt": rect_values(page.cropbox),
                "pageRotation": page.rotation,
                "sourceTransformPxPerPt": [round(source_scale_x, 9), round(source_scale_y, 9)],
                "sourceDpiEquivalent": [round(source_scale_x * 72, 5), round(source_scale_y * 72, 5)],
                "mapping": "uniform scale; page top-left to page top-left; no per-page shift, warp or resize",
                "raw": {
                    "nonzeroPixels": int(np.count_nonzero(raw_nonzero)),
                    "pixelsAtMaxChannelThreshold32": int(np.count_nonzero(threshold_mask)),
                    "meanMaxChannelDelta": round(float(max_channel.mean()), 4),
                    "peakMaxChannelDelta": int(max_channel.max()),
                },
                "structural": {
                    "gaussianBlurRadiusPx": BLUR_RADIUS_PX,
                    "thresholdMaxChannelAfterBlur": STRUCTURAL_BLURRED_THRESHOLD,
                    "morphology": f"3x3 closing to join one-pixel gaps; discard connected regions <{MIN_REGION_PIXELS}px",
                    "thresholdPixelsBeforeGrouping": int(np.count_nonzero(structural_threshold_mask)),
                    "retainedPixels": int(np.count_nonzero(kept_mask)),
                    "retainedFractionOfPage": round(float(np.count_nonzero(kept_mask) / kept_mask.size), 7),
                    "discardedConnectedRegions": len(all_regions) - len(regions),
                    "regionCount": len(region_records),
                },
                "regions": region_records,
                "classificationNote": "Detector reports regions only; generic regions remain INCONCLUSIVE pending structural review.",
            }
            if page_number == 67:
                result["p67Drawing220Control"] = correlate_p67_control(
                    doc, result, source, viewer, delta.astype(np.uint8), structural_delta.astype(np.uint8), kept_mask,
                )
            results.append(result)

    grouped = {(item["page"], item["state"]): item for item in results}
    historical_control = grouped[(67, "historical-no-pill")]["p67Drawing220Control"]
    current_control = grouped[(67, "current")]["p67Drawing220Control"]
    historical_bbox_signal = historical_control["structuralMaskPixels"]
    current_bbox_signal = current_control["structuralMaskPixels"]
    reduction = 1 - current_bbox_signal / max(1, historical_bbox_signal)
    historical_control["classification"] = "CONFIRMED DEFECT"
    historical_control["detectedByStructuralMask"] = bool(historical_bbox_signal >= 50 and historical_control["matchingRegions"])
    if current_bbox_signal <= 8 and historical_control["detectedByStructuralMask"]:
        current_control["classification"] = "EXPECTED RASTERIZATION DIFFERENCE"
    else:
        current_control["classification"] = "INCONCLUSIVE"
    current_control["signalReductionVsHistorical"] = round(float(reduction), 6)

    report = {
        "method": {
            "source": "official PDF page render via PyMuPDF",
            "viewer": "page-only Playwright PNG capture; existing localhost viewer and local API",
            "rawSignal": "per-pixel absolute RGB difference; max channel retained as grayscale 0–255",
            "structuralDelta": {
                "antialiasTolerance": f"Gaussian blur both rasters at sigma={BLUR_RADIUS_PX}px before thresholding",
                "threshold": f"max RGB channel difference after blur >= {STRUCTURAL_BLURRED_THRESHOLD}/255",
                "morphology": "3x3 closing to bridge one-pixel gaps",
                "noiseFloor": f"discard connected regions smaller than {MIN_REGION_PIXELS} pixels",
                "connectivity": "8-connected",
                "automaticPassFailScore": False,
            },
            "limitations": [
                "A region is a visual difference, not a semantic diagnosis.",
                "Generic regions remain INCONCLUSIVE; antialias/font/background texture can create differences.",
                "The controlled p67 historical state reuses current viewer code and substitutes only the exact pre-fix overlay sidecar response.",
            ],
        },
        "captureManifest": manifest_path.name,
        "sourcePdf": str(pdf_path),
        "results": results,
    }
    report_path = output_dir / "delta-report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    csv_path = output_dir / "regions.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as stream:
        fieldnames = ["page", "state", "regionId", "classification", "bboxPx", "bboxPt", "structuralAreaPx", "rawThresholdPixelsInBBox", "meanMaxChannelDelta", "peakMaxChannelDelta", "meanBlurredMaxChannelDelta"]
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(region_rows)

    print(json.dumps({
        "report": str(report_path),
        "regionsCsv": str(csv_path),
        "results": [{
            "page": result["page"],
            "state": result["state"],
            "viewerPx": result["viewerPx"],
            "regions": result["structural"]["regionCount"],
            "thresholdPixels": result["structural"]["thresholdPixelsBeforeGrouping"],
            "retainedPixels": result["structural"]["retainedPixels"],
            "p67Control": result.get("p67Drawing220Control"),
        } for result in results],
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
