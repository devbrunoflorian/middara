#!/usr/bin/env python3
"""Stage one native-resolution source-vector removal crop for p.67."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT.parent / "Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
OUT = ROOT / "output/proofs/symbol-activation-2026-10-13/batch-95/mask-reconstruction-lab/native-vector-crops-p067-v155-pending-v1-2026-10-14"
BATCH = ROOT / "output/proofs/symbol-activation-2026-10-13/batch-95/batch-results.json"
EXPECTED_PDF_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
TARGET = "p067-v155-158-n4"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render(page: pymupdf.Page, width: int) -> Image.Image:
    scale = width / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def main() -> None:
    if OUT.exists():
        raise SystemExit(f"Refusing to overwrite existing evidence: {OUT}")
    if sha(PDF).lower() != EXPECTED_PDF_SHA256:
        raise SystemExit("Source PDF hash does not match the frozen audit manifest")
    batch = json.loads(BATCH.read_text(encoding="utf-8"))
    placements = {item["candidateId"]: item for item in batch["placements"]}
    if TARGET not in placements:
        raise SystemExit(f"Target {TARGET} is missing from the frozen batch")

    item = placements[TARGET]
    page_no = int(item["page"])
    prepared_sidecar = ROOT / "output/proofs/full-symbol-integrity-2026-10-13/patches/pages" / f"page_{page_no:03d}" / "inline_elements.json"
    sidecar = json.loads(prepared_sidecar.read_text(encoding="utf-8"))
    elements = [e for e in sidecar["elements"] if (e.get("provenance") or {}).get("candidateId") == TARGET]
    if len(elements) != 1:
        raise SystemExit(f"Expected one prepared occurrence for {TARGET}")
    element = elements[0]
    page_dir = OUT / TARGET
    page_dir.mkdir(parents=True)
    background_path = ROOT / f"apps/web/public/pages/page_{page_no:03d}/background.webp"
    background = Image.open(background_path).convert("RGB")
    doc = pymupdf.open(PDF)
    try:
        page = doc[page_no - 1]
        source_xrefs = sorted(int(x["xref"]) for x in page.get_image_info(xrefs=True))
        drawings = page.get_drawings()
        bbox_log = page.get_bboxlog()
        removal = pymupdf.Rect(element["bbox"])
        seqnos = []
        for drawing_index in element.get("drawingIndices", []):
            drawing = drawings[int(drawing_index)]
            seq = int(drawing["seqno"])
            seqnos.append(seq)
            removal |= pymupdf.Rect(bbox_log[seq][1])
            if drawing["type"] == "fs" and seq + 1 < len(bbox_log) and bbox_log[seq + 1][0] == "stroke-path":
                removal |= pymupdf.Rect(bbox_log[seq + 1][1])

        # Match app background generation: clear page text, preserving graphics/images.
        page.add_redact_annot(page.rect, fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)
        before = render(page, background.width)
        # Remove only the registered target paths; this in-memory doc is never saved.
        page.add_redact_annot(removal + (-0.2, -0.2, 0.2, 0.2), fill=None)
        page.apply_redactions(images=0, graphics=1, text=1)
        after = render(page, background.width)

        mask = element["mask"]["bbox"]
        scale = background.width / page.rect.width
        box = tuple(round(float(v) * scale) for v in mask)
        inside = Image.new("L", before.size, 0)
        ImageDraw.Draw(inside).rectangle(box, fill=255)
        diff = np.asarray(ImageChops.difference(before, after), dtype=np.uint8)
        changed = np.any(diff != 0, axis=2)
        outside = np.asarray(inside) == 0
        collateral_pixels = int(np.count_nonzero(changed & outside))

        crop = after.crop(box)
        crop_path = page_dir / "native-vector-clean-mask.png"
        crop.save(crop_path, optimize=True)
        background.crop(box).save(page_dir / "original-background-crop.png", optimize=True)
        old_mask = ROOT / "output/proofs/full-symbol-integrity-2026-10-13/patches/pages" / f"page_{page_no:03d}" / f"audit-mask-{TARGET}.png"
        if old_mask.exists():
            Image.open(old_mask).convert("RGB").resize(crop.size, Image.Resampling.LANCZOS).save(page_dir / "previous-mask-resized.png", optimize=True)
        composite = background.copy()
        composite.paste(crop, box[:2])
        composite.crop(box).save(page_dir / "native-vector-composite-crop.png", optimize=True)
        xrefs_after = sorted(int(x["xref"]) for x in page.get_image_info(xrefs=True))
        result = {
            "candidateId": TARGET,
            "page": page_no,
            "symbolId": item["symbolId"],
            "drawingIndices": element.get("drawingIndices", []),
            "drawingSeqnos": seqnos,
            "redactionBboxPt": [round(float(v), 5) for v in removal],
            "backgroundSizePx": list(background.size),
            "maskCropBoxPx": list(box),
            "cropSizePx": list(crop.size),
            "collateralChangedPixelsOutsideMask": collateral_pixels,
            "imageXrefsPreserved": source_xrefs == xrefs_after,
            "sourcePdfSha256": EXPECTED_PDF_SHA256,
            "oldMaskSha256": sha(old_mask) if old_mask.exists() else None,
            "maskSha256": sha(crop_path),
            "evidenceDir": str(page_dir.relative_to(ROOT)),
        }
    finally:
        doc.close()

    report = {
        "status": "isolated experimental crop; authoritative activation status unchanged",
        "scope": [TARGET],
        "sourcePdfSha256": EXPECTED_PDF_SHA256,
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "method": "native background resolution; page text removed first; only registered vector drawings removed; images and all other graphics preserved",
        "targets": [result],
    }
    report_path = OUT / "experiment-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"target": TARGET, "outsideMaskChanges": result["collateralChangedPixelsOutsideMask"], "imageXrefsPreserved": result["imageXrefsPreserved"], "report": str(report_path.relative_to(ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
