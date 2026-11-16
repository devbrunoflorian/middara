#!/usr/bin/env python3
"""Reproduce isolated vector-removal diagnostics for known p85/p92 controls.

Consumes only the five already-blocked prepared placements. It does not scan
for candidates and writes rendered evidence under the activation proof folder.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageStat
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/proofs/symbol-activation-2026-10-13"
PDF = ROOT.parent / "Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
TARGETS = [
    "p085-v96-99-n4", "p085-v108-111-n4",
    "p092-v185-186-187", "p092-v188-189", "p092-v190",
]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stats(a: Image.Image, b: Image.Image) -> dict:
    if a.size != b.size:
        b = b.resize(a.size, Image.Resampling.LANCZOS)
    aa = np.asarray(a.convert("RGB"), dtype=np.int16)
    bb = np.asarray(b.convert("RGB"), dtype=np.int16)
    diff = np.abs(aa - bb)
    luma = diff.max(axis=2)
    return {
        "size": list(a.size),
        "maeRgb": round(float(diff.mean()), 4),
        "p99MaxChannelDiff": int(np.quantile(luma, .99)),
        "pixelsDiffOver8": int(np.count_nonzero(luma > 8)),
    }


def render(page: pymupdf.Page, pixels: int) -> Image.Image:
    scale = pixels / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def main() -> None:
    status = json.loads((OUT / "activation-status.json").read_text(encoding="utf-8"))
    patch_root = OUT / "patches/pages"
    targets: dict[str, dict] = {}
    for page_plan in json.loads((OUT / "patches/patch-manifest.json").read_text(encoding="utf-8"))["pages"]:
        folder = patch_root / f"page_{page_plan['page']:03d}"
        sidecar = json.loads((folder / "inline_elements.json").read_text(encoding="utf-8"))
        for element in sidecar["elements"]:
            cid = (element.get("provenance") or {}).get("candidateId")
            if cid in TARGETS:
                targets[cid] = {"page": page_plan["page"], "folder": folder, "element": element}
    if sorted(targets) != sorted(TARGETS):
        raise RuntimeError("Known blocked controls are missing from the existing prepared set")
    results = []
    for cid in TARGETS:
        entry = targets[cid]
        page_no, folder, element = entry["page"], entry["folder"], entry["element"]
        out_dir = OUT / "vector-removal-diagnostics" / cid
        out_dir.mkdir(parents=True, exist_ok=True)
        source_doc = pymupdf.open(PDF)
        try:
            page = source_doc[page_no - 1]
            drawings = page.get_drawings()
            paint = page.get_bboxlog()
            remove = pymupdf.Rect(element["bbox"])
            removed_seqnos = []
            for index in element.get("drawingIndices", []):
                drawing = drawings[index]
                seq = drawing["seqno"]
                removed_seqnos.append(seq)
                remove |= pymupdf.Rect(paint[seq][1])
                if drawing["type"] == "fs" and seq + 1 < len(paint) and paint[seq + 1][0] == "stroke-path":
                    remove |= pymupdf.Rect(paint[seq + 1][1])
            original_pixels = Image.open(ROOT / f"apps/web/public/pages/page_{page_no:03d}/background.webp").convert("RGB")
            before_exact = render(page, original_pixels.width)
            before_exact.save(out_dir / "source-full-page-web-scale.png")
            page.add_redact_annot(remove + (-.2, -.2, .2, .2), fill=None)
            page.apply_redactions(images=0, graphics=1, text=0)
            after_exact = render(page, original_pixels.width)
            after_exact.save(out_dir / "vector-removed-web-scale.png")
            high = render(page, 4 * round(page.rect.width))
            high.save(out_dir / "vector-removed-4x.png")
            x0, y0, x1, y1 = element["mask"]["bbox"]
            sf = original_pixels.width / page.rect.width
            box = tuple(round(v * sf) for v in (x0, y0, x1, y1))
            clean_crop = after_exact.crop(box)
            original_crop = original_pixels.crop(box)
            source_render_crop = before_exact.crop(box)
            clean_crop.save(out_dir / "vector-removed-crop.png")
            original_crop.save(out_dir / "background-original-crop.png")
            source_render_crop.save(out_dir / "source-pdf-crop.png")
            expected_clean = render(page, original_pixels.width)
            staged_path = folder / Path(element["mask"]["url"]).name
            staged = Image.open(staged_path).convert("RGBA")
            # Recreate the same prepared mask placement over the canonical web raster.
            staged = staged.resize((box[2]-box[0], box[3]-box[1]), Image.Resampling.LANCZOS)
            composited = original_pixels.convert("RGBA")
            composited.alpha_composite(staged, box[:2])
            staged_crop = composited.convert("RGB").crop(box)
            staged_crop.save(out_dir / "staged-mask-composite.png")
            vector_composite = original_pixels.copy().convert("RGBA")
            opaque_clean = clean_crop.convert("RGBA")
            vector_composite.alpha_composite(opaque_clean, box[:2])
            vector_composite.convert("RGB").crop(box).save(out_dir / "direct-vector-mask-composite.png")
            # Keep a 4x crop for reading path removal and underlying image layers.
            hsf = high.width / page.rect.width
            high_box = tuple(round(v * hsf) for v in (x0, y0, x1, y1))
            high.crop(high_box).save(out_dir / "vector-removed-crop-4x.png")
            mask_page = pymupdf.open(stream=PDF.read_bytes(), filetype="pdf")
            try:
                assert page_no == int(cid[1:4])
                matrix_factor = 4 * round(page.rect.width) / page.rect.width
                # Redactions remove graphics only; all image XObjects remain attached.
                image_xrefs_after = sorted(i["xref"] for i in page.get_image_info(xrefs=True))
                image_xrefs_source = sorted(i["xref"] for i in mask_page[page_no-1].get_image_info(xrefs=True))
            finally:
                mask_page.close()
            results.append({
                "candidateId": cid, "page": page_no,
                "drawingIndices": element.get("drawingIndices", []), "drawingSeqnos": removed_seqnos,
                "redactionBoxPt": [round(v, 4) for v in remove],
                "webBackgroundPixels": list(original_pixels.size), "renderedPixels": list(after_exact.size),
                "sourcePdfSha256": sha(PDF), "preparedMaskSha256": sha(staged_path),
                "sourcePdfCropVsOriginalWebBackground": stats(source_render_crop, original_crop),
                "vectorRemovedCropVsOriginalWebBackground": stats(clean_crop, original_crop),
                "vectorRemovedCropVsCurrentMaskComposite": stats(clean_crop, staged_crop),
                "imageXrefsPreserved": image_xrefs_after == image_xrefs_source,
                "imageXrefsBefore": image_xrefs_source, "imageXrefsAfter": image_xrefs_after,
                "renderPipeline": "PyMuPDF in-memory redaction graphics=1, images=0, text=0; render at exact background.webp width and 4x",
                "evidenceDir": str(out_dir.relative_to(ROOT)),
            })
        finally:
            source_doc.close()
    report = {
        "scope": "five known blocked controls only; no candidate discovery",
        "sourcePdfSha256": sha(PDF),
        "canonicalWrites": 0,
        "targets": results,
        "diagnostic": "If the background raster is present under source vectors, vector-only redaction preserves image xrefs and reveals it. Comparison metrics are renderer-relative, not visual approval by themselves.",
    }
    (OUT / "vector-removal-diagnostics.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"targetCount": len(results), "imagesPreserved": all(r["imageXrefsPreserved"] for r in results), "report": str(OUT / "vector-removal-diagnostics.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
