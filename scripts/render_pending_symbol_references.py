#!/usr/bin/env python3
"""Render source-PDF and vector-removed reference crops for the closed 100 IDs."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pymupdf
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/proofs/symbol-activation-2026-10-13"
PDF = ROOT.parent / "Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
TARGET_DIR = OUT / "batch-95/references"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_inputs() -> list[dict]:
    batch = json.loads((OUT / "batch-95/batch-results.json").read_text(encoding="utf-8"))
    if batch.get("status") != "completed" or len(batch.get("placements", [])) != 95:
        raise RuntimeError("The 95-placement batch UI capture is not complete")
    controls = json.loads((OUT / "blocked-controls/control-captures.json").read_text(encoding="utf-8"))
    results = [dict(item, control=False) for item in batch["placements"]]
    for item in controls["results"]:
        control = dict(item, control=True)
        control["emptyCaptureMeta"] = control["emptyCapture"]
        results.append(control)
    if len(results) != 100:
        raise RuntimeError("Expected 95 pending placements and five blocked controls")
    return results


def crop_at_scale(image: Image.Image, clip_pt: list[float], scale: float, size: list[int]) -> Image.Image:
    box = tuple(round(v * scale) for v in clip_pt)
    crop = image.crop(box)
    target = tuple(size)
    if crop.size != target:
        crop = crop.resize(target, Image.Resampling.LANCZOS)
    return crop.convert("RGB")


def main() -> None:
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    items = load_inputs()
    by_page: dict[int, list[dict]] = {}
    for item in items:
        if not item.get("emptyCaptureMeta") and not item.get("emptyCapture"):
            # Blocked controls name metadata through their capture object.
            empty = item.get("emptyCapture")
            if isinstance(empty, dict):
                item["emptyCaptureMeta"] = empty
        by_page.setdefault(int(item["page"]), []).append(item)
    reports = []
    with pymupdf.open(PDF) as doc:
        for page_no, page_items in sorted(by_page.items()):
            page = doc[page_no - 1]
            original_drawings = page.get_drawings()
            bbox_log = page.get_bboxlog()
            source_xrefs = sorted(info["xref"] for info in page.get_image_info(xrefs=True))
            factor = 4.0
            source_pix = page.get_pixmap(matrix=pymupdf.Matrix(factor, factor), alpha=False)
            source_full = Image.frombytes("RGB", (source_pix.width, source_pix.height), source_pix.samples)
            redaction_rects = []
            # Build all redactions solely from already-known IDs. Redact all
            # target vector runs on one source-page copy, preserving images.
            for item in page_items:
                side = json.loads((OUT / "patches/pages" / f"page_{page_no:03d}" / "inline_elements.json").read_text(encoding="utf-8"))
                element = next(e for e in side["elements"] if (e.get("provenance") or {}).get("candidateId") == item["candidateId"])
                removal = pymupdf.Rect(element["bbox"])
                for idx in element.get("drawingIndices", []):
                    drawing = original_drawings[idx]
                    seq = drawing["seqno"]
                    removal |= pymupdf.Rect(bbox_log[seq][1])
                    if drawing["type"] == "fs" and seq + 1 < len(bbox_log) and bbox_log[seq + 1][0] == "stroke-path":
                        removal |= pymupdf.Rect(bbox_log[seq + 1][1])
                item["redactionBoxPt"] = [round(v, 4) for v in removal]
                redaction = removal + (-.2, -.2, .2, .2)
                redaction_rects.append(redaction)
                page.add_redact_annot(redaction, fill=None)
            page.apply_redactions(images=0, graphics=1, text=0)
            clean_xrefs = sorted(info["xref"] for info in page.get_image_info(xrefs=True))
            pix = page.get_pixmap(matrix=pymupdf.Matrix(factor, factor), alpha=False)
            clean_full = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            source_arr = np.asarray(source_full, dtype=np.int16)
            clean_arr = np.asarray(clean_full, dtype=np.int16)
            allowed = np.zeros(source_arr.shape[:2], dtype=bool)
            for rect in redaction_rects:
                x0=max(0,round(rect.x0*factor));y0=max(0,round(rect.y0*factor))
                x1=min(allowed.shape[1],round(rect.x1*factor));y1=min(allowed.shape[0],round(rect.y1*factor))
                allowed[y0:y1,x0:x1]=True
            outside_diff=np.abs(source_arr-clean_arr)[~allowed]
            outside_max=int(outside_diff.max()) if outside_diff.size else 0
            outside_changed=int(np.count_nonzero(outside_diff))
            raster_integrity=outside_max==0
            for item in page_items:
                meta = item.get("emptyCaptureMeta")
                if not meta:
                    raise RuntimeError(f"Missing empty-state crop metadata for {item['candidateId']}")
                size = meta["pixelCrop"]
                clip = meta["pageClipPt"]
                cid = item["candidateId"]
                clean_crop = crop_at_scale(clean_full, clip, factor, size)
                source_crop = crop_at_scale(source_full, clip, factor, size)
                clean_path = TARGET_DIR / f"{cid}-clean-vector-removed.png"
                source_path = TARGET_DIR / f"{cid}-source-pdf.png"
                clean_crop.save(clean_path, optimize=True)
                source_crop.save(source_path, optimize=True)
                reports.append({"candidateId": cid, "page": page_no, "control": bool(item.get("control")),
                    "screenScale": meta["screenScale"], "screenshotPixels": size, "sourceClipPt": clip,
                    "referenceRendererScale": factor, "sourcePdfCrop": str(source_path.relative_to(ROOT)),
                    "cleanVectorRemovedCrop": str(clean_path.relative_to(ROOT)),
                    "sourcePdfSha256": sha(PDF), "sourceCropSha256": sha(source_path), "cleanCropSha256": sha(clean_path),
                    "imageVisualOutsideRedactionsEqual": raster_integrity,
                    "maxChannelDiffOutsideRedactions": outside_max,
                    "changedChannelsOutsideRedactions": outside_changed,
                    "imageInfoRecordsBefore": len(source_xrefs), "imageInfoRecordsAfter": len(clean_xrefs),
                    "imageXrefSetStable": source_xrefs == clean_xrefs})
    result = {"status": "100 localized references rendered; no candidate discovery", "targetCount": len(reports),
        "pages": sorted(by_page), "redaction": "known vector drawings only; images=0, graphics=1, text=0; high-resolution source-PDF render normalized to actual Viewer crop dimensions",
        "canonicalWrites": 0,
        "layerIntegrityMethod": "compare source and vector-redacted PyMuPDF rasters at identical 4x scale; every pixel outside the known redaction rectangles must be bit-identical. Xref numbers are recorded but not treated as visual preservation, because PyMuPDF may inline image records during redaction.",
        "results": reports}
    (TARGET_DIR / "reference-manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"references": len(reports), "pages": len(by_page), "rasterLayerIntegrity": all(x["imageVisualOutsideRedactionsEqual"] for x in reports), "manifest": str(TARGET_DIR / "reference-manifest.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
