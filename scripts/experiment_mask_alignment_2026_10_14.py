#!/usr/bin/env python3
"""Visualize exact removed-vector pixels over the served background raster."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT.parent / "Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
OUT = ROOT / "output/proofs/symbol-activation-2026-10-13/batch-95/mask-reconstruction-lab/mask-alignment-2026-10-14"
BATCH = ROOT / "output/proofs/symbol-activation-2026-10-13/batch-95/batch-results.json"
TARGETS = {"p045-v134-137-n4", "p054-v185-188-n4", "p084-v185"}


def render(page: pymupdf.Page, width: int) -> Image.Image:
    scale = width / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def main() -> None:
    if OUT.exists():
        raise SystemExit(f"Refusing to overwrite existing evidence: {OUT}")
    batch = json.loads(BATCH.read_text(encoding="utf-8"))
    placements = {p["candidateId"]: p for p in batch["placements"]}
    OUT.mkdir(parents=True)
    report = []
    for cid in sorted(TARGETS):
        item = placements[cid]
        page_no = int(item["page"])
        sidecar_path = ROOT / "output/proofs/full-symbol-integrity-2026-10-13/patches/pages" / f"page_{page_no:03d}" / "inline_elements.json"
        sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
        element = next(e for e in sidecar["elements"] if (e.get("provenance") or {}).get("candidateId") == cid)
        bg = Image.open(ROOT / f"apps/web/public/pages/page_{page_no:03d}/background.webp").convert("RGB")
        page_dir = OUT / cid
        page_dir.mkdir()
        doc = pymupdf.open(PDF)
        try:
            page = doc[page_no - 1]
            scale = bg.width / page.rect.width
            page.add_redact_annot(page.rect, fill=None)
            page.apply_redactions(images=0, graphics=0, text=0)
            before = render(page, bg.width)
            drawings = page.get_drawings()
            bbox_log = page.get_bboxlog()
            removal = pymupdf.Rect(element["bbox"])
            for index in element.get("drawingIndices", []):
                drawing = drawings[int(index)]
                seq = int(drawing["seqno"])
                removal |= pymupdf.Rect(bbox_log[seq][1])
                if drawing["type"] == "fs" and seq + 1 < len(bbox_log) and bbox_log[seq + 1][0] == "stroke-path":
                    removal |= pymupdf.Rect(bbox_log[seq + 1][1])
            page.add_redact_annot(removal + (-0.2, -0.2, 0.2, 0.2), fill=None)
            page.apply_redactions(images=0, graphics=1, text=1)
            after = render(page, bg.width)

            before_px = np.asarray(before, dtype=np.int16)
            after_px = np.asarray(after, dtype=np.int16)
            delta = np.max(np.abs(before_px - after_px), axis=2)
            mask = (delta > 0).astype(np.uint8) * 255
            mask_image = Image.fromarray(mask, mode="L")
            mask_image.save(page_dir / "removed-vector-pixels.png")

            mask_box = tuple(round(float(v) * scale) for v in element["mask"]["bbox"])
            pad = round(10 * scale)
            context_box = (
                max(0, mask_box[0] - pad), max(0, mask_box[1] - pad),
                min(bg.width, mask_box[2] + pad), min(bg.height, mask_box[3] + pad),
            )
            context = bg.crop(context_box)
            local_mask = mask_image.crop(context_box)
            overlay = context.convert("RGBA")
            tint = Image.new("RGBA", overlay.size, (255, 0, 190, 0))
            tint.putalpha(local_mask.point(lambda v: min(180, int(v * 0.7))))
            overlay.alpha_composite(tint)
            overlay.convert("RGB").resize((overlay.width * 8, overlay.height * 8), Image.Resampling.NEAREST).save(page_dir / "removed-vector-mask-on-background-8x.png")
            # Keep readable native-resolution crops alongside the enlarged view.
            context.save(page_dir / "background-context.png")
            overlay.convert("RGB").save(page_dir / "removed-vector-mask-on-background.png")
            ys, xs = np.where(mask > 0)
            bounds = [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)] if len(xs) else None
            report.append({
                "candidateId": cid,
                "page": page_no,
                "removedVectorPixelCount": int(len(xs)),
                "removedVectorPixelBoundsPx": bounds,
                "registeredElementBboxPx": [round(float(v) * scale) for v in element["bbox"]],
                "maskBboxPx": list(mask_box),
                "drawingIndices": element.get("drawingIndices", []),
                "image": str((page_dir / "removed-vector-mask-on-background-8x.png").relative_to(ROOT)),
            })
        finally:
            doc.close()
    (OUT / "alignment-report.json").write_text(json.dumps({"scope": sorted(TARGETS), "canonicalWrites": 0, "targets": report}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"targets": len(report), "report": str((OUT / 'alignment-report.json').relative_to(ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
