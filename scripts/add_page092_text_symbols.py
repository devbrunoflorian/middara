#!/usr/bin/env python3
"""Prepare or register the source-traced inline symbols in p.92.

The official PDF and Payload are read-only. By default this performs a dry run;
--apply updates only the p.92 inline sidecar, its local cleanup/source assets,
and a compact rollback/evidence bundle.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import shutil

import numpy as np
import pymupdf
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_092"
DOM_PATH = PAGE / "page_092_dom.json"
SIDE_PATH = PAGE / "inline_elements.json"
PROOF_SOURCE = ROOT / "output/proofs/full-symbol-integrity-2026-10-13/patches/pages/page_092"
PROOF_DIR = ROOT / "output/proofs/translation-readiness-2026-10-24/p092-inline-symbols-v1"

TARGETS = [
    ("combat.shield", [185, 186, 187], "block_16", "line_16_1", 0, "after", 1, 0, "p092-v185-186-187"),
    ("combat.page", [188, 189], "block_16", "line_16_2", 0, "after", 2, 0, "p092-v188-189"),
    ("combat.damage-star", [190], "block_16", "line_16_3", 2, "after", 3, 2, "p092-v190"),
    ("attack.melee", [191, 192], "block_18", "line_18_0", 0, "before", 4, 0, "p092-v191-192"),
    ("attack.melee", [193, 194], "block_18", "line_18_2", 0, "after", 5, 0, "p092-v193-194"),
    ("attack.ranged", [195, 196], "block_19", "line_19_0", 0, "before", 6, 0, "p092-v195-196"),
    ("attack.ranged", [197, 198], "block_19", "line_19_2", 0, "after", 7, 0, "p092-v197-198"),
    ("attack.melee-ranged", [199, 200, 201, 202], "block_20", "line_20_0", 0, "before", 8, 0, "p092-v199-200-201-202"),
    # The existing block_20 melee placement is preserved and receives a fresh exact-source mask.
    ("attack.melee", [203, 204], "block_20", "line_20_3", 0, "before", None, None, None),
    ("attack.ranged", [205, 206], "block_20", "line_20_3", 0, "after", 9, 0, "p092-v205-206"),
    ("dice.purple", [207, 208, 209, 210], "block_27", "line_27_4", 2, "after", None, None, "p092-v207-210"),
    ("dice.black", [211, 212, 213, 214], "block_32", "line_32_3", 0, "before", 10, 0, "p092-v211-212-213-214"),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def block_index(dom: dict, block_id: str) -> int:
    matches = [i for i, block in enumerate(dom["blocks"]) if block["id"] == block_id]
    if len(matches) != 1:
        raise ValueError(f"Source block anchor is not unique: {block_id}")
    return matches[0]


def find_line(dom: dict, block_id: str, line_id: str) -> dict:
    block = next((b for b in dom["blocks"] if b["id"] == block_id), None)
    if not block:
        raise ValueError(f"Source block disappeared: {block_id}")
    line = next((line for line in block["lines"] if line["id"] == line_id), None)
    if not line:
        raise ValueError(f"Source line disappeared: {line_id}")
    return line


def target_redaction_box(page: pymupdf.Page, source_page: pymupdf.Page, ids: list[int]) -> pymupdf.Rect:
    drawings = source_page.get_drawings()
    paint_bounds = source_page.get_bboxlog()
    box = pymupdf.Rect()
    for index in ids:
        if index >= len(drawings):
            raise ValueError(f"PDF source drawing index changed: {index}")
        drawing = drawings[index]
        seq = drawing["seqno"]
        box |= pymupdf.Rect(drawing["rect"])
        box |= pymupdf.Rect(paint_bounds[seq][1])
        if (drawing["type"] == "fs" and seq + 1 < len(paint_bounds)
                and paint_bounds[seq + 1][0] == "stroke-path"):
            box |= pymupdf.Rect(paint_bounds[seq + 1][1])
    return box + (-0.3, -0.3, 0.3, 0.3)


def make_elements(dom: dict, existing: dict, prepared: dict, scale_x: float, scale_y: float,
                  before: np.ndarray, clean: np.ndarray, source_sha: str) -> tuple[list[dict], list[dict]]:
    elements: list[dict] = []
    metrics: list[dict] = []
    for n, (symbol_id, drawing_ids, block_id, line_id, span_index, side,
            prepared_index, expected_index, audit_id) in enumerate(TARGETS):
        index = block_index(dom, block_id)
        line = find_line(dom, block_id, line_id)
        if span_index >= len(line["spans"]):
            raise ValueError(f"Anchor span changed: {block_id}/{line_id}/{span_index}")

        if prepared_index is not None:
            source_element = json.loads(json.dumps(prepared["elements"][prepared_index]))
            if (source_element.get("symbolId") != symbol_id
                    or source_element.get("anchor", {}).get("blockId") != block_id
                    or source_element.get("anchor", {}).get("lineId") != line_id):
                raise ValueError(f"Prepared source mapping differs for {symbol_id} at {block_id}/{line_id}")
        elif audit_id is None:
            # The user's existing block_20 placement is retained byte-for-byte except for its source mask/appearance metadata.
            matches = [e for e in existing.get("elements", [])
                       if e.get("symbolId") == symbol_id
                       and e.get("anchor", {}).get("blockId") == block_id
                       and e.get("anchor", {}).get("lineId") == line_id]
            if len(matches) != 1:
                raise ValueError("The existing p.92 block_20 melee symbol mapping is missing or duplicated")
            source_element = json.loads(json.dumps(matches[0]))
        else:
            source_element = {
                "symbolId": symbol_id,
                "bbox": [255.04319763183594, 744.7830810546875, 266.53118896484375, 758.0421142578125],
                "drawingIndices": drawing_ids,
                "anchor": {
                    "blockId": block_id, "blockIndex": index, "lineId": line_id,
                    "spanIndex": span_index, "side": side, "sizePt": 10.0,
                    "ownerSpanRef": {"lineId": line_id, "spanIndex": 1},
                },
                "metrics": {
                    "widthEm": 1.1487998962402344,
                    "heightEm": 1.3259002685546875,
                    "verticalAlignEm": 0.1125,
                    "renderVariant": "purple-p66-prose-die-source",
                },
            }

        if source_element.get("drawingIndices") != drawing_ids:
            raise ValueError(f"Source drawing ownership differs for {symbol_id}: {source_element.get('drawingIndices')}")
        if source_element["anchor"].get("blockIndex") != index:
            raise ValueError(f"Source block index changed at {block_id}")
        source_element["sourceRendering"] = "semantic-inline"

        # Derive a tight cleanup crop from pixels that actually changed when only this
        # source vector was removed from the same PDF render. Add two raster pixels
        # for antialiasing, then align the CSS bbox to background.webp's exact grid.
        bbox = pymupdf.Rect(source_element["bbox"])
        px0 = max(0, math.floor(bbox.x0 * scale_x) - 5)
        py0 = max(0, math.floor(bbox.y0 * scale_y) - 5)
        px1 = min(clean.shape[1], math.ceil(bbox.x1 * scale_x) + 5)
        py1 = min(clean.shape[0], math.ceil(bbox.y1 * scale_y) + 5)
        diff = np.max(np.abs(before[py0:py1, px0:px1].astype(np.int16)
                             - clean[py0:py1, px0:px1].astype(np.int16)), axis=2)
        ys, xs = np.where(diff > 5)
        if not len(xs):
            raise ValueError(f"No source pixels changed after removing {symbol_id} drawing group {drawing_ids}")
        changed_box = (px0 + int(xs.min()), py0 + int(ys.min()),
                       px0 + int(xs.max()) + 1, py0 + int(ys.max()) + 1)
        expected = (bbox.x0 * scale_x, bbox.y0 * scale_y, bbox.x1 * scale_x, bbox.y1 * scale_y)
        if (changed_box[0] < expected[0] - 3 or changed_box[1] < expected[1] - 3
                or changed_box[2] > expected[2] + 3 or changed_box[3] > expected[3] + 3):
            raise ValueError(f"Removal changed pixels beyond the traced icon: {symbol_id} {changed_box} vs {expected}")
        left, top = max(0, changed_box[0] - 2), max(0, changed_box[1] - 2)
        right, bottom = min(clean.shape[1], changed_box[2] + 2), min(clean.shape[0], changed_box[3] + 2)
        is_existing_melee = block_id == "block_20" and line_id == "line_20_3" and symbol_id == "attack.melee"
        mask_name = "inline-element-mask-000.png" if is_existing_melee else f"inline-element-mask-p092-{n + 1:03d}.png"
        mask_url = f"/pages/page_092/{mask_name}"
        source_element["mask"] = {
            "url": mask_url,
            "bbox": [left / scale_x, top / scale_y, right / scale_x, bottom / scale_y],
        }
        if symbol_id.startswith("attack."):
            source_element["mask"]["clipShape"] = "circle"

        if symbol_id == "dice.purple":
            # The p.92 die's paths and metrics match the already registered p.66
            # prose-die variant; keep the existing semantic ID and source appearance.
            owner = line["spans"][1]
            origin = owner.get("origin")
            if not origin or abs((bbox.y1 - float(origin[1])) / 10.0 - source_element["metrics"]["verticalAlignEm"]) > 0.5:
                raise ValueError("Purple die baseline no longer matches its explicit PURPLE text owner")
            source_element["anchor"]["gapPt"] = round(bbox.x0 - float(line["spans"][2]["bbox"][2]), 6)
            source_element["metrics"]["verticalAlignEm"] = round((bbox.y1 - float(origin[1])) / 10.0, 6)
            source_element["metrics"]["widthEm"] = round(bbox.width / 10.0, 9)
            source_element["metrics"]["heightEm"] = round(bbox.height / 10.0, 9)

        if is_existing_melee:
            # Keep the existing occurrence's measured advance/anchor, while using
            # the exact source SVG captured for the same melee-die family.
            exemplar = prepared["elements"][5]
            source_element["metrics"]["sourceAssetUrl"] = exemplar["metrics"]["sourceAssetUrl"]
            source_element["metrics"]["renderVariant"] = exemplar["metrics"]["renderVariant"]
            source_element["metrics"]["sourceAppearanceKey"] = exemplar["metrics"]["sourceAppearanceKey"]

        if source_element.get("metrics") is None:
            raise ValueError(f"Source metrics missing for {symbol_id}")
        source_element["provenance"] = {
            "auditId": "p092-inline-symbols-2026-10-24-v1",
            "candidateId": audit_id or f"p092-existing-{symbol_id.replace('.', '-')}-{block_id}-{line_id}",
            "sourcePdfSha256": source_sha,
            "sourceObjects": drawing_ids,
            "sourcePixelBounds": list(changed_box),
            "maskSha256": None,
            "assetSha256": None,
        }
        elements.append(source_element)
        metrics.append({
            "symbolId": symbol_id, "blockId": block_id, "lineId": line_id,
            "drawingIndices": drawing_ids, "changedPixelBounds": list(changed_box),
            "cleanupPixelBounds": [left, top, right, bottom],
            "cleanupBboxPt": source_element["mask"]["bbox"], "maskName": mask_name,
        })
    return elements, metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the verified p.92 sidecar, masks, and source SVGs")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)

    dom = read_json(DOM_PATH)
    existing = read_json(SIDE_PATH)
    prepared = read_json(PROOF_SOURCE / "inline_elements.json")
    for block_id, line_id, span_index, symbol_id in [
        ("block_27", "line_27_4", 1, "dice.purple"),
        ("block_27", "line_27_4", 2, "dice.purple"),
    ]:
        line = find_line(dom, block_id, line_id)
        if symbol_id == "dice.purple" and span_index == 1 and line["spans"][span_index]["text"] != "PURPLE":
            raise ValueError("Purple die label anchor changed")
        if symbol_id == "dice.purple" and span_index == 2 and line["spans"][span_index]["text"] != " ":
            raise ValueError("Purple die trailing-space anchor changed")

    current_bytes = SIDE_PATH.read_bytes()
    source_sha = sha(PDF.read_bytes())
    with pymupdf.open(PDF) as source_doc, pymupdf.open(PDF) as mask_doc:
        source_page = source_doc[91]
        mask_page = mask_doc[91]
        background = Image.open(PAGE / "background.webp").convert("RGB")
        scale_x = background.width / source_page.rect.width
        scale_y = background.height / source_page.rect.height
        if abs(scale_x - scale_y) > 1e-9:
            raise ValueError("The page background raster is not an isotropic source grid")

        # Hide the PDF text only in this disposable document, as in the proven
        # p.98 source-mask method. Images and non-target page art are untouched.
        for text_block in mask_page.get_text("blocks"):
            if text_block[4].strip():
                mask_page.add_redact_annot(pymupdf.Rect(text_block[:4]), fill=None)
        mask_page.apply_redactions(images=0, graphics=0, text=0)
        before_pix = mask_page.get_pixmap(matrix=pymupdf.Matrix(scale_x, scale_y), alpha=False)
        before = np.frombuffer(before_pix.samples, dtype=np.uint8).reshape(before_pix.height, before_pix.width, 3).copy()
        if before.shape[:2] != (background.height, background.width):
            raise ValueError("The clean-source render does not align with background.webp")

        redaction_boxes = []
        for (symbol_id, drawing_ids, *_rest) in TARGETS:
            box = target_redaction_box(source_page, source_page, drawing_ids)
            redaction_boxes.append((symbol_id, drawing_ids, box))
            mask_page.add_redact_annot(box, fill=None)
            mask_page.apply_redactions(images=0, graphics=1, text=1)
            for index in drawing_ids:
                source_rect = tuple(round(v, 3) for v in source_page.get_drawings()[index]["rect"])
                if any(tuple(round(v, 3) for v in item["rect"]) == source_rect for item in mask_page.get_drawings()):
                    raise ValueError(f"Target source vector remains after local removal: {symbol_id} drawing {index}")

        clean_pix = mask_page.get_pixmap(matrix=pymupdf.Matrix(scale_x, scale_y), alpha=False)
        clean = np.frombuffer(clean_pix.samples, dtype=np.uint8).reshape(clean_pix.height, clean_pix.width, 3).copy()
        if clean.shape != before.shape:
            raise ValueError("The source clean render changed size")

        elements, symbol_metrics = make_elements(dom, existing, prepared, scale_x, scale_y, before, clean, source_sha)
        changed = np.max(np.abs(before.astype(np.int16) - clean.astype(np.int16)), axis=2) > 5
        permitted = np.zeros(changed.shape, dtype=bool)
        for row in symbol_metrics:
            x0, y0, x1, y1 = row["cleanupPixelBounds"]
            permitted[y0:y1, x0:x1] = True
        collateral = int(np.count_nonzero(changed & ~permitted))
        if collateral:
            raise ValueError(f"Source vector removal changed {collateral} pixels outside the traced symbol cleanup regions")

        background_array = np.asarray(background, dtype=np.int16)
        delta = np.abs(clean.astype(np.int16) - background_array)
        outside = ~permitted
        outside_max = delta.max(axis=2)[outside]
        comparison = {
            "backgroundGridPx": list(background.size),
            "pageSizePt": [source_page.rect.width, source_page.rect.height],
            "gridScale": [scale_x, scale_y],
            "outsideMaskPixelsOver8RgbLevels": int(np.count_nonzero(outside_max > 8)),
            "outsideMaskPctOver8RgbLevels": round(float(np.mean(outside_max > 8) * 100), 6),
            "outsideMaskMeanAbsoluteRgbDelta": round(float(delta[outside].mean()), 6),
            "sourceRemovalCollateralPixelsOver5": collateral,
        }
        if comparison["outsideMaskPctOver8RgbLevels"] > 2.5 or comparison["outsideMaskMeanAbsoluteRgbDelta"] > 3.0:
            raise ValueError(f"The exact-source clean page diverges from background.webp outside masks: {comparison}")

    symbols_by_prepared = {entry.get("provenance", {}).get("candidateId"): entry
                           for entry in prepared.get("elements", [])}
    asset_writes = []
    asset_bytes_by_url = {}
    for element in elements:
        source_url = (element.get("metrics") or {}).get("sourceAssetUrl")
        if source_url:
            old_name = Path(source_url).name
            source_asset = PROOF_SOURCE / old_name
            if not source_asset.is_file():
                raise FileNotFoundError(source_asset)
            if source_url.startswith("/pages/page_092/audit-source-"):
                new_name = "source-inline-p092-" + old_name.removeprefix("audit-source-")
            else:
                raise ValueError(f"Unexpected prepared source asset URL: {source_url}")
            new_url = f"/pages/page_092/{new_name}"
            element["metrics"]["sourceAssetUrl"] = new_url
            asset_bytes = source_asset.read_bytes()
            asset_bytes_by_url[new_url] = asset_bytes
            asset_writes.append({"name": new_name, "bytes": asset_bytes})
            element["provenance"]["assetSha256"] = sha(asset_bytes)

    new_sidecar = {"schemaVersion": 1, "elements": elements}
    mask_images = {}
    mask_bytes = {}
    for element, metric in zip(elements, symbol_metrics):
        left, top, right, bottom = metric["cleanupPixelBounds"]
        name = metric["maskName"]
        mask_images[name] = Image.fromarray(clean[top:bottom, left:right].copy(), mode="RGB")
        encoded = io.BytesIO()
        mask_images[name].save(encoded, format="PNG", optimize=True)
        mask_bytes[name] = encoded.getvalue()
        element["provenance"]["maskSha256"] = sha(mask_bytes[name])

    contact_rows = []
    webp_array = np.asarray(background)
    for element, metric in zip(elements, symbol_metrics):
        left, top, right, bottom = metric["cleanupPixelBounds"]
        src_crop = Image.fromarray(webp_array[top:bottom, left:right].copy(), mode="RGB")
        clean_crop = mask_images[metric["maskName"]]
        scale = 8
        target_h = max(src_crop.height, clean_crop.height) * scale
        row = Image.new("RGB", (max(src_crop.width, clean_crop.width) * scale * 2 + 180, target_h + 28), "#f7f4ef")
        draw = ImageDraw.Draw(row)
        draw.text((4, 4), f"{element['symbolId']} · {element['anchor']['blockId']}", fill="#111111")
        draw.text((4, 15), "background / source", fill="#333333")
        draw.text((max(src_crop.width, clean_crop.width) * scale + 24, 15), "exact-PDF underlay", fill="#333333")
        row.paste(src_crop.resize((src_crop.width * scale, src_crop.height * scale), Image.Resampling.NEAREST), (4, 27))
        row.paste(clean_crop.resize((clean_crop.width * scale, clean_crop.height * scale), Image.Resampling.NEAREST),
                  (max(src_crop.width, clean_crop.width) * scale + 24, 27))
        contact_rows.append(row)
    sheet_w = max(row.width for row in contact_rows)
    contact = Image.new("RGB", (sheet_w, sum(row.height for row in contact_rows)), "#e4e0d8")
    y = 0
    for row in contact_rows:
        contact.paste(row, (0, y))
        y += row.height

    manifest = {
        "schemaVersion": 1,
        "sourcePdf": str(PDF),
        "sourcePdfSha256": source_sha,
        "method": "Text removed in a disposable PDF copy; only the 12 source-traced vector groups were redacted with PyMuPDF; clean crops rendered on the exact background.webp pixel grid. The source PDF and Payload were read-only.",
        "classification": {
            "textOwnedInlineSymbols": [f"{e['symbolId']} at {e['anchor']['blockId']}/{e['anchor']['lineId']}" for e in elements],
            "fixedArtworkPreserved": ["left page flourish", "header/footer ornaments", "page frame/background"],
        },
        "comparison": comparison,
        "symbols": symbol_metrics,
        "payloadWrites": 0,
        "candidateApprovalWrites": 0,
        "status": "dry-run" if not args.apply else "applied",
    }
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    if not args.apply:
        return

    rollback = PROOF_DIR / "rollback"
    rollback.mkdir(parents=True, exist_ok=True)
    (rollback / "inline_elements.before.json").write_bytes(current_bytes)
    replaced_mask = PAGE / "inline-element-mask-000.png"
    if replaced_mask.is_file():
        shutil.copy2(replaced_mask, rollback / "inline-element-mask-000.before.png")
    rollback_files = []
    for row in asset_writes:
        destination = PAGE / row["name"]
        if destination.exists() and destination.read_bytes() != row["bytes"]:
            raise FileExistsError(f"Refusing to overwrite a different source asset: {destination}")
        if not destination.exists():
            rollback_files.append(str(destination.relative_to(ROOT)))
    for element, metric in zip(elements, symbol_metrics):
        if metric["maskName"] != "inline-element-mask-000.png":
            destination = PAGE / metric["maskName"]
            if destination.exists():
                raise FileExistsError(f"Refusing to overwrite an existing cleanup mask: {destination}")
            rollback_files.append(str(destination.relative_to(ROOT)))
    for row in asset_writes:
        (PAGE / row["name"]).write_bytes(row["bytes"])
    for name, encoded in mask_bytes.items():
        (PAGE / name).write_bytes(encoded)
    dump_json(SIDE_PATH, new_sidecar)
    contact.save(PROOF_DIR / "p092-source-symbol-underlays-before-after.png", optimize=True)
    manifest["status"] = "applied"
    manifest["rollback"] = {
        "restoreSidecar": str((rollback / "inline_elements.before.json").relative_to(ROOT)),
        "restoreMaskIfPresent": str((rollback / "inline-element-mask-000.before.png").relative_to(ROOT)) if replaced_mask.is_file() else None,
        "removeNewFiles": rollback_files,
    }
    dump_json(PROOF_DIR / "manifest.json", manifest)
    print(f"Applied {len(elements)} editable source symbol placements to {SIDE_PATH}")


if __name__ == "__main__":
    main()
