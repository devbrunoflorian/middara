"""Find editable page text intersected by exact-PDF fidelity overlay crops.

Any partial line/crop intersection can bake prose into the PNG and leave a
clipped duplicate even when that line is hidden from HTML. Review the emitted
CSV and edge contact sheets before accepting a crop.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from apply_component_artwork_overlays import TARGETS  # noqa: E402


def overlap_rect(line_bbox: list[float], crop_bbox: list[float]) -> tuple[float, float, float, float] | None:
    x0 = max(float(line_bbox[0]), float(crop_bbox[0]))
    y0 = max(float(line_bbox[1]), float(crop_bbox[1]))
    x1 = min(float(line_bbox[2]), float(crop_bbox[2]))
    y1 = min(float(line_bbox[3]), float(crop_bbox[3]))
    return (x0, y0, x1, y1) if x1 > x0 and y1 > y0 else None


def run_audit(out_dir: Path, make_sheets: bool) -> list[dict[str, object]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, object]] = []
    crops: list[tuple[str, Image.Image, str]] = []

    for target in TARGETS:
        page_number = int(target["page"])
        page_dir = ROOT / "apps/web/public/pages" / f"page_{page_number:03d}"
        dom_path = page_dir / f"page_{page_number:03d}_dom.json"
        dom = json.loads(dom_path.read_text(encoding="utf-8"))
        crop_bbox = [float(v) for v in target["bbox"]]  # type: ignore[arg-type]
        overlay_name = f"fidelity-overlay-component-{target['name']}.png"
        overlay_path = page_dir / overlay_name
        overlay = Image.open(overlay_path).convert("RGB") if overlay_path.is_file() else None

        for block in dom.get("blocks", []):
            for line in block.get("lines", []):
                for span_index, span in enumerate(line.get("spans", [])):
                    span_bbox = span.get("bbox") or line.get("bbox") or []
                    if len(span_bbox) != 4:
                        continue
                    intersection = overlap_rect(span_bbox, crop_bbox)
                    if intersection is None:
                        continue
                    fully_inside = (
                        span_bbox[0] >= crop_bbox[0]
                        and span_bbox[1] >= crop_bbox[1]
                        and span_bbox[2] <= crop_bbox[2]
                        and span_bbox[3] <= crop_bbox[3]
                    )
                    if fully_inside:
                        continue
                    text = str(span.get("text", ""))
                    if not text.strip():
                        continue
                    center_inside = (
                        crop_bbox[0] <= (span_bbox[0] + span_bbox[2]) / 2 <= crop_bbox[2]
                        and crop_bbox[1] <= (span_bbox[1] + span_bbox[3]) / 2 <= crop_bbox[3]
                    )
                    row = {
                        "page": page_number,
                        "region": str(target["name"]),
                        "block_id": block.get("id", ""),
                        "line_id": line.get("id", ""),
                        "span_index": span_index,
                        "span_bbox": json.dumps([round(float(v), 3) for v in span_bbox]),
                        "crop_bbox": json.dumps([round(v, 3) for v in crop_bbox]),
                        "center_inside_crop": center_inside,
                        "line_hidden_in_reader": bool(line.get("rasterizedDuplicate")),
                        "intersection": json.dumps([round(v, 3) for v in intersection]),
                        "text": text.strip(),
                    }
                    rows.append(row)

                    if make_sheets and overlay:
                        scale_x = overlay.width / (crop_bbox[2] - crop_bbox[0])
                        scale_y = overlay.height / (crop_bbox[3] - crop_bbox[1])
                        pad = 1.5
                        local = (
                            max(0, math.floor((intersection[0] - crop_bbox[0] - pad) * scale_x)),
                            max(0, math.floor((intersection[1] - crop_bbox[1] - pad) * scale_y)),
                            min(overlay.width, math.ceil((intersection[2] - crop_bbox[0] + pad) * scale_x)),
                            min(overlay.height, math.ceil((intersection[3] - crop_bbox[1] + pad) * scale_y)),
                        )
                        sample = overlay.crop(local)
                        caption = f"p{page_number:03d} {target['name']} {line.get('id')} span{span_index} | hidden={center_inside} | {text.strip()}"
                        crops.append((caption, sample, str(target["name"])))

    csv_path = out_dir / "overlay-text-intersections.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else ["page", "region"])
        writer.writeheader()
        writer.writerows(rows)

    if make_sheets:
        per_sheet = 12
        for start in range(0, len(crops), per_sheet):
            batch = crops[start : start + per_sheet]
            cell_w, cell_h, caption_h = 760, 118, 27
            sheet = Image.new("RGB", (cell_w, len(batch) * (cell_h + caption_h)), "#242424")
            draw = ImageDraw.Draw(sheet)
            for index, (caption, sample, _) in enumerate(batch):
                top = index * (cell_h + caption_h)
                draw.text((8, top + 3), caption[:150], fill="white")
                sample.thumbnail((cell_w - 16, cell_h - 8), Image.Resampling.LANCZOS)
                sheet.paste(sample, (8, top + caption_h + 3))
            sheet.save(out_dir / f"overlay-text-edge-{start // per_sheet + 1:02d}.jpg", quality=95)

    print(f"partialIntersections={len(rows)} csv={csv_path}")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, default=ROOT / "tmp/component-audit/overlay-text-intersections")
    parser.add_argument("--edge-sheets", action="store_true", help="render zoomed crops at every partial text/crop intersection")
    args = parser.parse_args()
    rows = run_audit(args.out_dir, args.edge_sheets)
    for row in rows:
        print(f"p{int(row['page']):03d} {row['region']} {row['line_id']}: {row['text']}")


if __name__ == "__main__":
    main()
