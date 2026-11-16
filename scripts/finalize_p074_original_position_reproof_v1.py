#!/usr/bin/env python3
"""Verify the p.74 two-die reproof and emit readiness ledger v15.

This finalizer consumes immutable proof snapshots and PDFs, writes legible PDF
comparison crops and derived proof records under output/proofs, then copies the
v14 readiness ledger into a new v15 ledger. It never writes canonical sidecars,
Payload, human translations, or the source PDF.
"""

from __future__ import annotations

import copy
import csv
import hashlib
import io
import json
import re
from collections import Counter
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/proofs/translation-readiness-2026-10-14"
PROOF = OUTPUT / "p074-original-position-reproof-v1"
CAPTURES = PROOF / "capture/final-review-v1"
SOURCE_PDF = Path(r"C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
SOURCE_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
V14_JSON = OUTPUT / "readiness-ledger-v14.json"
V14_SHA256 = "73de13ede2278e89dcef39cc42ad6241c82031e2ce0ac7940b68dc028be513be"
REPORT_PATH = PROOF / "p074-family-reproof-report-v1.json"
V15_JSON = OUTPUT / "readiness-ledger-v15.json"
V15_CSV = OUTPUT / "readiness-ledger-v15.csv"
V15_MD = OUTPUT / "readiness-ledger-v15.md"
APPEARANCE_KEY = "f922eb3ea21fad7fb0736645fa6fad858c9972cd0530707d62d2efe71fd392e1"
ONE_TIME_REVIEW_REFRESH = {
    "output/proofs/translation-readiness-2026-10-14/p074-original-position-reproof-v1/capture/final-review-v1/p074-v195-source-reinserted-slot-empty.png": "b69232b5460adb7414499ca3d8569e2a408e7bceef501f9ea95ec906fba75e1c",
    "output/proofs/translation-readiness-2026-10-14/p074-original-position-reproof-v1/capture/final-review-v1/p074-v203-source-reinserted-slot-empty.png": "a9a98a74ebf33f4d7fb3efb0051df3ca639597eeb88e91af3c1e5d670604d42d",
    "output/proofs/translation-readiness-2026-10-14/p074-original-position-reproof-v1/capture/final-review-v1/p074-f-marker-source-vs-export-v1.png": "b3425948e21c0f42a9c569a597174e3f743971b9cee23eea49b5ce2fb4adc1b0",
    "output/proofs/translation-readiness-2026-10-14/p074-original-position-reproof-v1/p074-family-reproof-report-v1.json": "c6ea80347d5eb0a531d4451a5603657c71ef3d3c9d3c64972c19538e4c4782ba",
    "output/proofs/translation-readiness-2026-10-14/readiness-ledger-v15.json": "49d432f66f801aa6e59f0fe32abf5b2ef9709ce4d756cab27aa8e4ed8337f357",
    "output/proofs/translation-readiness-2026-10-14/readiness-ledger-v15.csv": "d42ba916e8503c53a3a9c1855d27f88ce86ffd1c2e82ea2dfbe19de7de6423c0",
    "output/proofs/translation-readiness-2026-10-14/readiness-ledger-v15.md": "580a76a1f241aab7aeca8435ff5981f815a36eb044fe2361b68f0d5e5a57a919",
}
TARGETS = {
    "p074-v195-198-n4": {
        "asset": "audit-source-p074-v195-198-n4.svg",
        "drawings": [195, 196, 197, 198],
        "bbox": [631.6878662109375, 600.5233154296875, 643.1759033203125, 613.7823486328125],
        "maskBbox": [630.75, 599.75, 644.0, 614.75],
        "assetSha256": "ea7727792a991f280136f8c87bc7c139096c0317e4ebaec8f7efe7a91346167c",
        "maskSha256": "5b276a137e17af13e9722072dfa0a3beb0bcb25df1d5b8e67320b64eddf49eb6",
        "expectedViewerRect": {"x": 986.609375, "y": 940.1875},
        "capture": "p074-v195-source-reinserted-slot-empty.png",
        "emptyKey": "empty-p195-sibling-preserved",
        "sourceSlot": "Gain WHITE | dice.white | and PURPLE",
    },
    "p074-v203-206-n4": {
        "asset": "audit-source-p074-v203-206-n4.svg",
        "drawings": [203, 204, 205, 206],
        "bbox": [490.6319274902344, 614.5233154296875, 502.1199035644531, 627.7823486328125],
        "maskBbox": [489.75, 613.75, 503.0, 628.75],
        "assetSha256": "10a123bd297362479da571e97c4fe2761bdc42fce9bade34d5f37c55a8ad5f3d",
        "maskSha256": "ce62634c91a9ca01d32f573788d63d4605ee07d26b68a1581096bc1f2acc851f",
        "expectedViewerRect": {"x": 712.609375, "y": 962.171875},
        "capture": "p074-v203-source-reinserted-slot-empty.png",
        "emptyKey": "empty-p203-sibling-preserved",
        "sourceSlot": "gain a WHITE | dice.white | Casting Dice",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(path: Path) -> str:
    return path.resolve().relative_to(ROOT.resolve()).as_posix()


def artifact_label(path: Path) -> str:
    try:
        return rel(path)
    except ValueError:
        return "external:" + path.resolve().as_posix()


def json_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_immutable(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != payload:
            key = rel(path)
            expected_old_hash = ONE_TIME_REVIEW_REFRESH.get(key)
            if expected_old_hash is None or sha256(path) != expected_old_hash:
                raise SystemExit(f"Refusing to overwrite different evidence: {key}")
            path.write_bytes(payload)
        return
    path.write_bytes(payload)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def translation_for(snapshot: dict) -> dict:
    matches = [
        translation for translation in snapshot.get("translations", [])
        if translation.get("spanKey") == "page_74_block_4"
        and translation.get("language") == "en"
    ]
    if len(matches) != 1:
        raise AssertionError(f"Expected one normalized EN page_74_block_4 record; found {len(matches)}")
    return matches[0]


def plain_text(snapshot: dict) -> str:
    return "".join(
        str(segment.get("text", ""))
        for translation in snapshot.get("translations", [])
        for segment in translation.get("data", {}).get("segments", [])
        if not segment.get("symbolId")
    )


def symbol_segments(snapshot: dict) -> list[dict]:
    return [
        segment
        for translation in snapshot.get("translations", [])
        for segment in translation.get("data", {}).get("segments", [])
        if segment.get("symbolId") == "dice.white"
    ]


def asset_name(segment: dict) -> str:
    return str(segment.get("symbolMetrics", {}).get("sourceAssetUrl", "")).rsplit("/", 1)[-1]


def metric_symbol_count(metrics: dict, surface: str) -> int:
    return len(metrics[surface]["symbols"])


def verify_export_log(path: Path) -> None:
    content = path.read_text(encoding="utf-8")
    for expected in (
        '"immutableSnapshot": true',
        "edited snapshot text/symbol order verified 1",
        '"pdfVerification": true',
    ):
        if expected not in content:
            raise AssertionError(f"Missing export evidence {expected!r} in {rel(path)}")
    if "__en" in content:
        raise AssertionError(f"Found the old EN suffixed serialization in {rel(path)}")


def render_clip(document: pymupdf.Document, page_index: int, clip: tuple[float, float, float, float], scale: float) -> Image.Image:
    page = document[page_index]
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=pymupdf.Rect(clip), alpha=False)
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def font(size: int):
    for candidate in (Path(r"C:/Windows/Fonts/arial.ttf"), Path(r"C:/Windows/Fonts/segoeui.ttf")):
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def comparison_png(columns: list[tuple[str, Image.Image]], destination: Path) -> bytes:
    gap, label_height, margin = 14, 38, 12
    width = max(image.width for _, image in columns)
    height = max(image.height for _, image in columns)
    canvas = Image.new("RGB", (margin * 2 + len(columns) * width + (len(columns) - 1) * gap, margin * 2 + label_height + height), (28, 28, 28))
    draw = ImageDraw.Draw(canvas)
    label_font = font(17)
    for index, (label, image) in enumerate(columns):
        x = margin + index * (width + gap)
        draw.text((x + 2, margin + 6), label, fill=(250, 250, 250), font=label_font)
        canvas.paste(image, (x, margin + label_height))
    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG", optimize=False)
    payload = buffer.getvalue()
    write_immutable(destination, payload)
    return payload


def verify_source_marker(source: pymupdf.Page, edited: pymupdf.Page) -> dict:
    source_f = [
        word for word in source.get_text("words")
        if word[4] == "F" and 610 <= word[0] <= 632 and 625 <= word[1] <= 643
    ]
    edited_f = [
        word for word in edited.get_text("words")
        if word[4] == "F" and 550 <= word[0] <= 590 and 625 <= word[1] <= 643
    ]
    if len(source_f) != 1 or len(edited_f) != 1:
        raise AssertionError(f"Could not uniquely locate source/reflowed F marker: {source_f} / {edited_f}")
    tile_bbox = [617.628, 629.176, 627.624, 639.172]
    white_drawings = [
        drawing for drawing in source.get_drawings()
        if drawing.get("fill") == (1.0, 1.0, 1.0)
        and max(abs(drawing["rect"][axis] - tile_bbox[axis]) for axis in range(4)) < 0.5
    ]
    if not white_drawings:
        raise AssertionError("The source white F tile is not found at its recorded vector bounds")
    source_box = [round(float(value), 4) for value in source_f[0][:4]]
    edited_box = [round(float(value), 4) for value in edited_f[0][:4]]
    if not (source_box[0] > tile_bbox[0] and source_box[2] < tile_bbox[2]):
        raise AssertionError(f"Source F glyph is not centered within its white tile: {source_box}")
    if not (edited_box[2] < tile_bbox[0] - 10):
        raise AssertionError(f"Expected exported F glyph to reflow left of the static source tile: {edited_box}")
    return {
        "status": "page-level structural holdout; do not infer a marker repair",
        "sourceGlyphBboxPt": source_box,
        "sourceTileVectorBboxPt": tile_bbox,
        "reflowedExportGlyphBboxPt": edited_box,
        "finding": "The F glyph moves with the text while its white source tile remains at the original page coordinate. This is independent of the two white-die candidates and blocks a p.74 structural PASS.",
        "visualCapture": rel(CAPTURES / "p074-f-marker-source-vs-export-v1.png"),
    }


def main() -> None:
    if sha256(SOURCE_PDF) != SOURCE_SHA256:
        raise SystemExit("The PDF source hash differs from the frozen audit input.")
    if sha256(V14_JSON) != V14_SHA256:
        raise SystemExit("The v14 JSON changed since the expected input snapshot; refusing to build v15 from it.")

    original_snapshot_path = PROOF / "snapshots/original/snapshot.json"
    empty_snapshot_path = PROOF / "snapshots/empty/snapshot.json"
    original_snapshot = read_json(original_snapshot_path)
    empty_snapshot = read_json(empty_snapshot_path)
    original_translation = translation_for(original_snapshot)
    empty_translation = translation_for(empty_snapshot)
    original_data = original_translation["data"]
    empty_data = empty_translation["data"]
    if original_translation.get("spanKey") != "page_74_block_4" or original_translation.get("language") != "en":
        raise AssertionError("Original proof snapshot is not normalized EN page_74_block_4")
    if "__en" in original_translation["spanKey"] or "__en" in empty_translation["spanKey"]:
        raise AssertionError("Old __en serialization remains in the proof")
    if original_data.get("lineHeight") != 1.4 or original_data.get("lineHeightMode") != "custom":
        raise AssertionError("Expected source-derived 1.4 line height in the original-position snapshot")
    if original_data.get("managedSourceSymbols") != ["dice.white"]:
        raise AssertionError("Expected the source dice to be managed in the isolated override")
    if plain_text(original_snapshot) != plain_text(empty_snapshot):
        raise AssertionError("The zero-symbol snapshot changed EN human text")
    original_symbols = symbol_segments(original_snapshot)
    empty_symbols = symbol_segments(empty_snapshot)
    if len(original_symbols) != 2 or {asset_name(item) for item in original_symbols} != {item["asset"] for item in TARGETS.values()}:
        raise AssertionError("The original-position snapshot must contain the exact two known source assets")
    if empty_symbols:
        raise AssertionError("The zero-symbol snapshot still serializes a target dice symbol")
    if sum(bool(segment.get("symbolId")) for segment in original_data["segments"]) != 2:
        raise AssertionError("Unexpected non-target semantic symbols in the isolated source text span")

    # The corrected snapshot keeps the human text bytes intact relative to the
    # two original candidate snapshots; only object placement and line height
    # are changed in this proof.
    old_snapshot_root = ROOT / "output/proofs/symbol-activation-2026-10-13/batch-95/pending-50-proof-2026-10-14/snapshots"
    old_texts = []
    for candidate_id in TARGETS:
        old = read_json(old_snapshot_root / candidate_id / "snapshot.json")
        translation = translation_for(old)
        if "__en" in translation["spanKey"]:
            raise AssertionError(f"The historical source snapshot key is unexpected for {candidate_id}")
        old_texts.append(plain_text(old))
    if plain_text(original_snapshot) != old_texts[0]:
        raise AssertionError("The proof changed human EN text relative to the normalized p.74 seed snapshot")
    if old_texts[0] != old_texts[1] and old_texts[1].lstrip(" ") != old_texts[0]:
        raise AssertionError("The p.74 historical snapshots differ beyond one leading layout space")
    historical_text_note = (
        "The p195 historical snapshot and the normalized proof have identical prose bytes. The p203 historical snapshot contains one extra leading ASCII space; after trimming only that boundary whitespace its prose is identical. No translation record was written."
    )

    inline_path = PROOF / "snapshots/original/pages/page_074/inline_elements.json"
    inline = read_json(inline_path)
    inline_by_id = {
        element.get("provenance", {}).get("candidateId"): element
        for element in inline.get("elements", [])
        if element.get("provenance", {}).get("candidateId") in TARGETS
    }
    if set(inline_by_id) != set(TARGETS):
        raise AssertionError("The copied source inline-element registry does not contain both frozen p.74 placements")

    # Every export log is bound back to the immutable snapshot by the manifest
    # hash recorded below. The exporter verifies the rendered output PDF itself.
    exports = {
        "original": {
            "snapshot": original_snapshot_path,
            "pdf": PROOF / "pdf/p074-both-dice-original-position.pdf",
            "metrics": PROOF / "metrics/p074-original-metrics.json",
            "log": PROOF / "reproducibility/logs/original-export.log",
            "repeatPdf": PROOF / "reproducibility/pdf/original-repeat.pdf",
            "repeatMetrics": PROOF / "reproducibility/metrics/original-repeat.json",
        },
        "empty": {
            "snapshot": empty_snapshot_path,
            "pdf": PROOF / "pdf/p074-both-dice-empty.pdf",
            "metrics": PROOF / "metrics/p074-empty-metrics.json",
            "log": PROOF / "reproducibility/logs/empty-export.log",
            "repeatPdf": PROOF / "reproducibility/pdf/empty-repeat.pdf",
            "repeatMetrics": PROOF / "reproducibility/metrics/empty-repeat.json",
        },
    }
    sibling_exports = {}
    for candidate_id, target in TARGETS.items():
        key = target["emptyKey"]
        sibling_exports[candidate_id] = {
            "snapshot": PROOF / f"snapshots/empty-preserve-sibling-{candidate_id}/snapshot.json",
            "manifest": PROOF / f"snapshots/empty-preserve-sibling-{candidate_id}/snapshot-manifest.json",
            "pdf": PROOF / f"reproducibility/pdf/{key}.pdf",
            "metrics": PROOF / f"reproducibility/metrics/{key}.json",
            "log": PROOF / f"reproducibility/logs/{key}-export.log",
            "viewerCapture": PROOF / f"reproducibility/capture/{key}-viewer.png",
            "printCapture": PROOF / f"reproducibility/capture/{key}-print.png",
        }
        variant = read_json(sibling_exports[candidate_id]["snapshot"])
        variant_manifest = read_json(sibling_exports[candidate_id]["manifest"])
        if "__en" in translation_for(variant)["spanKey"]:
            raise AssertionError(f"Sibling-preserving empty snapshot has __en: {candidate_id}")
        variant_symbols = symbol_segments(variant)
        if len(variant_symbols) != 1 or variant_manifest.get("removedCandidateId") != candidate_id:
            raise AssertionError(f"Sibling-preserving state does not remove exactly {candidate_id}")
        remaining_id = variant_manifest.get("preservedSiblingCandidateId")
        if remaining_id not in TARGETS or asset_name(variant_symbols[0]) != TARGETS[remaining_id]["asset"]:
            raise AssertionError(f"Sibling-preserving state kept the wrong placement for {candidate_id}")
        if plain_text(variant) != plain_text(original_snapshot):
            raise AssertionError(f"Removing {candidate_id} changed human EN text")
        verify_export_log(sibling_exports[candidate_id]["log"])

    for data in exports.values():
        verify_export_log(data["log"])
        if data["snapshot"].stat().st_size == 0:
            raise AssertionError("Empty immutable snapshot file")
        if data["metrics"].read_bytes() != data["repeatMetrics"].read_bytes():
            raise AssertionError(f"Repeated export metrics differ: {rel(data['metrics'])}")

    metrics = {key: read_json(data["metrics"]) for key, data in exports.items()}
    sibling_metrics = {candidate: read_json(data["metrics"]) for candidate, data in sibling_exports.items()}
    for key, expected in (("original", 2), ("empty", 0)):
        item = metrics[key]
        if item.get("page") != 74 or item.get("language") != "en":
            raise AssertionError(f"Unexpected page/language in {key} metrics")
        if metric_symbol_count(item, "viewer") != expected or metric_symbol_count(item, "print") != expected:
            raise AssertionError(f"Unexpected {key} symbol counts in viewer/print")
        if abs(item["viewer"]["pageWidthPt"] - 820.3460083007812) > 0.01:
            raise AssertionError(f"Unexpected normalized page size in {key} metrics")
    for candidate_id, data in sibling_exports.items():
        item = sibling_metrics[candidate_id]
        if item.get("page") != 74 or item.get("language") != "en":
            raise AssertionError(f"Unexpected page/language in sibling-preserving state for {candidate_id}")
        if metric_symbol_count(item, "viewer") != 1 or metric_symbol_count(item, "print") != 1:
            raise AssertionError(f"Expected one preserved sibling in the empty state for {candidate_id}")
        manifest = read_json(sibling_exports[candidate_id]["manifest"])
        sibling_id = manifest["preservedSiblingCandidateId"]
        survivor = sibling_metrics[candidate_id]["viewer"]["symbols"][0]["rect"]
        expected = TARGETS[sibling_id]["expectedViewerRect"]
        if abs(survivor["x"] - expected["x"]) > 0.05 or abs(survivor["y"] - expected["y"]) > 0.05:
            raise AssertionError(f"Wrong source slot survived removal of {candidate_id}: {survivor}")

    # The two original/repeat PDFs differ at the byte level because Chromium
    # serializes PDF metadata; their rendered 100% page pixels must be identical.
    pixel_reproducibility = {}
    for key, data in exports.items():
        initial = pymupdf.open(data["pdf"])
        repeated = pymupdf.open(data["repeatPdf"])
        try:
            if len(initial) != 1 or len(repeated) != 1:
                raise AssertionError(f"Expected one PDF page in the {key} export")
            first_pix = initial[0].get_pixmap(matrix=pymupdf.Matrix(1, 1), alpha=False)
            repeat_pix = repeated[0].get_pixmap(matrix=pymupdf.Matrix(1, 1), alpha=False)
            same_pixels = (
                first_pix.width == repeat_pix.width
                and first_pix.height == repeat_pix.height
                and first_pix.samples == repeat_pix.samples
            )
            if not same_pixels:
                raise AssertionError(f"Rendered pixels changed on repeated {key} export")
            pixel_reproducibility[key] = {
                "onePage": True,
                "byteIdentical": sha256(data["pdf"]) == sha256(data["repeatPdf"]),
                "renderedPixelsIdenticalAt100Percent": True,
                "widthPx": first_pix.width,
                "heightPx": first_pix.height,
            }
        finally:
            initial.close()
            repeated.close()

    docs = [pymupdf.open(SOURCE_PDF), pymupdf.open(exports["original"]["pdf"]), pymupdf.open(exports["empty"]["pdf"])]
    try:
        source_doc, original_doc, empty_doc = docs
        if len(source_doc) != 102 or len(original_doc) != 1 or len(empty_doc) != 1:
            raise AssertionError("Source/isolated PDF page counts differ from the expected 102/1/1")
        source_page, original_page, empty_page = source_doc[73], original_doc[0], empty_doc[0]
        source_page_size = tuple(round(float(value), 4) for value in source_page.rect)
        if source_page_size != tuple(round(float(value), 4) for value in original_page.rect):
            raise AssertionError("The isolated reinserted PDF page size differs from source p.74")
        if source_page_size != tuple(round(float(value), 4) for value in empty_page.rect):
            raise AssertionError("The isolated empty PDF page size differs from source p.74")
        marker = verify_source_marker(source_page, original_page)
        _, marker_empty_doc, _ = docs
        # Captures are direct rasterizations of the source and actual output PDFs.
        scale = 4.0
        source1 = render_clip(source_doc, 73, (535, 596, 710, 618), scale)
        original1 = render_clip(original_doc, 0, (535, 596, 710, 618), scale)
        empty195 = pymupdf.open(sibling_exports["p074-v195-198-n4"]["pdf"])
        try:
            empty195_crop = render_clip(empty195, 0, (535, 596, 710, 618), scale)
        finally:
            empty195.close()
        source2 = render_clip(source_doc, 73, (390, 611, 585, 629), scale)
        original2 = render_clip(original_doc, 0, (390, 611, 585, 629), scale)
        empty203 = pymupdf.open(sibling_exports["p074-v203-206-n4"]["pdf"])
        try:
            empty203_crop = render_clip(empty203, 0, (390, 611, 585, 629), scale)
        finally:
            empty203.close()
        marker_source = render_clip(source_doc, 73, (540, 626, 645, 642), scale)
        marker_output = render_clip(original_doc, 0, (540, 626, 645, 642), scale)
        marker_empty = render_clip(empty_doc, 0, (540, 626, 645, 642), scale)
        comparisons = {
            "p074-v195-198-n4": comparison_png(
                [("PDF fonte", source1), ("PDF EN: os dois ativos", original1), ("Alvo removido; irmão preservado", empty195_crop)],
                CAPTURES / TARGETS["p074-v195-198-n4"]["capture"],
            ),
            "p074-v203-206-n4": comparison_png(
                [("PDF fonte", source2), ("PDF EN: os dois ativos", original2), ("Alvo removido; irmão preservado", empty203_crop)],
                CAPTURES / TARGETS["p074-v203-206-n4"]["capture"],
            ),
        }
        marker_capture_payload = comparison_png(
            [("PDF fonte", marker_source), ("PDF EN: marcador refluído", marker_output), ("PDF EN vazio", marker_empty)],
            CAPTURES / "p074-f-marker-source-vs-export-v1.png",
        )
    finally:
        for doc in docs:
            doc.close()

    # Verify the target identity and source geometry against the copied source
    # registry, and bind the two selected display positions to their SVGs.
    candidate_report = {}
    original_symbols = metrics["original"]["viewer"]["symbols"]
    original_rects = [symbol["rect"] for symbol in original_symbols if symbol.get("id") == "dice.white"]
    if len(original_rects) != 2:
        raise AssertionError("The actual exported PDF viewer snapshot does not contain exactly two white dice")
    for candidate_id, target in TARGETS.items():
        element = inline_by_id[candidate_id]
        provenance = element.get("provenance", {})
        if element.get("symbolId") != "dice.white" or provenance.get("sourcePdfSha256") != SOURCE_SHA256:
            raise AssertionError(f"Source identity mismatch for {candidate_id}")
        if element.get("metrics", {}).get("sourceAppearanceKey") != APPEARANCE_KEY:
            raise AssertionError(f"Source appearance mismatch for {candidate_id}")
        if element.get("drawingIndices") != target["drawings"] or provenance.get("assetSha256") != target["assetSha256"]:
            raise AssertionError(f"Native vector identity/hash mismatch for {candidate_id}")
        if provenance.get("maskSha256") != target["maskSha256"]:
            raise AssertionError(f"Mask hash mismatch for {candidate_id}")
        asset_path = PROOF / "snapshots/original/pages/page_074" / target["asset"]
        mask_path = PROOF / "snapshots/original/pages/page_074" / f"audit-mask-{candidate_id}.png"
        if sha256(asset_path) != target["assetSha256"] or sha256(mask_path) != target["maskSha256"]:
            raise AssertionError(f"Copied proof assets do not match the source record for {candidate_id}")
        expected = target["expectedViewerRect"]
        hits = [rect for rect in original_rects if abs(rect["x"] - expected["x"]) < 0.05 and abs(rect["y"] - expected["y"]) < 0.05]
        if len(hits) != 1:
            raise AssertionError(f"The original-position PDF does not uniquely show {candidate_id} at its expected slot")
        target_empty_metrics = sibling_metrics[candidate_id]
        removed_crop = CAPTURES / target["capture"]
        candidate_report[candidate_id] = {
            "priorLedgerStatus": "PENDING",
            "newStatus": "READY (candidate scope only)",
            "newDiscovery": False,
            "symbolId": "dice.white",
            "sourceSlot": target["sourceSlot"],
            "sourceDrawingIndices": target["drawings"],
            "sourceBboxPt": target["bbox"],
            "maskBboxPt": target["maskBbox"],
            "sourceAppearanceKey": APPEARANCE_KEY,
            "sourceAsset": target["asset"],
            "sourceAssetSha256": target["assetSha256"],
            "maskSha256": target["maskSha256"],
            "combinedReinsertedPdf": rel(exports["original"]["pdf"]),
            "combinedReinsertedPdfSha256": sha256(exports["original"]["pdf"]),
            "combinedPdfSymbolCountViewerAndPrint": 2,
            "targetPresentAtExpectedSlotInCombinedPdf": True,
            "targetSpecificEmptyPdf": rel(sibling_exports[candidate_id]["pdf"]),
            "targetSpecificEmptyPdfSha256": sha256(sibling_exports[candidate_id]["pdf"]),
            "targetSpecificEmptyPdfSymbolCountViewerAndPrint": 1,
            "targetSpecificEmptyPreservedSibling": read_json(sibling_exports[candidate_id]["manifest"])["preservedSiblingCandidateId"],
            "targetAbsentWhileSiblingRemains": True,
            "immutableSnapshotConsumed": True,
            "sourceFallbackDetected": False,
            "pdfVerification": True,
            "visualCapture": rel(removed_crop),
            "visualReview": "At normal 4x detail of the actual source and output PDFs, the target appears once in the combined export and disappears in its target-specific empty export while the other source slot remains. No duplicate target or visible target ghost is present in the selected slot.",
            "pageLevelPassAsserted": False,
        }

    # The F marker stays open at page scope. Candidate-level readiness does not
    # automatically close an unrelated source-art marker.
    marker = verify_source_marker(pymupdf.open(SOURCE_PDF)[73], pymupdf.open(exports["original"]["pdf"])[0])
    report = {
        "schemaVersion": 1,
        "generatedAt": "2026-10-14",
        "page": 74,
        "sourcePdf": str(SOURCE_PDF).replace("\\", "/"),
        "sourcePdfSha256": SOURCE_SHA256,
        "scope": "Two existing p.74 placements from the frozen 111; original-position export and target-specific empty exports only.",
        "sourceSnapshots": {
            "original": rel(original_snapshot_path),
            "originalSha256": sha256(original_snapshot_path),
            "empty": rel(empty_snapshot_path),
            "emptySha256": sha256(empty_snapshot_path),
            "normalizedSpanKey": "page_74_block_4",
            "language": "en",
            "suffixEnPresent": False,
            "lineHeight": 1.4,
            "lineHeightDerivation": "14 pt between source baselines divided by the 10 pt source body size.",
            "humanEnglishTextPreservation": {
                "matchesNormalizedP195SeedByteForByte": True,
                "historicalP203Difference": "one leading ASCII space only; wording and remaining characters match",
                "historicalTextNote": historical_text_note,
                "humanTranslationWrites": 0,
            },
            "originalTargetDiceCount": 2,
            "emptyTargetDiceCount": 0,
        },
        "exports": {
            key: {
                "pdf": rel(data["pdf"]),
                "pdfSha256": sha256(data["pdf"]),
                "metrics": rel(data["metrics"]),
                "metricsSha256": sha256(data["metrics"]),
                "log": rel(data["log"]),
                "logSha256": sha256(data["log"]),
                "immutableSnapshotConsumed": True,
                "sourceFallbackDetected": False,
                "pdfVerification": True,
                "viewerSymbols": metric_symbol_count(metrics[key], "viewer"),
                "printSymbols": metric_symbol_count(metrics[key], "print"),
            }
            for key, data in exports.items()
        },
        "siblingPreservingEmptyExports": {
            candidate: {
                "removedCandidateId": candidate,
                "preservedSiblingCandidateId": read_json(data["manifest"])["preservedSiblingCandidateId"],
                "snapshot": rel(data["snapshot"]),
                "snapshotSha256": sha256(data["snapshot"]),
                "pdf": rel(data["pdf"]),
                "pdfSha256": sha256(data["pdf"]),
                "metrics": rel(data["metrics"]),
                "metricsSha256": sha256(data["metrics"]),
                "log": rel(data["log"]),
                "logSha256": sha256(data["log"]),
                "viewerAndPrintSymbolCount": 1,
                "survivingSymbolMatchesSiblingSourceSlot": True,
                "pdfVerification": True,
                "visualCapture": rel(CAPTURES / TARGETS[candidate]["capture"]),
            }
            for candidate, data in sibling_exports.items()
        },
        "pixelReproducibility": pixel_reproducibility,
        "candidateReview": candidate_report,
        "pageLevelStructuralFinding": marker,
        "pageLevelStructuralPassAsserted": False,
        "canonicalPayloadOrSidecarWrites": 0,
        "humanTranslationWrites": 0,
        "sourcePdfWrites": 0,
        "commitsOrPushes": 0,
    }
    artifact_paths = {
        SOURCE_PDF,
        V14_JSON,
        OUTPUT / "readiness-ledger-v14.md",
        original_snapshot_path,
        PROOF / "snapshots/original/snapshot-manifest.json",
        empty_snapshot_path,
        PROOF / "snapshots/empty/snapshot-manifest.json",
        inline_path,
        PROOF / "snapshots/original/pages/page_074/background.webp",
        PROOF / "snapshots/original/pages/page_074/fidelity_overlays.json",
        PROOF / "capture/p074-original-print.png",
        PROOF / "capture/p074-empty-print.png",
        PROOF / "capture/p074-slot1-comparison-4x.png",
        PROOF / "capture/p074-slot2-comparison-4x.png",
        PROOF / "capture/p074-f-marker-nearby-check-5x.png",
        CAPTURES / TARGETS["p074-v195-198-n4"]["capture"],
        CAPTURES / TARGETS["p074-v203-206-n4"]["capture"],
        CAPTURES / "p074-f-marker-source-vs-export-v1.png",
        *[asset for data in TARGETS.values() for asset in (
            PROOF / "snapshots/original/pages/page_074" / data["asset"],
            PROOF / "snapshots/original/pages/page_074" / f"audit-mask-{next(key for key, value in TARGETS.items() if value is data)}.png",
        )],
        *[path for data in exports.values() for path in data.values()],
        *[path for data in sibling_exports.values() for path in data.values()],
        *[old_snapshot_root / candidate / "snapshot.json" for candidate in TARGETS],
    }
    report["sha256"] = {
        artifact_label(path): sha256(path)
        for path in sorted(artifact_paths, key=artifact_label)
        if path.is_file()
    }
    report_bytes = json_bytes(report)
    write_immutable(REPORT_PATH, report_bytes)
    report_sha = hashlib.sha256(report_bytes).hexdigest()

    ledger = read_json(V14_JSON)
    if not ledger.get("scope", "").startswith("v14:") or len(ledger.get("placements", [])) != 111:
        raise AssertionError("Expected the immutable v14 ledger with 111 placements")
    if ledger["summary"].get("canonicalPlacementsApplied") != 0 or ledger["summary"].get("specialCompositionCasesExcluded") != 6:
        raise AssertionError("The prior canonical/special-composition invariant changed")
    ledger = copy.deepcopy(ledger)
    ledger["generatedAt"] = "2026-10-14"
    ledger["scope"] = "v15: the same frozen 111 placements; two existing p.74 white-die placements gained candidate-level original-position and target-specific empty proof; page-level F marker holdout remains; no canonical activation."
    rows = {item["candidateId"]: item for item in ledger["placements"]}
    if set(TARGETS) - set(rows):
        raise AssertionError("The two p.74 IDs are not both present in the frozen 111")
    for candidate_id, target in TARGETS.items():
        row = rows[candidate_id]
        if row.get("status") != "PENDING" or row.get("canonicalApplied") is not False or row.get("isolatedPatchPrepared") is not True:
            raise AssertionError(f"Unexpected prior state for {candidate_id}; refusing promotion")
        row["status"] = "READY"
        row["identityAndSlotConfirmed"] = True
        row["visualStatus"] = "candidate-level-source-position-empty-sibling-pdf-validated-page-pass-withheld"
        row["statusOrigin"] = "p.74 normalized original-position family proof, target-specific empty PDF, independent review; v15 candidate-only promotion"
        row["reason"] = (
            f"READY for this placement only: {target['sourceSlot']}; source vector identity, appearance key, asset/mask hashes, and original slot are verified. "
            "A normalized EN snapshot at lineHeight 1.4 produces a one-page PDF with both source dice exactly once. A second immutable PDF removes only this target and preserves its sibling at the sibling source slot; the removed target is absent, EN text is unchanged, and PDF verification passes. "
            "The separate p.74 F reference marker still reflows away from its fixed source tile, so page-level structural PASS remains withheld. This was an existing PENDING placement, not a new discovery."
        )
        row["evidence"].update({
            "p074FamilyReproofReport": rel(REPORT_PATH),
            "p074ReadableTargetComparison": rel(CAPTURES / target["capture"]),
            "p074CombinedOriginalPositionPdf": rel(exports["original"]["pdf"]),
            "p074TargetSpecificSiblingPreservingEmptyPdf": rel(sibling_exports[candidate_id]["pdf"]),
            "p074TargetSpecificSiblingPreservingEmptyLog": rel(sibling_exports[candidate_id]["log"]),
        })
        row["p074FamilyReproof"] = candidate_report[candidate_id]
        row["candidateVisualReview"] = {
            "reviewer": "root plus independent read-only combat-family review",
            "status": "candidate READY; separate p.74 F marker keeps page structural PASS withheld",
            "evidence": {
                "familyReproofReport": rel(REPORT_PATH),
                "readableComparison": rel(CAPTURES / target["capture"]),
                "targetSpecificEmptyPdf": rel(sibling_exports[candidate_id]["pdf"]),
            },
            "pageLevelPassAsserted": False,
        }
    summary = ledger["summary"]
    summary["technicallyReadyAndVisuallyValidated"] += 2
    summary["technicallyPending"] -= 2
    summary["sourceIdentityAndSlotConfirmed"] += 2
    summary["candidateScopePlacementPromotionsInV15"] = list(TARGETS)
    summary["p074CandidateLevelVisualReviewCount"] = 2
    summary["p074CandidateLevelVisualReviewIds"] = list(TARGETS)
    summary["p074CandidateLevelVisualReviewPassed"] = True
    summary["p074PageLevelStructuralPassAsserted"] = False
    summary["pageLevelStructuralPassWithheld"] = sorted(set(summary["pageLevelStructuralPassWithheld"] + [74]))
    summary["p074FMarkerHoldout"] = {
        "page": 74,
        "blocksPageLevelPass": True,
        "evidence": rel(CAPTURES / "p074-f-marker-source-vs-export-v1.png"),
        "finding": marker["finding"],
    }
    page_findings = ledger.setdefault("pageLevelStructuralFindings", [])
    if not any(item.get("page") == 74 for item in page_findings):
        page_findings.append({
            "page": 74,
            "classification": "two individual white-die placements READY; independent F reference marker still blocks page-level PASS",
            "finding": marker["finding"],
            "blocksPageLevelPass": True,
            "evidence": rel(CAPTURES / "p074-f-marker-source-vs-export-v1.png"),
        })
    counts = Counter(row["status"] for row in ledger["placements"])
    expected_counts = Counter({"READY": 79, "AESTHETIC_APPROVAL_PENDING": 3, "PENDING": 11, "BLOCKED": 18})
    if counts != expected_counts:
        raise AssertionError(f"Unexpected v15 status counts: {counts}")
    if len({row["candidateId"] for row in ledger["placements"]}) != 111:
        raise AssertionError("The frozen placement ID set changed")
    if sum(bool(row["identityAndSlotConfirmed"]) for row in ledger["placements"]) != 82:
        raise AssertionError("Unexpected confirmed placement identity/slot count")
    if summary["canonicalPlacementsApplied"] != 0 or summary["specialCompositionCasesExcluded"] != 6:
        raise AssertionError("Canonical writes or special composition case count changed")
    ledger["verification"]["p074OriginalPositionReproofV1"] = {
        "status": "two existing candidate placements READY; page structural PASS withheld by F marker",
        "report": rel(REPORT_PATH),
        "reportSha256": report_sha,
        "applicationTestsRerun": False,
        "reasonTestsNotRerun": "This slice changed proof snapshots, receipts, and documentation only; it did not change application code.",
    }
    ledger["sources"]["p074FamilyReproofReportSha256"] = report_sha
    ledger["sources"]["p074OriginalPositionPdfSha256"] = sha256(exports["original"]["pdf"])
    ledger["sources"]["p074FMarkerHoldoutCaptureSha256"] = sha256(CAPTURES / "p074-f-marker-source-vs-export-v1.png")

    ledger_json_bytes = json_bytes(ledger)
    fields = [
        "candidateId", "page", "symbolId", "status", "identityAndSlotConfirmed",
        "isolatedPatchPrepared", "appliedInDryRunSimulation", "canonicalApplied",
        "visualStatus", "statusOrigin", "reason",
    ]
    csv_buffer = io.StringIO(newline="")
    writer = csv.DictWriter(csv_buffer, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for row in ledger["placements"]:
        writer.writerow({key: row.get(key, "") for key in fields})
    csv_bytes = csv_buffer.getvalue().encode("utf-8")
    markdown = f"""# MIDDARA — Ledger de prontidão para tradução (v15)

Atualizado em 2026-10-14. Parte do v14 e preserva os mesmos 111 placements. Não grava no canônico.

## Estado

- **79 READY** no escopo individual dos placements.
- **3 aguardando aceite estético humano**, todos da p.92; a textura sintética é uma aproximação, não recuperação exata da arte.
- **11 pendentes** de evidência própria.
- **18 bloqueados** dentro dos 111.
- **82** com identidade e slot confirmados.
- Total congelado: **111**. As seis composições especiais continuam separadas e bloqueadas. Outliers confirmados fora do lote permanecem fora.
- Reconciliação preservada: **80 candidatos iniciais + 37 reconciliados = 117 possibilidades; 117 − 6 composições especiais = 111 patches preparados**. A p.74 apenas promove dois IDs existentes; não cria descobertas.
- Aplicações canônicas: **0**.

## Fechamento candidato da p.74

`p074-v195-198-n4` e `p074-v203-206-n4` passam a READY em escopo de placement. O PDF fonte foi conferido pelo SHA-256 `{SOURCE_SHA256}`. O snapshot EN usa `page_74_block_4` sem `__en` e `lineHeight: 1.4`, calculada por 14 pt entre baselines dividido pelo corpo fonte de 10 pt. A redação coincide byte a byte com o snapshot-base normalizado do primeiro placement; o snapshot histórico do segundo tinha um espaço ASCII inicial extra, documentado no relatório. Nenhuma tradução foi gravada.

O export combinado de posição original tem exatamente dois dados em Viewer e Print, com os dois assets-fonte associados aos seus slots após os rótulos WHITE. Para cada ID há também um PDF isolado que remove somente aquele alvo e mantém o placement vizinho: o alvo removido cai para zero no estado e o irmão permanece exatamente uma vez. Os quatro exports usam snapshots imutáveis EN e passaram `pdfVerification`; métricas viewer/print conferem. A repetição dos exports original e vazio teve pixels idênticos na página a 100%; hashes byte a byte diferem por metadados serializados pelo Chromium.

### p.74 — primeiro dado

![Fonte, export com os dois dados, e export sem o primeiro dado enquanto o segundo permanece]({CAPTURES.relative_to(OUTPUT).as_posix()}/{TARGETS['p074-v195-198-n4']['capture']})

### p.74 — segundo dado

![Fonte, export com os dois dados, e export sem o segundo dado enquanto o primeiro permanece]({CAPTURES.relative_to(OUTPUT).as_posix()}/{TARGETS['p074-v203-206-n4']['capture']})

## Pendência estrutural da p.74

O marcador `F` se desloca com a redação EN enquanto o tile branco vetorial permanece na posição fonte. Por isso a p.74 entra na lista de páginas sem PASS estrutural. Esse achado é independente dos dois dados liberados.

![O PDF fonte mantém F dentro do tile; o PDF exportado move F e deixa o tile vazio]({CAPTURES.relative_to(OUTPUT).as_posix()}/p074-f-marker-source-vs-export-v1.png)

## Integridade e limites

- Cada candidato tem evidência própria: asset e índice vetorial conferidos, slot visível no PDF combinado e estado específico que remove apenas esse alvo preservando o vizinho.
- O resultado não promove automaticamente outro placement da p.74, nem certifica a página inteira.
- Nenhum Payload, sidecar canônico, PDF fonte ou tradução humana foi escrito nesta fatia; sem commit/push.
- A suíte de aplicação não foi executada nesta fatia de prova. Use o registro de testes do v14 para resultados anteriores; ele não representa aprovação integral da suíte.

## Arquivos de verificação

- [Relatório reproduzível da p.74](p074-original-position-reproof-v1/p074-family-reproof-report-v1.json) — SHA-256 `{report_sha}`.
- [Script de snapshots isolados](../../../scripts/build_p074_slot_isolation_snapshots_v1.py).
- [Script de finalização](../../../scripts/finalize_p074_original_position_reproof_v1.py).
- [Ledger JSON](readiness-ledger-v15.json) · [CSV](readiness-ledger-v15.csv) · [Ledger anterior v14](readiness-ledger-v14.md).
"""
    write_immutable(REPORT_PATH, report_bytes)
    write_immutable(V15_JSON, ledger_json_bytes)
    write_immutable(V15_CSV, csv_bytes)
    write_immutable(V15_MD, markdown.encode("utf-8"))
    print(json.dumps({
        "report": rel(REPORT_PATH),
        "reportSha256": report_sha,
        "ledger": rel(V15_JSON),
        "ledgerSha256": hashlib.sha256(ledger_json_bytes).hexdigest(),
        "csv": rel(V15_CSV),
        "markdown": rel(V15_MD),
        "counts": dict(counts),
        "identityAndSlotConfirmed": 82,
        "pageLevelStructuralPassWithheld": summary["pageLevelStructuralPassWithheld"],
        "canonicalPayloadTranslationOrSourceWrites": 0,
        "commitsOrPushes": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
