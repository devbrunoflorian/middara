#!/usr/bin/env python3
"""Prepare a reversible, snapshot-only semantic replacement for the p.47 SP orb."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-16/p047-sp-orb-inline-v1"
SOURCE_PDF = Path(os.environ.get(
    "MIDDARA_SOURCE_PDF_PATH",
    r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf",
))
PAGE_DIR = ROOT / "apps/web/public/pages/page_047"
DOM_PATH = PAGE_DIR / "page_047_dom.json"
BACKGROUND_PATH = PAGE_DIR / "background.webp"
SIDECAR_PATH = PAGE_DIR / "inline_elements.json"
SYMBOLS_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
ASSET_PATH = PAGE_DIR / "resource-sp-orb.png"
BASELINE_PATH = PROOF / "preflight-before.json"

SOURCE_BBOX = [204.22300720214844, 198.3699951171875, 219.72000122070312, 213.49603271484375]
MASK_BBOX = [203.82300720214844, 197.9699951171875, 220.12000122070312, 213.89603271484375]
RAW_SOURCE_SHA = "f65c3ee45ab1e0684f7eed42149c6d0a939472a0f624d8bc41667b06175f2f0e"
ICON_ID = "resource.sp-orb"
ASSET_URL = "/pages/page_047/resource-sp-orb.png"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def symbol_definition() -> dict:
    return {
        "id": ICON_ID,
        "category": "Recursos",
        "labels": {"en": "Stamina Point orb", "pt-BR": "Orbe de SP"},
        "description": {
            "en": "Original red Stamina Point orb from the source PDF.",
            "pt-BR": "Orbe vermelho de SP extraído da arte-fonte.",
        },
        "searchTerms": {
            "en": ["stamina point", "sp", "orb", "resource"],
            "pt-BR": ["sp", "orbe", "recurso"],
        },
        "editorTokens": {"en": "⟦SP orb⟧", "pt-BR": "⟦Orbe de SP⟧"},
        "allowedBlockTypes": ["paragraph", "typographic-field", "span-unit", "credit-field"],
        "assetUrl": ASSET_URL,
        "source": {
            "pdf": SOURCE_PDF.name,
            "page": 47,
            "bboxPt": SOURCE_BBOX,
            "assetSizePx": [16, 16],
        },
        "render": {
            "widthEm": 1.5497,
            "heightEm": 1.5126037,
            "verticalAlignEm": 0.4,
            "mask": "circle",
        },
    }


def extract_source_orb() -> bytes:
    if not SOURCE_PDF.is_file():
        raise FileNotFoundError(f"Official source PDF not found: {SOURCE_PDF}")
    doc = pymupdf.open(SOURCE_PDF)
    page = doc[46]
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 1:
            continue
        bbox = block.get("bbox", [])
        if len(bbox) == 4 and all(abs(bbox[i] - SOURCE_BBOX[i]) < 0.01 for i in range(4)):
            data = block["image"]
            if hashlib.sha256(data).hexdigest() != RAW_SOURCE_SHA:
                raise RuntimeError("The inline source orb bytes differ from the reviewed extraction.")
            if block.get("width") != 16 or block.get("height") != 16 or block.get("ext") != "png":
                raise RuntimeError("The source orb dimensions or format changed.")
            return data
    raise RuntimeError("Could not find the reviewed inline SP orb in source PDF page 47.")


def clipped_orb(raw: bytes) -> Image.Image:
    original = Image.open(__import__("io").BytesIO(raw)).convert("RGBA")
    if original.size != (16, 16):
        raise RuntimeError(f"Unexpected source orb image size: {original.size}")
    scale = 8
    mask = Image.new("L", (16 * scale, 16 * scale), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 16 * scale - 1, 16 * scale - 1), fill=255)
    original.putalpha(mask.resize((16, 16), Image.Resampling.LANCZOS))
    return original


def sidecar_element(source_sha: str) -> dict:
    return {
        "symbolId": ICON_ID,
        "bbox": SOURCE_BBOX,
        "drawingIndices": [],
        "anchor": {
            "blockId": "block_15",
            "blockIndex": 3,
            "lineId": "line_15_1",
            "spanIndex": 0,
            "side": "after",
            "sizePt": 10,
            "gapPt": 0,
            "trailingGapPt": 0,
            "ownerSpanRef": {"lineId": "line_15_1", "spanIndex": 0},
        },
        "metrics": {
            "widthEm": 1.5497,
            "heightEm": 1.5126037,
            "verticalAlignEm": 0.4,
            "advanceEm": 1.5497,
            "sourceAssetUrl": ASSET_URL,
            "sourceAppearanceKey": source_sha,
        },
        "mask": {"url": "/pages/page_047/inline-element-mask-001.png", "bbox": MASK_BBOX},
        "sourceTextCompanions": [{
            "blockId": "block_17",
            "blockIndex": 4,
            "lineId": "line_17_0",
            "spanIndex": 0,
            "text": " and may be listed multiple times.",
        }],
        "coveredSourceTexts": [{
            "blockId": "block_17",
            "lineId": "line_17_0",
            "spanIndex": 0,
            "text": " and may be listed multiple times.",
        }],
        "provenance": {
            "sourcePdfSha256": sha(SOURCE_PDF),
            "sourceImageSha256": source_sha,
            "sourcePage": 47,
            "sourceImageBboxPt": SOURCE_BBOX,
            "maskMethod": "local background median fill; isolated snapshot only",
        },
    }


def main() -> None:
    PROOF.mkdir(parents=True, exist_ok=True)
    if not BASELINE_PATH.is_file():
        raise FileNotFoundError(f"Missing preflight receipt: {BASELINE_PATH}")
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8-sig"))
    expected = {Path(item["path"]).name: item["sha256"] for item in baseline if item.get("sha256")}
    for path in [SOURCE_PDF, DOM_PATH, BACKGROUND_PATH, SIDECAR_PATH]:
        recorded = expected.get(path.name)
        if recorded and sha(path).lower() != recorded.lower():
            raise RuntimeError(f"Preflight changed since capture: {path}")

    raw = extract_source_orb()
    source_sha = hashlib.sha256(raw).hexdigest()
    extracted_path = PROOF / "source-orb-original.png"
    extracted_path.write_bytes(raw)

    asset = clipped_orb(raw)
    asset_bytes_path = PROOF / "resource-sp-orb.png"
    asset.save(asset_bytes_path, format="PNG", optimize=False)
    if ASSET_PATH.exists() and sha(ASSET_PATH) != sha(asset_bytes_path):
        raise RuntimeError(f"Refusing to replace a different asset: {ASSET_PATH}")
    if not ASSET_PATH.exists():
        ASSET_PATH.write_bytes(asset_bytes_path.read_bytes())

    # The photographed patch region is flat warm white; use its most frequent
    # nearby raster value, not a guessed pure white.
    background = Image.open(BACKGROUND_PATH).convert("RGB")
    page_w = json.loads(DOM_PATH.read_text(encoding="utf-8"))["width"]
    page_h = json.loads(DOM_PATH.read_text(encoding="utf-8"))["height"]
    sx, sy = background.width / page_w, background.height / page_h
    x0, y0, x1, y1 = MASK_BBOX
    ring = []
    tx0, ty0, tx1, ty1 = SOURCE_BBOX
    sample_box = (201.5, 195.5, 222.5, 216.5)
    for y in range(round(sample_box[1] * sy), round(sample_box[3] * sy)):
        for x in range(round(sample_box[0] * sx), round(sample_box[2] * sx)):
            xp, yp = x / sx, y / sy
            if xp < tx0 - 1.0 or xp > tx1 + 1.0 or yp < ty0 - 1.0 or yp > ty1 + 1.0:
                ring.append(background.getpixel((x, y)))
    if not ring:
        raise RuntimeError("Could not sample background around the orb mask.")
    color = tuple(sorted(pixel[channel] for pixel in ring)[len(ring) // 2] for channel in range(3))
    mask = Image.new("RGB", (34, 34), color)
    mask_path = PROOF / "inline-element-mask-001.png"
    mask.save(mask_path, format="PNG", optimize=False)

    symbols = json.loads(SYMBOLS_PATH.read_text(encoding="utf-8"))
    existing = next((item for item in symbols if item.get("id") == ICON_ID), None)
    definition = symbol_definition()
    if existing is None:
        text = SYMBOLS_PATH.read_text(encoding="utf-8")
        marker = "\n]\n"
        if not text.endswith(marker):
            raise RuntimeError("sourceSymbols.json does not end in the expected JSON array shape.")
        pretty = json.dumps(definition, ensure_ascii=False, indent=2)
        pretty = "  " + pretty.replace("\n", "\n  ")
        SYMBOLS_PATH.write_text(text[:-2] + ",\n" + pretty + "\n]\n", encoding="utf-8")
    elif existing != definition:
        raise RuntimeError(f"Existing {ICON_ID} registry entry differs from the prepared definition.")

    snapshot_dir = PROOF / "snapshot"
    snapshot_page = snapshot_dir / "pages/page_047"
    shutil.copytree(
        PAGE_DIR,
        snapshot_page,
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("resource-sp-orb.png", "inline-element-mask-001.png"),
    )
    shutil.copy2(ASSET_PATH, snapshot_page / ASSET_PATH.name)
    shutil.copy2(mask_path, snapshot_page / "inline-element-mask-001.png")
    inline_path = snapshot_page / "inline_elements.json"
    inline_data = json.loads(inline_path.read_text(encoding="utf-8"))
    if any(item.get("symbolId") == ICON_ID for item in inline_data.get("elements", [])):
        raise RuntimeError(f"Snapshot sidecar already contains {ICON_ID}; refusing to duplicate it.")
    inline_data.setdefault("elements", []).append(sidecar_element(source_sha))
    write_json(inline_path, inline_data)

    source_boxes_path = ROOT / "output/proofs/translation-readiness-2026-10-16/p047-inline-flow-guard-v1/snapshot/snapshot.json"
    source_boxes_snapshot = json.loads(source_boxes_path.read_text(encoding="utf-8-sig"))
    common = {
        "layoutFrames": [],
        "symbolAliasSettings": [],
        "assetPages": [47],
        "page": 47,
        "patched": True,
        "verifyRenderedSnapshot": True,
        "sourcePageBoxes": source_boxes_snapshot["sourcePageBoxes"],
        "translations": [],
    }
    write_json(snapshot_dir / "snapshot-source.json", common)

    style = {
        "font": "OptimaLTStd", "size": 10, "color": "#231f20",
        "weight": 400, "style": "normal", "disableLigatures": True,
    }
    candidate = "Em geral, "
    ending = " indica o custo, que pode se repetir."
    metrics = {
        "widthEm": 1.5497,
        "heightEm": 1.5126037,
        "verticalAlignEm": 0.4,
        "advanceEm": 1.5497,
        "sourceAssetUrl": ASSET_URL,
        "sourceAppearanceKey": source_sha,
    }
    proposed = dict(common)
    proposed["translations"] = [{
        "spanKey": "page_47_unit_p47-block-15-paragraph-2__pt-BR",
        "language": "pt-BR",
        "data": {
            "schemaVersion": 2,
            "segments": [
                {"text": candidate, **style},
                {"text": "\ufffc", **style, "symbolId": ICON_ID, "symbolMetrics": metrics,
                 "sourceRendering": "semantic-inline"},
                {"text": ending, **style},
            ],
            "textAlign": "left",
            "lineHeight": 1.1,
            "lineHeightMode": "source",
            "managedSourceSymbols": [ICON_ID],
        },
    }]
    write_json(snapshot_dir / "snapshot-pt-proposal.json", proposed)

    receipt = {
        "status": "prepared-isolated-snapshot",
        "scope": "p.47 SP orb only",
        "sourcePdf": str(SOURCE_PDF),
        "sourcePdfSha256": sha(SOURCE_PDF),
        "sourceDomSha256": sha(DOM_PATH),
        "sourceBackgroundSha256": sha(BACKGROUND_PATH),
        "canonicalSidecarBeforeSha256": sha(SIDECAR_PATH),
        "sourceSymbolsBeforeSha256": expected.get(SYMBOLS_PATH.name),
        "sourceSymbolsAfterSha256": sha(SYMBOLS_PATH),
        "sourceOrbSha256": source_sha,
        "semanticAssetSha256": sha(ASSET_PATH),
        "maskSha256": sha(mask_path),
        "maskSampleRgb": color,
        "symbolId": ICON_ID,
        "snapshotSidecarElementCount": len(inline_data["elements"]),
        "snapshotTranslationKey": proposed["translations"][0]["spanKey"],
        "proposedText": candidate + "[Orbe de SP]" + ending,
        "translationStatus": "experimental; not human-approved; not saved to Payload",
        "canonicalSidecarWritten": False,
        "payloadWritten": False,
    }
    write_json(PROOF / "preparation-receipt.json", receipt)
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
