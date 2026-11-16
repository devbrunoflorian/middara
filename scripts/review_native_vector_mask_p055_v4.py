#!/usr/bin/env python3
"""Render legible, target-local comparison evidence for the p55 v2 proof."""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p055-proof-v4"
OUT = PROOF / "rendered"
SOURCE_PDF = ROOT.parent / "Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
SOURCE_SHA = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
TARGETS = {
    "p055-v89-91-n3": ("p055-v89-91-n3", (60, 440, 350, 515)),
    "p055-v92-93-n2": ("p055-v92-93-n2", (60, 440, 350, 515)),
}
SCALE = 2.5


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def crop_points(image: Image.Image, page_width: float, box: tuple[float, float, float, float]) -> Image.Image:
    scale = image.width / page_width
    coords = tuple(round(value * scale) for value in box)
    return image.crop(coords)


def render_page(pdf_path: Path, clip: tuple[float, float, float, float] | None = None) -> Image.Image:
    doc = pymupdf.open(pdf_path)
    try:
        page = doc[0] if len(doc) == 1 else doc[54]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), clip=pymupdf.Rect(clip) if clip else None, alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    finally:
        doc.close()


def load_capture(path: Path, page_width: float, clip_box: tuple[float, float, float, float]) -> Image.Image:
    image = Image.open(path).convert("RGB")
    return crop_points(image, page_width, clip_box)


def main() -> None:
    if sha(SOURCE_PDF) != SOURCE_SHA:
        raise SystemExit("Source PDF hash changed since the frozen audit")
    OUT.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 28)
    source_doc = pymupdf.open(SOURCE_PDF)
    source_page = source_doc[54]
    source_width = float(source_page.rect.width)
    source_clip_images: dict[str, Image.Image] = {}
    results = []
    try:
        for candidate_id, (folder_name, clip_box) in TARGETS.items():
            folder = PROOF / folder_name
            pdf_path = folder / "p055-en-mask-v1.pdf"
            base = folder / "capture"
            moved_clip = clip_box
            source_pix = source_page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), clip=pymupdf.Rect(clip_box), alpha=False)
            source_crop = Image.frombytes("RGB", (source_pix.width, source_pix.height), source_pix.samples)
            exported = render_page(pdf_path, clip_box)
            source_width_for_capture = source_width
            labels_and_images = [
                ("Official source PDF", source_crop),
                ("Viewer: source position", load_capture(base / "viewer-source-with-clean-vector-mask.png", source_width_for_capture, clip_box)),
                ("Viewer: target removed", load_capture(base / "viewer-empty-clean-mask.png", source_width_for_capture, clip_box)),
                ("Isolated exported PDF", exported),
                ("Viewer: moved once (new position)", load_capture(base / "viewer-moved-clean-mask.png", source_width_for_capture, moved_clip)),
            ]
            width = max(image.width for _, image in labels_and_images)
            row_h = max(image.height for _, image in labels_and_images) + 46
            montage = Image.new("RGB", (width, row_h * len(labels_and_images)), "white")
            draw = ImageDraw.Draw(montage)
            for index, (label, image) in enumerate(labels_and_images):
                y = index * row_h
                draw.text((8, y + 5), label, fill=(20, 20, 20), font=font)
                montage.paste(image, (0, y + 42))
            out_path = OUT / f"{candidate_id}-source-empty-export-moved.png"
            montage.save(out_path, optimize=True)
            results.append({
                "candidateId": candidate_id,
                "sourcePageCropPt": list(clip_box),
                "comparisonImage": str(out_path.relative_to(ROOT)).replace("\\", "/"),
                "isolatedPdf": str(pdf_path.relative_to(ROOT)).replace("\\", "/"),
                "isolatedPdfSha256": sha(pdf_path),
            })
    finally:
        source_doc.close()

    # Recheck the known disposable in-memory image-xref behavior for the exact
    # v2 source target boxes. The source PDF is never saved by this diagnostic.
    crop_report = json.loads((ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p055-v2/native-crops/experiment-report.json").read_text(encoding="utf-8"))
    xref_rows = []
    for result in crop_report["targets"]:
        page_no = int(result["page"])
        patch_path = ROOT / "output/proofs/full-symbol-integrity-2026-10-13/patches/pages" / f"page_{page_no:03d}" / "inline_elements.json"
        sidecar = json.loads(patch_path.read_text(encoding="utf-8"))
        element = next(e for e in sidecar["elements"] if e.get("provenance", {}).get("candidateId") == result["candidateId"])
        doc = pymupdf.open(SOURCE_PDF)
        try:
            page = doc[page_no - 1]
            before = page.get_image_info(xrefs=True)
            drawings = page.get_drawings()
            bboxlog = page.get_bboxlog()
            page.add_redact_annot(page.rect, fill=None)
            page.apply_redactions(images=0, graphics=0, text=0)
            render_scale = 1710 / page.rect.width
            page.get_pixmap(matrix=pymupdf.Matrix(render_scale, render_scale), alpha=False)
            removal = pymupdf.Rect(element["bbox"])
            for drawing_index in element.get("drawingIndices", []):
                drawing = drawings[int(drawing_index)]
                seq = int(drawing["seqno"])
                removal |= pymupdf.Rect(bboxlog[seq][1])
                if drawing["type"] == "fs" and seq + 1 < len(bboxlog) and bboxlog[seq + 1][0] == "stroke-path":
                    removal |= pymupdf.Rect(bboxlog[seq + 1][1])
            page.add_redact_annot(removal + (-0.2, -0.2, 0.2, 0.2), fill=None)
            page.apply_redactions(images=0, graphics=1, text=1)
            page.get_pixmap(matrix=pymupdf.Matrix(render_scale, render_scale), alpha=False)
            after = page.get_image_info(xrefs=True)
            before_counts = Counter(int(item["xref"]) for item in before)
            after_counts = Counter(int(item["xref"]) for item in after)
            changed_xrefs = sorted(xref for xref in before_counts if before_counts[xref] != after_counts[xref])
            changed_bounds = [
                {"xref": int(item["xref"]), "bbox": [round(float(v), 5) for v in item["bbox"]]}
                for item in before if int(item["xref"]) in changed_xrefs
            ]
            target = pymupdf.Rect(element["mask"]["bbox"])
            disjoint = all(not target.intersects(pymupdf.Rect(row["bbox"])) for row in changed_bounds)
            xref_rows.append({
                "candidateId": result["candidateId"],
                "imageXrefsPreserved": before_counts == after_counts,
                "sourceImageXrefs": sorted(int(item["xref"]) for item in before),
                "postRedactionImageXrefs": sorted(int(item["xref"]) for item in after),
                "changedSourceXrefs": changed_xrefs,
                "changedSourceImageBoundsPt": changed_bounds,
                "targetMaskPt": [round(float(v), 5) for v in target],
                "changedXrefBoundsDisjointFromTarget": disjoint,
                "sourcePdfSaved": False,
            })
        finally:
            doc.close()
    if sha(SOURCE_PDF) != SOURCE_SHA:
        raise SystemExit("Source PDF hash changed unexpectedly during read-only review")

    diagnostics = {
        "status": "read-only source/export visual review complete; no activation",
        "sourcePdfSha256": SOURCE_SHA,
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
        "visualComparisons": results,
        "disposableImageXrefDiagnostics": xref_rows,
    }
    (OUT / "review-diagnostics.json").write_text(json.dumps(diagnostics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"comparisons": len(results), "xrefPreserved": [x["imageXrefsPreserved"] for x in xref_rows], "report": str((OUT / "review-diagnostics.json").relative_to(ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
