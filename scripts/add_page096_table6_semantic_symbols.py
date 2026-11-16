#!/usr/bin/env python3
"""Register the eight remaining p.96 Table 6 source pictograms as inline symbols.

The official PDF is read-only. The dry run traces the vector drawings, removes
them from a disposable source-PDF copy, compares the underlays and registry SVGs
on the exact background.webp grid, and emits a small proof contact sheet.
--apply writes only the p.96 inline sidecar and eight local cleanup masks.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

import pymupdf
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_NO = 96
PAGE_DIR = ROOT / "apps/web/public/pages/page_096"
DOM_PATH = PAGE_DIR / "page_096_dom.json"
SIDE_PATH = PAGE_DIR / "inline_elements.json"
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-24/p096-inline-symbols-v1"
TMP_PROOF = ROOT / "tmp/page096-semantic-symbols-dry-run.png"
EXPECTED_PDF_SHA = "A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351"

# The drawing groups and source bounding boxes were traced against the official
# PDF by repair_page096_table6_pictograms.py. The existing shield at drawing
# 234 is already a semantic inline element and is intentionally omitted here.
TARGETS = [
    dict(name="dodge-black-die", symbolId="dice.black", bbox=[363.733, 206.031, 373.803, 217.655],
         drawingIndices=[230, 231, 232, 233], blockId="block_28", lineId="line_28_1", spanIndex=2,
         side="after", ownerLineId="line_28_1", ownerSpanIndex=1, sizePt=9.0),
    dict(name="dodge-skull", symbolId="combat.skull", bbox=[184.005, 218.427, 192.341, 229.981],
         drawingIndices=[237, 238], blockId="block_28", lineId="line_28_5", spanIndex=0,
         side="before", ownerLineId="line_28_4", ownerSpanIndex=0, sizePt=9.0),
    dict(name="empower-black-die", symbolId="dice.black", bbox=[738.232, 236.472, 748.302, 248.096],
         drawingIndices=[239, 240, 241, 242], blockId="block_32", lineId="line_32_0", spanIndex=6,
         side="after", ownerLineId="line_32_0", ownerSpanIndex=5, sizePt=9.0),
    dict(name="empower-attack-skull", symbolId="combat.skull", bbox=[649.448, 249.703, 657.784, 261.257],
         drawingIndices=[243, 244], blockId="block_33", lineId="line_33_1", spanIndex=0,
         side="before", ownerLineId="line_33_0", ownerSpanIndex=0, sizePt=9.0),
    dict(name="empower-spell-roll-symbol", symbolId="combat.page", bbox=[337.852, 276.912, 347.270, 287.084],
         drawingIndices=[245, 246], blockId="block_34", lineId="line_34_1", spanIndex=0,
         side="before", ownerLineId="line_34_0", ownerSpanIndex=1, sizePt=10.0),
    dict(name="empower-spell-black-die", symbolId="dice.black", bbox=[437.817, 277.142, 447.887, 288.765],
         drawingIndices=[247, 248, 249, 250], blockId="block_34", lineId="line_34_1", spanIndex=2,
         side="after", ownerLineId="line_34_1", ownerSpanIndex=1, sizePt=9.0),
    dict(name="empower-spell-spent-symbol", symbolId="combat.page", bbox=[613.443, 276.912, 622.861, 287.084],
         drawingIndices=[251, 252], blockId="block_34", lineId="line_34_3", spanIndex=0,
         side="before", ownerLineId="line_34_2", ownerSpanIndex=6, sizePt=10.0),
    dict(name="empower-spell-skull", symbolId="combat.skull", bbox=[675.527, 276.539, 683.863, 288.092],
         drawingIndices=[253, 254], blockId="block_34", lineId="line_34_4", spanIndex=0,
         side="before", ownerLineId="line_34_3", ownerSpanIndex=2, sizePt=9.0),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def rect_values(rect: pymupdf.Rect) -> tuple[float, float, float, float]:
    return tuple(round(value, 3) for value in (rect.x0, rect.y0, rect.x1, rect.y1))


def close_rect(left, right, tolerance=0.02):
    return len(left) == len(right) == 4 and all(abs(a - b) <= tolerance for a, b in zip(left, right))


def source_line(dom: dict, block_id: str, line_id: str) -> dict:
    block = next((item for item in dom["blocks"] if item["id"] == block_id), None)
    line = next((item for item in (block or {}).get("lines", []) if item["id"] == line_id), None)
    if line is None:
        raise ValueError(f"Stale source anchor: {block_id}/{line_id}")
    return line


def padded_mask_box(target: dict, drawings: list[dict]) -> pymupdf.Rect:
    ink = pymupdf.Rect()
    max_stroke = 0.0
    for index in target["drawingIndices"]:
        drawing = drawings[index]
        ink |= pymupdf.Rect(drawing["rect"])
        max_stroke = max(max_stroke, float(drawing.get("width") or 0))
    pad = max(0.55, max_stroke / 2 + 0.3)
    box = pymupdf.Rect(target["bbox"]) | ink
    box += (-pad, -pad, pad, pad)
    return pymupdf.Rect(math.floor(box.x0 * 4) / 4, math.floor(box.y0 * 4) / 4,
                        math.ceil(box.x1 * 4) / 4, math.ceil(box.y1 * 4) / 4)


def render_symbol(entry: dict, width_pt: float, height_pt: float, scale: float, pad_pt: float = 0.75) -> Image.Image:
    visual = entry["render"]
    view = visual["viewBox"]
    width = width_pt + 2 * pad_pt
    height = height_pt + 2 * pad_pt
    svg = ET.Element("svg", xmlns="http://www.w3.org/2000/svg", width=str(round(width * scale)),
                     height=str(round(height * scale)), viewBox=f"0 0 {width} {height}")
    group = ET.SubElement(svg, "g", transform=f"translate({pad_pt} {pad_pt}) scale({width_pt/view[2]} {height_pt/view[3]})")
    names = {"strokeWidth": "stroke-width", "fillRule": "fill-rule", "strokeLinecap": "stroke-linecap",
             "strokeLinejoin": "stroke-linejoin"}
    for path in visual["paths"]:
        ET.SubElement(group, "path", {names.get(key, key): str(value) for key, value in path.items()})
    doc = pymupdf.open("svg", ET.tostring(svg, encoding="utf-8"))
    pix = doc[0].get_pixmap(alpha=True)
    return Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)


def baseline_for_target(page: pymupdf.Page, target: dict, line: dict) -> float:
    source_lines = []
    for block in page.get_text("dict", flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)["blocks"]:
        for pdf_line in block.get("lines", []):
            spans = pdf_line.get("spans", [])
            if not spans:
                continue
            line_top = min(span["bbox"][1] for span in spans)
            line_bottom = max(span["bbox"][3] for span in spans)
            if abs((line_top + line_bottom) / 2 - (line["bbox"][1] + line["bbox"][3]) / 2) < 1.2:
                source_lines.extend(spans)
    candidates = [span for span in source_lines if span.get("text", "").strip()]
    if not candidates:
        raise ValueError(f"No PDF text baseline near {target['blockId']}/{target['lineId']}")
    anchor_span = line["spans"][target["spanIndex"]]
    expected_x = anchor_span["bbox"][0]
    same_x = [span for span in candidates if abs(span["bbox"][0] - expected_x) < 2.0]
    span = same_x[0] if same_x else min(candidates, key=lambda item: abs(item["bbox"][0] - expected_x))
    return float(span["origin"][1])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the verified p.96 semantic elements and cleanup masks")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)
    pdf_bytes = PDF.read_bytes()
    if sha(pdf_bytes) != EXPECTED_PDF_SHA:
        raise ValueError("Official PDF hash changed; refusing stale vector coordinates")

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar_bytes = SIDE_PATH.read_bytes()
    sidecar = json.loads(sidecar_bytes)
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    for target in TARGETS:
        if not any(item["id"] == target["symbolId"] for item in registry):
            raise ValueError(f"Missing registered symbol: {target['symbolId']}")
        if any(item.get("symbolId") == target["symbolId"] and item.get("region") == target["name"]
               for item in sidecar.get("elements", [])):
            raise ValueError(f"Already registered target: {target['name']}")
        target["line"] = source_line(dom, target["blockId"], target["lineId"])
        owner_line = source_line(dom, target["blockId"], target["ownerLineId"])
        if target["spanIndex"] >= len(target["line"]["spans"]) or target["ownerSpanIndex"] >= len(owner_line["spans"]):
            raise ValueError(f"Stale span anchor for {target['name']}")
        target["blockIndex"] = next(i for i, b in enumerate(dom["blocks"]) if b["id"] == target["blockId"])
        target["ownerSpanRef"] = {"lineId": target["ownerLineId"], "spanIndex": target["ownerSpanIndex"]}

    evidence = []
    with pymupdf.open(PDF) as source_doc, pymupdf.open(PDF) as mask_doc:
        source_page = source_doc[PAGE_NO - 1]
        mask_page = mask_doc[PAGE_NO - 1]
        if (abs(source_page.rect.width - dom["width"]) > 0.05 or abs(source_page.rect.height - dom["height"]) > 0.05):
            raise ValueError("Page PDF and PageDOM geometry differ")
        background = Image.open(PAGE_DIR / "background.webp").convert("RGB")
        scale_x = background.width / source_page.rect.width
        scale_y = background.height / source_page.rect.height
        if abs(scale_x - scale_y) > 1e-9:
            raise ValueError("background.webp is not on an isotropic source-PDF grid")
        drawings = source_page.get_drawings()
        paint_bounds = source_page.get_bboxlog()
        for target in TARGETS:
            target["maskBox"] = padded_mask_box(target, drawings)
            icon_box = pymupdf.Rect(target["bbox"])
            for index in target["drawingIndices"]:
                if index >= len(drawings):
                    raise ValueError(f"Stale vector drawing {index} in {target['name']}")
                drawing_box = drawings[index]["rect"]
                if any((drawing_box.x0 < icon_box.x0 - 0.02,
                        drawing_box.y0 < icon_box.y0 - 0.02,
                        drawing_box.x1 > icon_box.x1 + 0.02,
                        drawing_box.y1 > icon_box.y1 + 0.02)):
                    raise ValueError(f"Stale vector drawing {index} outside {target['name']} bbox")
            # Text is removed from this disposable PDF copy before symbols are
            # erased, so the cleanup patch cannot delete a neighboring glyph.
        for text_block in mask_page.get_text("blocks"):
            if text_block[4].strip():
                mask_page.add_redact_annot(pymupdf.Rect(text_block[:4]), fill=None)
        mask_page.apply_redactions(images=0, graphics=0, text=0)
        textless_pix = mask_page.get_pixmap(matrix=pymupdf.Matrix(scale_x, scale_y), alpha=False)
        textless_page = Image.frombytes("RGB", (textless_pix.width, textless_pix.height), textless_pix.samples)

        # Remove only the traced drawing groups. The remainder of page art and
        # the original background pixels remain untouched.
        for target in TARGETS:
            removal = pymupdf.Rect(target["bbox"])
            for index in target["drawingIndices"]:
                drawing = drawings[index]
                seq = drawing["seqno"]
                removal |= pymupdf.Rect(paint_bounds[seq][1])
                if drawing["type"] == "fs" and seq + 1 < len(paint_bounds) and paint_bounds[seq + 1][0] == "stroke-path":
                    removal |= pymupdf.Rect(paint_bounds[seq + 1][1])
            mask_page.add_redact_annot(removal + (-0.3, -0.3, 0.3, 0.3), fill=None)
            mask_page.apply_redactions(images=0, graphics=1, text=1)
            for index in target["drawingIndices"]:
                source_rect = rect_values(drawings[index]["rect"])
                if any(rect_values(item["rect"]) == source_rect for item in mask_page.get_drawings()):
                    raise ValueError(f"Vector {index} remains after local removal")

        clean_pix = mask_page.get_pixmap(matrix=pymupdf.Matrix(scale_x, scale_y), alpha=False)
        clean_page = Image.frombytes("RGB", (clean_pix.width, clean_pix.height), clean_pix.samples)
        if clean_page.size != background.size:
            raise ValueError("Clean source layer does not match background.webp grid")

        existing_names = {Path(item.get("mask", {}).get("url", "")).name for item in sidecar.get("elements", [])}
        next_mask = max([int(name.removeprefix("inline-element-mask-").removesuffix(".png"))
                         for name in existing_names if name.startswith("inline-element-mask-")
                         and name.endswith(".png") and name.removeprefix("inline-element-mask-").removesuffix(".png").isdigit()] + [-1]) + 1
        new_elements = []
        patches = []
        metrics_report = []
        for offset, target in enumerate(TARGETS):
            bbox = pymupdf.Rect(target["bbox"])
            line = target["line"]
            baseline = baseline_for_target(source_page, target, line)
            size_pt = float(target["sizePt"])
            box = target["maskBox"]
            pixel_box = tuple(round(v * scale_x) for v in (box.x0, box.y0, box.x1, box.y1))
            # The committed background.webp contains a stale hollow icon at
            # these coordinates. Compare against the source PDF's own
            # textless render (the same source that produced the fidelity
            # overlay), not that derived background asset.
            source_crop = textless_page.crop(pixel_box)
            clean_crop = clean_page.crop(pixel_box)
            if source_crop.size != clean_crop.size or source_crop.width == 0 or source_crop.height == 0:
                raise ValueError(f"Invalid cleanup crop for {target['name']}")
            symbol = next(entry for entry in registry if entry["id"] == target["symbolId"])
            rendered = render_symbol(symbol, bbox.width, bbox.height, scale_x)
            composite = clean_crop.convert("RGBA")
            composite.alpha_composite(rendered, (round((bbox.x0-box.x0-0.75)*scale_x),
                                                 round((bbox.y0-box.y0-0.75)*scale_y)))
            rendered_rgb = composite.convert("RGB")
            # A local comparison is informative, while the surrounding patch
            # must remain byte-for-byte identical away from source icon ink.
            source_diff = ImageChops.difference(source_crop, clean_crop).convert("L").point(lambda p: 255 if p > 24 else 0)
            semantic_diff = ImageChops.difference(rendered_rgb, clean_crop).convert("L").point(lambda p: 255 if p > 24 else 0)
            source_pixels = {(x, y) for y in range(source_diff.height) for x in range(source_diff.width) if source_diff.getpixel((x,y))}
            semantic_pixels = {(x, y) for y in range(semantic_diff.height) for x in range(semantic_diff.width) if semantic_diff.getpixel((x,y))}
            union = source_pixels | semantic_pixels
            iou = len(source_pixels & semantic_pixels) / len(union) if union else 0.0
            outside_change = ImageChops.difference(clean_crop, clean_page.crop(pixel_box)).getbbox()
            semantic_match = bool(source_pixels and semantic_pixels and iou >= 0.72)

            mask_name = f"inline-element-mask-{next_mask+offset:03d}.png"
            mask_url = f"/pages/page_096/{mask_name}"
            size = (bbox.x1-bbox.x0, bbox.y1-bbox.y0)
            metrics = {
                "widthEm": round(size[0] / size_pt, 9),
                "heightEm": round(size[1] / size_pt, 9),
                "advanceEm": round(size[0] / size_pt, 9),
                "verticalAlignEm": round((bbox.y1-baseline) / size_pt, 9),
            }
            element = {
                "symbolId": target["symbolId"],
                "sourceRendering": "semantic-inline",
                "bbox": target["bbox"],
                "drawingIndices": target["drawingIndices"],
                "anchor": {
                    "blockId": target["blockId"], "blockIndex": target["blockIndex"],
                    "lineId": target["lineId"], "spanIndex": target["spanIndex"], "side": target["side"],
                    "sizePt": size_pt, "ownerSpanRef": target["ownerSpanRef"], "gapPt": 0,
                },
                "metrics": metrics,
                "color": "#231f20",
                "mask": {"url": mask_url, "bbox": [box.x0, box.y0, box.x1, box.y1]},
                "provenance": {
                    "auditId": "p096-inline-symbols-2026-10-24-v1",
                    "candidateId": target["name"],
                    "sourcePdfSha256": EXPECTED_PDF_SHA,
                    "sourceObjects": target["drawingIndices"],
                    "semanticSvgIoU24": round(iou, 4),
                    "maskSha256": None,
                },
            }
            new_elements.append(element)
            patches.append((mask_name, clean_crop))
            metrics_report.append({"region": target["name"], "symbolId": target["symbolId"],
                                   "drawingIndices": target["drawingIndices"], "bboxPt": target["bbox"],
                                   "maskBBoxPt": [box.x0, box.y0, box.x1, box.y1],
                                   "gridPixelBox": list(pixel_box), "semanticSvgIoU24": round(iou, 4),
                                   "semanticSvgMatch": semantic_match,
                                   "sizePt": size_pt, "baselinePt": round(baseline, 4), "metrics": metrics})

            scale = 5
            row = Image.new("RGB", (source_crop.width * scale * 3 + 48, source_crop.height * scale + 42), "#f4f0e8")
            draw = ImageDraw.Draw(row)
            draw.text((4, 3), f"{target['symbolId']} · {target['name']} · IoU {iou:.3f}", fill="#111111")
            labels = ["PDF icon (textless)", "Exact-PDF underlay", "Underlay + registered SVG"]
            for i, label in enumerate(labels): draw.text((8+i*source_crop.width*scale, 19), label, fill="#333333")
            row.paste(source_crop.resize((source_crop.width*scale,source_crop.height*scale),Image.Resampling.NEAREST),(8,34))
            row.paste(clean_crop.resize((clean_crop.width*scale,clean_crop.height*scale),Image.Resampling.NEAREST),(16+source_crop.width*scale,34))
            row.paste(rendered_rgb.resize((rendered_rgb.width*scale,rendered_rgb.height*scale),Image.Resampling.NEAREST),(24+source_crop.width*scale*2,34))
            evidence.append(row)

        contact = Image.new("RGB", (max(row.width for row in evidence), sum(row.height for row in evidence)), "#e4e0d8")
        y = 0
        for row in evidence:
            contact.paste(row, (0,y)); y += row.height

        # Verify that vector erasure did not alter pixels outside the padded
        # masks when compared on the app's exact background raster grid.
        permitted = Image.new("L", background.size, 0)
        draw = ImageDraw.Draw(permitted)
        for target in TARGETS:
            box = target["maskBox"]
            draw.rectangle((round(box.x0*scale_x),round(box.y0*scale_y),round(box.x1*scale_x)-1,round(box.y1*scale_y)-1),fill=255)
        delta = ImageChops.difference(textless_page, clean_page).convert("RGB")
        outside = ImageChops.invert(permitted)
        outside_diff = ImageChops.multiply(delta.convert("L"), outside)
        outside_pixels = sum(1 for v in outside_diff.getdata() if v > 8)
        if outside_pixels:
            raise ValueError(f"Source underlay changed {outside_pixels} pixels outside target masks")

    mode = "apply" if args.apply else "dry-run"
    mismatched = [item["region"] for item in metrics_report if not item["semanticSvgMatch"]]
    if args.apply and mismatched:
        raise ValueError(f"Refusing to apply semantic icons with SVG mismatch: {', '.join(mismatched)}")
    if not args.apply:
        TMP_PROOF.parent.mkdir(parents=True, exist_ok=True)
        contact.save(TMP_PROOF, optimize=True)
        print(json.dumps({"mode": mode, "targets": metrics_report, "outsideMaskPixelsOver8": outside_pixels,
                          "dryRunProof": str(TMP_PROOF.relative_to(ROOT))}, ensure_ascii=False, indent=2))
        return

    for target, element in zip(TARGETS, new_elements):
        if any(item.get("symbolId") == element["symbolId"] and item.get("anchor", {}).get("lineId") == element["anchor"]["lineId"]
               and item.get("bbox") == element["bbox"] for item in sidecar.get("elements", [])):
            raise ValueError(f"Duplicate inline element detected before apply: {target['name']}")
    rollback = PROOF / "rollback"
    rollback.mkdir(parents=True, exist_ok=True)
    (rollback / "inline_elements.before.json").write_bytes(sidecar_bytes)
    for name, crop in patches:
        destination = PAGE_DIR / name
        if destination.exists():
            raise FileExistsError(f"Refusing to overwrite existing cleanup mask: {destination}")
        buffer=io.BytesIO(); crop.save(buffer, format="PNG", optimize=True); data=buffer.getvalue()
        destination.write_bytes(data)
        for element in new_elements:
            if Path(element["mask"]["url"]).name == name:
                element["provenance"]["maskSha256"] = sha(data)
    sidecar["elements"].extend(new_elements)
    SIDE_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    proof_path = PROOF / "p096-source-symbol-underlays-before-after.png"
    PROOF.mkdir(parents=True, exist_ok=True)
    contact.save(proof_path, optimize=True)
    manifest = {
        "status": "applied", "page": PAGE_NO, "sourcePdfSha256": EXPECTED_PDF_SHA,
        "method": "Verified source PDF vector groups removed only in a disposable PDF copy; exact underlay crops aligned to background.webp source grid; registry SVG compared to original icon pixels.",
        "elementsAdded": metrics_report, "outsideMaskPixelsOver8": outside_pixels,
        "payloadWrites": 0, "translationWrites": 0,
        "rollback": {"restoreSidecar": str((rollback / "inline_elements.before.json").relative_to(ROOT)),
                     "removeNewMasks": [str((PAGE_DIR / name).relative_to(ROOT)) for name, _ in patches]},
        "evidence": str(proof_path.relative_to(ROOT)),
    }
    (PROOF / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
