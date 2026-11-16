#!/usr/bin/env python3
"""Stage the already prepared 111 placements and refine only the cited masks.

This consumes the closed audit manifest and patch package; it performs no
candidate discovery and does not modify canonical page data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil

import pymupdf as fitz
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "output/proofs/full-symbol-integrity-2026-10-13"
DEST = ROOT / "output/proofs/symbol-activation-2026-10-13"
REFINE = {
    85: ["p085-v96-99-n4", "p085-v108-111-n4"],
    92: ["p092-v185-186-187", "p092-v188-189", "p092-v190"],
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def alpha_from_svg(path: Path, target_size: tuple[int, int]) -> Image.Image:
    doc = fitz.open(stream=path.read_bytes(), filetype="svg")
    try:
        page = doc[0]
        pix = page.get_pixmap(matrix=fitz.Matrix(4, 4), alpha=True)
        rgba = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
        if rgba.size != target_size:
            rgba = rgba.resize(target_size, Image.Resampling.LANCZOS)
        return rgba.getchannel("A").filter(ImageFilter.MaxFilter(3))
    finally:
        doc.close()


def refine_element(page: int, element: dict, folder: Path) -> dict:
    cid = element["provenance"]["candidateId"]
    original_name = Path(element["mask"]["url"]).name
    base_path = folder / original_name
    svg_path = folder / Path(element["metrics"]["sourceAssetUrl"]).name
    base = Image.open(base_path).convert("RGB")
    alpha = alpha_from_svg(svg_path, (round(element["bbox"][2] * 4) - round(element["bbox"][0] * 4),
                                     round(element["bbox"][3] * 4) - round(element["bbox"][1] * 4)))
    mask_bbox = element["mask"]["bbox"]
    x0, y0, x1, y1 = element["bbox"]
    left = round((x0 - mask_bbox[0]) * 4)
    top = round((y0 - mask_bbox[1]) * 4)
    canvas_alpha = Image.new("L", base.size, 0)
    # The exact source paint geometry is the mask. A one-pixel dilation removes
    # antialias fringes while leaving pixels outside the glyph untouched.
    canvas_alpha.paste(alpha, (left, top))
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    out.paste(base, (0, 0))
    out.putalpha(canvas_alpha)
    name = f"audit-mask-refined-{cid}.png"
    destination = folder / name
    out.save(destination, optimize=True)
    element["mask"]["url"] = f"/pages/page_{page:03d}/{name}"
    element["provenance"]["maskSha256"] = sha(destination)
    return {"page": page, "candidateId": cid, "maskFile": name, "maskSha256": sha(destination),
            "maskCanvasPx": list(out.size), "sourcePaintAlphaPx": list(alpha.size),
            "sourceSvgSha256": sha(svg_path), "basedOnOriginalCleanMaskSha256": sha(base_path),
            "method": "4x source SVG paint alpha, 1px dilation, source-PDF-clean background RGB; transparent elsewhere"}


def build_visual_crops(page: int, elements: list[dict], page_folder: Path, output: Path) -> list[dict]:
    dom = read(ROOT / f"apps/web/public/pages/page_{page:03d}/page_{page:03d}_dom.json")
    page_width = dom.get("width", 820.346)
    factor = Image.open(ROOT / f"apps/web/public/pages/page_{page:03d}/background.webp").width / page_width
    background = Image.open(ROOT / f"apps/web/public/pages/page_{page:03d}/background.webp").convert("RGBA")
    changed = background.copy()
    results = []
    for e in elements:
        provenance = e.get("provenance") or {}
        cid = provenance.get("candidateId")
        if cid not in REFINE.get(page, []):
            continue
        x0, y0, x1, y1 = e["mask"]["bbox"]
        left, top, right, bottom = (round(x0 * factor), round(y0 * factor), round(x1 * factor), round(y1 * factor))
        mask = Image.open(page_folder / Path(e["mask"]["url"]).name).convert("RGBA")
        mask = mask.resize((right - left, bottom - top), Image.Resampling.LANCZOS)
        changed.alpha_composite(mask, (left, top))
        pad = round(3 * factor)
        crop_box = (max(0, left-pad), max(0, top-pad), min(background.width, right+pad), min(background.height, bottom+pad))
        before = background.crop(crop_box).convert("RGB")
        after = changed.crop(crop_box).convert("RGB")
        before.save(output / f"p{page:03d}-{cid}-before.png")
        after.save(output / f"p{page:03d}-{cid}-after.png")
        results.append({"page": page, "candidateId": cid, "coordinateScale": factor,
                        "beforeCapture": f"p{page:03d}-{cid}-before.png", "afterCapture": f"p{page:03d}-{cid}-after.png",
                        "captureType": "source background.webp with staged alpha mask composited"})
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit-root", type=Path, default=AUDIT)
    parser.add_argument("--output-root", type=Path, default=DEST)
    args = parser.parse_args()
    source_patch_root = args.audit_root / "patches"
    output_root = args.output_root
    output_root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source_patch_root, output_root / "patches", dirs_exist_ok=True)
    (output_root / "captures").mkdir(exist_ok=True)
    manifest = read(output_root / "patches/patch-manifest.json")
    refined, captures = [], []
    for page, ids in REFINE.items():
        folder = output_root / "patches" / "pages" / f"page_{page:03d}"
        side_path = folder / "inline_elements.json"
        side = read(side_path)
        by_id = {(e.get("provenance") or {}).get("candidateId"): e for e in side["elements"]}
        for cid in ids:
            element = by_id.get(cid)
            if element is None:
                raise ValueError(f"missing existing prepared candidate {cid}")
            refined.append(refine_element(page, element, folder))
        side_path.write_text(json.dumps(side, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        page_plan = next(p for p in manifest["pages"] if p["page"] == page)
        page_plan["preparedSidecarSha256"] = sha(side_path)
        captures.extend(build_visual_crops(page, side["elements"], folder, output_root / "captures"))
    (output_root / "patches/patch-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {"status": "staged-only; canonical sidecars/assets unchanged", "sourceAudit": str(args.audit_root),
              "sourceManifestSha256": sha(source_patch_root / "patch-manifest.json"),
              "placementCount": manifest["placementCount"], "pageCount": manifest["pageCount"],
              "refinedMasks": refined, "capturePairs": captures,
              "visualDisposition": {"p85": "staged exact-shape alpha cleanup; needs Viewer/PDF comparison",
                                    "p92": "staged exact-shape alpha cleanup; needs Viewer/PDF comparison; not application-ready until texture seam passes"}}
    (output_root / "mask-refinement-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"outputRoot": str(output_root), "placementCount": report["placementCount"],
                      "refinedMaskCount": len(refined), "captures": len(captures),
                      "canonicalChanged": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
