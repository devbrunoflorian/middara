#!/usr/bin/env python3
"""Create a disposable exact-vector cleanup crop for frozen p.68 candidate.

The official PDF is opened read-only and redactions are applied only to an
in-memory document. All outputs are limited to output/proofs. The page text is
removed first to match the app's background layer; only the two registered
skull paths are removed in the second pass.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT.parent / "Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
PAGE_NO = 68
CANDIDATE_ID = "p068-v113-114-n2"
SOURCE_PDF_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
PATCH_DIR = ROOT / "output/proofs/full-symbol-integrity-2026-10-13/patches/pages/page_068"
SIDECAR = PATCH_DIR / "inline_elements.json"
BACKGROUND = ROOT / "apps/web/public/pages/page_068/background.webp"
OUT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p068-v1"
SCALE = 4.0  # Matches the registered 41 x 53 px prepared mask at 4 px / pt.


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render_crop(page: pymupdf.Page, bbox: list[float]) -> Image.Image:
    pix = page.get_pixmap(
        matrix=pymupdf.Matrix(SCALE, SCALE),
        clip=pymupdf.Rect(bbox),
        alpha=False,
    )
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def main() -> None:
    if OUT.exists():
        raise SystemExit(f"Refusing to overwrite existing evidence: {OUT}")
    if sha(PDF).lower() != SOURCE_PDF_SHA256:
        raise SystemExit("Source PDF hash does not match the frozen audit manifest")

    sidecar_bytes = SIDECAR.read_bytes()
    sidecar = json.loads(sidecar_bytes)
    matches = [
        element
        for element in sidecar["elements"]
        if (element.get("provenance") or {}).get("candidateId") == CANDIDATE_ID
    ]
    if len(matches) != 1:
        raise SystemExit(f"Expected one frozen sidecar element for {CANDIDATE_ID}")
    element = matches[0]
    if element.get("symbolId") != "combat.skull" or element.get("drawingIndices") != [113, 114]:
        raise SystemExit("Frozen candidate identity or vector indices changed")

    mask_bbox = [float(value) for value in element["mask"]["bbox"]]
    input_mask = PATCH_DIR / Path(element["mask"]["url"]).name
    original_mask_hash = sha(input_mask)
    background = Image.open(BACKGROUND).convert("RGB")

    doc = pymupdf.open(PDF)
    try:
        if len(doc) != 102:
            raise SystemExit(f"Expected 102 source pages; found {len(doc)}")
        page = doc[PAGE_NO - 1]
        image_xrefs_before = sorted(int(info["xref"]) for info in page.get_image_info(xrefs=True))
        # Build the same clean page-background layer used by the application:
        # remove text globally while retaining images and non-target graphics.
        page.add_redact_annot(page.rect, fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)
        if page.get_text().strip():
            raise SystemExit("Source text remained after background-layer redaction")

        baseline_crop = render_crop(page, mask_bbox)
        full_page_matrix = pymupdf.Matrix(
            background.width / page.rect.width,
            background.height / page.rect.height,
        )
        baseline_pix = page.get_pixmap(matrix=full_page_matrix, alpha=False)
        before_full = Image.frombytes(
            "RGB", (baseline_pix.width, baseline_pix.height), baseline_pix.samples
        )
        drawings = page.get_drawings()
        bbox_log = page.get_bboxlog()
        removal = pymupdf.Rect(element["bbox"])
        seqnos: list[int] = []
        for drawing_index in element["drawingIndices"]:
            drawing = drawings[int(drawing_index)]
            sequence = int(drawing["seqno"])
            seqnos.append(sequence)
            removal |= pymupdf.Rect(bbox_log[sequence][1])
            if (
                drawing["type"] == "fs"
                and sequence + 1 < len(bbox_log)
                and bbox_log[sequence + 1][0] == "stroke-path"
            ):
                removal |= pymupdf.Rect(bbox_log[sequence + 1][1])

        # For redaction, text=1 means preserve text. It was already removed in
        # the background pass above; this pass removes only graphics.
        removal += (-0.2, -0.2, 0.2, 0.2)
        page.add_redact_annot(removal, fill=None)
        page.apply_redactions(images=0, graphics=1, text=1)
        clean_crop = render_crop(page, mask_bbox)

        if baseline_crop.size != (41, 53) or clean_crop.size != (41, 53):
            raise SystemExit(f"Unexpected crop dimensions: {baseline_crop.size}, {clean_crop.size}")
        clean_pix = page.get_pixmap(matrix=full_page_matrix, alpha=False)
        after_full = Image.frombytes("RGB", (clean_pix.width, clean_pix.height), clean_pix.samples)

        mask_scale_x = background.width / page.rect.width
        mask_scale_y = background.height / page.rect.height
        mask_box = (
            round(mask_bbox[0] * mask_scale_x),
            round(mask_bbox[1] * mask_scale_y),
            round(mask_bbox[2] * mask_scale_x),
            round(mask_bbox[3] * mask_scale_y),
        )
        inside = Image.new("L", before_full.size, 0)
        ImageDraw.Draw(inside).rectangle(mask_box, fill=255)
        delta = np.asarray(ImageChops.difference(before_full, after_full), dtype=np.uint8)
        changed = np.any(delta != 0, axis=2)
        outside = np.asarray(inside) == 0
        collateral = int(np.count_nonzero(changed & outside))
        changed_inside = int(np.count_nonzero(changed & ~outside))
        xrefs_after = sorted(int(info["xref"]) for info in page.get_image_info(xrefs=True))
        if collateral != 0:
            raise SystemExit(
                f"Refusing crop: {collateral} rendered pixels changed outside the mask; "
                f"mask={mask_box}, render={before_full.size}/{after_full.size}, "
                f"diff={ImageChops.difference(before_full, after_full).getbbox()}"
            )
        if changed_inside == 0:
            raise SystemExit("Target paths produced no rendered change inside the mask")
        if image_xrefs_before != xrefs_after:
            raise SystemExit("Image xrefs changed during the isolated vector-removal experiment")

        OUT.mkdir(parents=True)
        clean_crop.save(OUT / "native-vector-clean-mask.png", optimize=True)
        baseline_crop.save(OUT / "baseline-before-target-removal.png", optimize=True)
        Image.open(input_mask).convert("RGB").save(OUT / "previous-prepared-mask.png", optimize=True)
        background.crop(mask_box).save(OUT / "background-webp-source-crop.png", optimize=True)

        report = {
            "status": "candidate-specific native-vector removal evidence; not applied to canonical files",
            "candidateId": CANDIDATE_ID,
            "page": PAGE_NO,
            "symbolId": element["symbolId"],
            "sourcePdfSha256": SOURCE_PDF_SHA256,
            "sourceSidecarSha256": hashlib.sha256(sidecar_bytes).hexdigest(),
            "sourceBackgroundSha256": sha(BACKGROUND),
            "sourceMaskSha256": original_mask_hash,
            "cleanMaskSha256": sha(OUT / "native-vector-clean-mask.png"),
            "drawingIndices": element["drawingIndices"],
            "drawingSeqnosAfterTextRemoval": seqnos,
            "targetGeometryPt": [round(float(value), 6) for value in removal],
            "registeredMaskBboxPt": mask_bbox,
            "cropDimensionsPx": list(clean_crop.size),
            "renderedChangedPixelsInsideMaskAtBackgroundResolution": changed_inside,
            "renderedChangedPixelsOutsideMaskAtBackgroundResolution": collateral,
            "imageXrefsPreserved": image_xrefs_before == xrefs_after,
            "remainingTextAfterBackgroundPass": 0,
            "canonicalWrites": 0,
            "payloadWrites": 0,
            "translationWrites": 0,
            "method": "Read-only source PDF; remove text for background layer; remove only the registered drawing indices 113/114 with graphics redaction and text preserved; compare before/after page renders outside the registered mask.",
            "evidenceDirectory": str(OUT.relative_to(ROOT)),
        }
        (OUT / "experiment-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps({
            "candidateId": CANDIDATE_ID,
            "crop": list(clean_crop.size),
            "changedInsideMask": changed_inside,
            "changedOutsideMask": collateral,
            "imageXrefsPreserved": image_xrefs_before == xrefs_after,
            "cleanMaskSha256": report["cleanMaskSha256"],
            "output": str(OUT.relative_to(ROOT)),
        }, ensure_ascii=False))
    finally:
        doc.close()


if __name__ == "__main__":
    main()
