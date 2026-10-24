"""Map the three source inline symbols in p.30's example to editable semantics.

The official PDF is read-only. Dry-run by default; --apply snapshots the three
project records, then adds source-local SVGs, pre-text cleanup patches, sidecar
placements, a compound Book-with-3 symbol, and the proposal's semantic runs.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageChops, ImageFilter, ImageOps
from fontTools.cffLib import CFFFontSet
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
EXPECTED_PDF_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
PAGE = ROOT / "apps/web/public/pages/page_030"
BACKGROUND = PAGE / "background.webp"
DOM = PAGE / "page_030_dom.json"
SIDECAR = PAGE / "inline_elements.json"
REGISTRY = ROOT / "apps/web/src/symbols/sourceSymbols.json"
PROPOSAL = ROOT / "docs/translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.json"
EVIDENCE = ROOT / "output/proofs/source-symbol-inline-focus-2026-10-23/p030-family"
ROLLBACK = EVIDENCE / "rollback"
PAGE_INDEX = 29
CONTENT_XREF = 55946
FONT_XREF = 161489
SCALE = 1710 / 820.3460083007812
NUMBER_SOURCE = {"lineId": "line_41_5", "spanIndex": 1, "text": "3"}

TARGETS = [
    {
        "id": "p30-inline-shield-example", "symbolId": "combat.shield",
        "candidateId": "p030-v111-113-n3",
        "sourceAppearanceKey": "p30-inline-shield-vector-v1", "sourceAsset": "source-shield-p30.svg",
        "maskFile": "inline-element-mask-p30-shield.png", "drawingIndices": [111, 112, 113],
        "bbox": [454.2322082519531, 402.49200439453125, 466.92620849609375, 415.7440185546875],
        "lineId": "line_41_1", "spanIndex": 0, "side": "after", "ownerSpanRef": {"lineId": "line_41_1", "spanIndex": 0},
        "gapPt": -0.304291,
    },
    {
        "id": "p30-inline-book-example", "symbolId": "combat.page",
        "candidateId": "p030-v114-115-n2",
        "sourceAppearanceKey": "p30-inline-book-vector-v1", "sourceAsset": "source-page-p30.svg",
        "maskFile": "inline-element-mask-p30-book.png", "drawingIndices": [114, 115],
        "bbox": [469.560791015625, 402.52301025390625, 481.8017883300781, 415.7440185546875],
        "lineId": "line_41_3", "spanIndex": 0, "side": "before", "ownerSpanRef": {"lineId": "line_41_3", "spanIndex": 0},
        "lineStartX": 469.560791015625,
    },
    {
        "id": "p30-inline-book-3-example", "symbolId": "combat.page.3",
        "candidateId": "p030-v116-117-n2",
        "sourceAppearanceKey": "p30-inline-book-3-vector-glyph-v1", "sourceAsset": "source-page-3-p30.svg",
        "maskFile": "inline-element-mask-p30-book-3.png", "drawingIndices": [116, 117],
        "bbox": [649.656494140625, 426.52301025390625, 661.896484375, 439.7440185546875],
        "lineId": "line_41_5", "spanIndex": 2, "side": "before", "ownerSpanRef": {"lineId": "line_41_5", "spanIndex": 0},
        "coveredSourceText": NUMBER_SOURCE,
    },
]


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def fmt(value: float) -> str:
    return f"{value:.7f}".rstrip("0").rstrip(".") or "0"


def drawing_path(drawing: dict, origin: tuple[float, float]) -> str:
    ox, oy = origin
    commands: list[str] = []
    current = None
    first = None
    last = None
    for item in drawing["items"]:
        kind, *points = item
        if kind == "re":
            rect = points[0]
            commands.append(
                f"M {fmt(rect.x0-ox)} {fmt(rect.y0-oy)} h {fmt(rect.width)} v {fmt(rect.height)} h {fmt(-rect.width)} Z"
            )
            current = None
            continue
        point = points[0]
        if first is None:
            first = point
        if current is None or abs(current.x-point.x) > .001 or abs(current.y-point.y) > .001:
            commands.append(f"M {fmt(point.x-ox)} {fmt(point.y-oy)}")
        if kind == "l":
            end = points[1]
            commands.append(f"L {fmt(end.x-ox)} {fmt(end.y-oy)}")
            current = end
        elif kind == "c":
            c1, c2, end = points[1:]
            commands.append(
                f"C {fmt(c1.x-ox)} {fmt(c1.y-oy)} {fmt(c2.x-ox)} {fmt(c2.y-oy)} {fmt(end.x-ox)} {fmt(end.y-oy)}"
            )
            current = end
        elif kind == "qu":
            quad = points[0]
            commands.append(
                f"M {fmt(quad.ul.x-ox)} {fmt(quad.ul.y-oy)} L {fmt(quad.ur.x-ox)} {fmt(quad.ur.y-oy)} "
                f"L {fmt(quad.lr.x-ox)} {fmt(quad.lr.y-oy)} L {fmt(quad.ll.x-ox)} {fmt(quad.ll.y-oy)} Z"
            )
            current = quad.ll
        else:
            raise ValueError(f"Unsupported source drawing operator {kind!r}")
        last = current
    if first is not None and last is not None and abs(first.x-last.x) < .001 and abs(first.y-last.y) < .001:
        commands.append("Z")
    return " ".join(commands)


def source_color(fill: tuple[float, float, float] | None) -> str:
    if fill is None:
        return "none"
    return "rgb(" + ",".join(fmt(channel * 255) for channel in fill) + ")"


def source_paths(drawings: list[dict], target: dict) -> list[dict]:
    x0, y0, _, _ = target["bbox"]
    paths = []
    for index in target["drawingIndices"]:
        drawing = drawings[index]
        if drawing.get("fill") is None or drawing.get("color") is not None:
            raise ValueError(f"Unexpected stroke/fill topology in p.30 drawing {index}.")
        paths.append({"d": drawing_path(drawing, (x0, y0)), "fill": source_color(drawing["fill"])})
    return paths


def glyph_three_path(doc: fitz.Document, target: dict) -> str:
    font_name, extension, _, raw = doc.extract_font(FONT_XREF)
    if extension.lower() != "cff" or "OptimaLTStd-Bold" not in font_name:
        raise ValueError(f"Unexpected source numeral font: {font_name}.{extension}")
    cff = CFFFontSet()
    cff.decompile(io.BytesIO(raw), None)
    charstrings = cff.topDictIndex[0].CharStrings
    if "three" not in charstrings.keys():
        raise ValueError("Embedded source font has no three glyph outline.")
    charstring = charstrings["three"]
    pen = SVGPathPen(None)
    charstring.draw(pen)
    span = next(
        span
        for block in doc[PAGE_INDEX].get_text("dict")["blocks"]
        if "lines" in block
        for line in block["lines"]
        for span in line["spans"]
        if span["text"] == "3" and abs(span["size"] - 9) < .02
        and abs(span["bbox"][0] - 653.6043701171875) < .02
    )
    x0, y0, _, _ = target["bbox"]
    origin_x, baseline_y = span["origin"]
    scale = span["size"] / 1000
    tx, ty = origin_x - x0, baseline_y - y0
    # CFF coordinates are 1000-em, y-up. This reproduces the PDF's embedded
    # Optima bold numeral instead of approximating it with a browser font.
    return (
        f'<path d="{pen.getCommands()}" fill="#ffffff" '
        f'transform="translate({fmt(tx)} {fmt(ty)}) scale({fmt(scale)} {fmt(-scale)})"/>'
    )


def svg_document(target: dict, paths: list[dict], crop_bbox: list[float], glyph: str | None = None) -> bytes:
    x0, y0, x1, y1 = target["bbox"]
    left, top, right, bottom = crop_bbox
    width, height = right - left, bottom - top
    root = ET.Element("svg", xmlns="http://www.w3.org/2000/svg", width=f"{width:.8f}pt",
                      height=f"{height:.8f}pt", viewBox=f"0 0 {width:.8f} {height:.8f}")
    group = ET.SubElement(root, "g", transform=f"translate({x0-left:.8f} {y0-top:.8f})")
    for path in paths:
        ET.SubElement(group, "path", {"d": path["d"], "fill": path["fill"]})
    if glyph:
        # CFF outline is user-controlled SVG path data from the immutable font.
        group.append(ET.fromstring(glyph))
    return ET.tostring(root, encoding="utf-8")


def symbol_svg(target: dict, paths: list[dict], glyph: str | None = None) -> bytes:
    x0, y0, x1, y1 = target["bbox"]
    width, height = x1 - x0, y1 - y0
    root = ET.Element("svg", xmlns="http://www.w3.org/2000/svg", width=f"{width:.8f}pt",
                      height=f"{height:.8f}pt", viewBox=f"0 0 {width:.8f} {height:.8f}")
    group = ET.SubElement(root, "g")
    for path in paths:
        ET.SubElement(group, "path", {"d": path["d"], "fill": path["fill"]})
    if glyph:
        group.append(ET.fromstring(glyph))
    return ET.tostring(root, encoding="utf-8")


def render_svg(data: bytes, sx: float, sy: float) -> Image.Image:
    doc = fitz.open("svg", data)
    pix = doc[0].get_pixmap(matrix=fitz.Matrix(sx, sy), alpha=True)
    return Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)


def max_rgb_diff(a: Image.Image, b: Image.Image) -> Image.Image:
    channels = ImageChops.difference(a.convert("RGB"), b.convert("RGB")).split()
    return ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])


def crop_box(target: dict, sx: float, sy: float) -> tuple[tuple[int, int, int, int], list[float]]:
    x0, y0, x1, y1 = target["bbox"]
    # One source-background raster pixel on each side retains the native
    # antialias fringe while keeping neighboring ink outside the patch.
    pixels = (math.floor(x0 * sx) - 1, math.floor(y0 * sy) - 1,
              math.ceil(x1 * sx) + 1, math.ceil(y1 * sy) + 1)
    return pixels, [pixels[0] / sx, pixels[1] / sy, pixels[2] / sx, pixels[3] / sy]


def add_compound_symbol(registry_bytes: bytes, target: dict) -> bytes:
    text = registry_bytes.decode("utf-8")
    registry = json.loads(text)
    if any(item.get("id") == "combat.page.3" for item in registry):
        raise ValueError("Refusing to replace an existing combat.page.3 symbol definition.")
    symbol = {
        "id": "combat.page.3",
        "category": "Regras e combate",
        "labels": {"en": "Page combat symbol marked with 3", "pt-BR": "Símbolo de página de combate marcado com 3"},
        "description": {
            "en": "Compound source symbol: the Page combat icon with its printed numeral 3.",
            "pt-BR": "Símbolo composto do PDF: ícone de combate em forma de página com o número 3 impresso.",
        },
        "searchTerms": {
            "en": ["page combat symbol with 3", "book icon marked 3", "page symbol printed 3", "numbered page combat symbol"],
            "pt-BR": ["símbolo de página com 3", "ícone de livro marcado com 3", "símbolo de página impresso com 3", "símbolo numerado de combate"],
        },
        "editorTokens": {
            "en": "⟦Page combat symbol marked with 3⟧",
            "pt-BR": "⟦Símbolo de página de combate marcado com 3⟧",
        },
        "allowedBlockTypes": ["paragraph", "typographic-field", "span-unit", "credit-field"],
        "assetUrl": f"/pages/page_030/{target['sourceAsset']}",
        "source": {
            "pdf": "Rulebook 1p2 Final Version 05-19-23 Optimized.pdf",
            "page": 30,
            "bboxPt": target["bbox"],
            "assetSizePx": [0, 0],
        },
        "render": {
            "widthEm": (target["bbox"][2] - target["bbox"][0]) / 10,
            "heightEm": (target["bbox"][3] - target["bbox"][1]) / 10,
            "verticalAlignEm": 0.3,
        },
    }
    if not text.rstrip().endswith("]"):
        raise ValueError("Unexpected sourceSymbols.json array ending.")
    newline = "\r\n" if "\r\n" in text else "\n"
    normalized = text.replace("\r\n", "\n")
    closing = normalized.rfind("]")
    before = normalized[:closing].rstrip()
    if not before.endswith("}"):
        raise ValueError("Unexpected final source symbol record.")
    insertion = ",\n  " + json.dumps(symbol, ensure_ascii=False, indent=2).replace("\n", "\n  ") + "\n"
    updated = before + insertion + normalized[closing:]
    json.loads(updated)
    return updated.replace("\n", newline).encode("utf-8")


def set_symbol_run(font: str, size: float, symbol_id: str, target: dict) -> dict:
    x0, y0, x1, y1 = target["bbox"]
    return {
        "font": font, "size": size, "color": "#231f20", "weight": 400, "style": "normal",
        "disableLigatures": True, "symbolId": symbol_id, "text": "\ufffc",
        "symbolMetrics": {
            "widthEm": (x1 - x0) / size, "heightEm": (y1 - y0) / size, "verticalAlignEm": 0.3,
            "advanceEm": (x1 - x0) / size, "sourceAssetUrl": f"/pages/page_030/{target['sourceAsset']}",
            "sourceAppearanceKey": target["sourceAppearanceKey"],
        },
    }


def proposal_segments(targets: list[dict]) -> list[dict]:
    shield, book, book3 = targets
    def plain(text: str, *, bold: bool = False) -> dict:
        return {"font": "OptimaLTStd-Bold" if bold else "OptimaLTStd", "size": 9 if bold else 10,
                "color": "#231f20", "weight": 700 if bold else 400, "style": "normal",
                "disableLigatures": True, "text": text}
    return [
        plain("Algumas Habilidades que usam Símbolos como Condição podem ter vários Símbolos impressos. ( "),
        set_symbol_run("OptimaLTStd", 10, shield["symbolId"], shield),
        plain(" "),
        set_symbol_run("OptimaLTStd", 10, book["symbolId"], book),
        plain(" ) Nesses casos, usar a Habilidade uma vez custa "),
        plain("1", bold=True), plain(" Livro e "), plain("1", bold=True),
        plain(" Escudo. Em outros casos, pode haver Símbolos demais para caber na carta; por isso, eles são impressos com números. Por exemplo, ( "),
        set_symbol_run("OptimaLTStd", 10, book3["symbolId"], book3),
        plain(" ) significa que um Aventureiro deve gastar "), plain("3", bold=True),
        plain(" Livros para usar essa Habilidade."),
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write the validated semantic mappings and evidence.")
    args = parser.parse_args()
    if sha256(PDF.read_bytes()) != EXPECTED_PDF_SHA256:
        raise ValueError("Official source PDF hash changed; re-check p.30 before applying.")
    background = Image.open(BACKGROUND).convert("RGB")
    if background.size != (1710, 1710):
        raise ValueError(f"Unexpected p.30 background pixel grid: {background.size}")
    dom = json.loads(DOM.read_text(encoding="utf-8"))
    sidecar_bytes, registry_bytes, proposal_bytes = SIDECAR.read_bytes(), REGISTRY.read_bytes(), PROPOSAL.read_bytes()
    sidecar = json.loads(sidecar_bytes)
    proposal = json.loads(proposal_bytes.decode("utf-8"))
    if any(element.get("id", "").startswith("p30-inline-") for element in sidecar["elements"]):
        raise ValueError("p.30 inline family already has a mapping; inspect before retrying.")
    source = proposal["sourcePdfSha256"]
    if source != EXPECTED_PDF_SHA256:
        raise ValueError("The proposal's pinned source PDF differs from the verified document.")
    owner = next((block for block in dom["blocks"] if block.get("id") == "block_41"), None)
    if owner is None:
        raise ValueError("Expected p.30 block_41 source example was not found.")
    block_index = next(i for i, block in enumerate(dom["blocks"]) if block.get("id") == "block_41")
    with fitz.open(PDF) as doc:
        page = doc[PAGE_INDEX]
        if page.get_contents() != [CONTENT_XREF]:
            raise ValueError(f"Unexpected source content stream list: {page.get_contents()}")
        stream = doc.xref_stream(CONTENT_XREF)
        marker = re.search(rb"/P\s+<</Lang\s+\(en-US\)/MCID\s+\d+\s*>>BDC", stream)
        if marker is None or marker.start() != 238:
            raise ValueError("Verified first text paint marker moved in p.30.")
        with fitz.open(PDF) as underlay_doc:
            underlay_doc.update_stream(CONTENT_XREF, stream[:marker.start()])
            underlay_pix = underlay_doc[PAGE_INDEX].get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), alpha=False)
            underlay = Image.frombytes("RGB", (underlay_pix.width, underlay_pix.height), underlay_pix.samples)
        full_pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), alpha=False)
        full = Image.frombytes("RGB", (full_pix.width, full_pix.height), full_pix.samples)
        if underlay.size != background.size or full.size != background.size:
            raise ValueError("Source render, pre-text underlay, and Viewer raster grids differ.")
        drawings = page.get_drawings()
        span = next(
            span
            for block in page.get_text("dict")["blocks"] if "lines" in block
            for line in block["lines"] for span in line["spans"]
            if span["text"] == "3" and abs(span["size"] - 9) < .02
            and abs(span["bbox"][0] - 653.6043701171875) < .02
        )
        if abs(span["origin"][1] - 435.805419921875) > .02:
            raise ValueError("The source numeral baseline changed.")
        glyph = glyph_three_path(doc, TARGETS[2])
        rendered = []
        mask_crops = []
        full_rebuilt = background.copy()
        metrics = []
        for target in TARGETS:
            line = next((line for line in owner["lines"] if line["id"] == target["lineId"]), None)
            if line is None or target["spanIndex"] >= len(line["spans"]):
                raise ValueError(f"Unresolved source text anchor: {target['lineId']}:{target['spanIndex']}")
            target["blockIndex"] = block_index
            target["metrics"] = {
                "widthEm": (target["bbox"][2] - target["bbox"][0]) / 10,
                "heightEm": (target["bbox"][3] - target["bbox"][1]) / 10,
                "verticalAlignEm": .3,
                "advanceEm": (target["bbox"][2] - target["bbox"][0]) / 10,
                "sourceAssetUrl": f"/pages/page_030/{target['sourceAsset']}",
                "sourceAppearanceKey": target["sourceAppearanceKey"],
            }
            target["paths"] = source_paths(drawings, target)
            target["glyphPath"] = glyph if target["symbolId"] == "combat.page.3" else None
            target["pixelBox"], target["maskBBox"] = crop_box(target, SCALE, SCALE)
            crop = underlay.crop(target["pixelBox"])
            original_background = background.crop(target["pixelBox"])
            original_pdf = full.crop(target["pixelBox"])
            overlay = render_svg(svg_document(target, target["paths"], target["maskBBox"], target["glyphPath"]), SCALE, SCALE)
            if overlay.size != crop.size:
                raise ValueError(f"Raster/pixel-grid mismatch for {target['id']}: {overlay.size} != {crop.size}")
            rebuilt = Image.alpha_composite(crop.convert("RGBA"), overlay).convert("RGB")
            allowed = overlay.getchannel("A").point(lambda value: 255 if value > 8 else 0).filter(ImageFilter.MaxFilter(3))
            background_diff = max_rgb_diff(original_background, crop)
            pdf_diff = max_rgb_diff(original_pdf, rebuilt)
            outside_bg = ImageChops.multiply(background_diff.point(lambda value: 255 if value > 16 else 0), ImageChops.invert(allowed)).histogram()[255]
            outside_pdf = ImageChops.multiply(pdf_diff.point(lambda value: 255 if value > 16 else 0), ImageChops.invert(allowed)).histogram()[255]
            source_ink = background_diff.point(lambda value: 255 if value > 40 else 0)
            vector_ink = overlay.getchannel("A").point(lambda value: 255 if value > 24 else 0)
            intersection = ImageChops.darker(source_ink, vector_ink).histogram()[255]
            union = ImageChops.lighter(source_ink, vector_ink).histogram()[255]
            iou = intersection / union if union else 0
            if outside_bg or outside_pdf:
                raise ValueError(f"Source patch reaches outside confirmed ink for {target['id']}: webp={outside_bg}, PDF={outside_pdf}")
            if iou < .78:
                raise ValueError(f"PDF vector-to-Viewer raster overlap is too low for {target['id']}: IoU={iou:.4f}")
            # The cleanup crop is the verified source layer before any text/vector,
            # copied on the exact immutable background pixel grid.
            target["mask"] = {"url": f"/pages/page_030/{target['maskFile']}", "bbox": target["maskBBox"]}
            target["anchor"] = {
                "blockId": "block_41", "blockIndex": block_index, "lineId": target["lineId"],
                "spanIndex": target["spanIndex"], "side": target["side"], "sizePt": 10,
                "ownerSpanRef": target["ownerSpanRef"],
                **({"gapPt": target["gapPt"]} if "gapPt" in target else {}),
                **({"lineStartX": target["lineStartX"]} if "lineStartX" in target else {}),
            }
            if "coveredSourceText" in target:
                target["coveredSourceText"] = target["coveredSourceText"]
            mask_crops.append((target, crop))
            full_rebuilt.paste(rebuilt, target["pixelBox"][:2])
            rendered.append((target, overlay, original_background, crop, rebuilt, original_pdf))
            metrics.append({
                "id": target["id"], "bboxPt": target["bbox"], "drawingIndices": target["drawingIndices"],
                "pixelBox": target["pixelBox"], "sourceMaskIoU": round(iou, 4),
                "backgroundDiffPixelsOutsideInkOver16": outside_bg,
                "pdfDiffPixelsOutsideInkOver16": outside_pdf,
                "pdfDiffPixelsOver24": pdf_diff.point(lambda value: 255 if value > 24 else 0).histogram()[255],
                "maskExteriorPixels": ImageOps.invert(allowed).histogram()[255],
            })

    registry_after = add_compound_symbol(registry_bytes, TARGETS[2])
    new_registry = json.loads(registry_after.decode("utf-8"))
    if not any(item.get("id") == "combat.page.3" and item.get("assetUrl") == f"/pages/page_030/{TARGETS[2]['sourceAsset']}" for item in new_registry):
        raise ValueError("Compound symbol registry round-trip failed.")

    candidate = next((item for item in proposal["candidates"] if item.get("sourceBlockId") == "block_41"), None)
    if candidate is None:
        raise ValueError("The p.30 block_41 proposal candidate is missing.")
    segments = proposal_segments(TARGETS)
    data = {**candidate["data"], "segments": segments,
            "managedSourceSymbols": [target["symbolId"] for target in TARGETS]}
    candidate["data"] = data
    candidate["diagnosticData"] = json.loads(json.dumps(data, ensure_ascii=False))
    candidate["proposalText"] = (
        "Algumas Habilidades que usam Símbolos como Condição podem ter vários Símbolos impressos. "
        "⟦Escudo de defesa⟧ ⟦Símbolo de combate em forma de folha⟧ Nesses casos, usar a Habilidade uma vez custa 1 Livro e 1 Escudo. "
        "Em outros casos, pode haver Símbolos demais para caber na carta; por isso, eles são impressos com números. "
        "Por exemplo, (⟦Símbolo de página de combate ×3⟧) significa que um Aventureiro deve gastar 3 Livros para usar essa Habilidade."
    )
    candidate["proposalMarkup"] = (
        "Algumas Habilidades que usam Símbolos como Condição podem ter vários Símbolos impressos. ( "
        "[[symbol:combat.shield]] [[symbol:combat.page]] ) Nesses casos, usar a Habilidade uma vez custa 1 Livro e 1 Escudo. "
        "Em outros casos, pode haver Símbolos demais para caber na carta; por isso, eles são impressos com números. "
        "Por exemplo, ( [[symbol:combat.page.3]] ) significa que um Aventureiro deve gastar 3 Livros para usar essa Habilidade."
    )
    candidate["sourceSymbolsPreserved"] = [target["symbolId"] for target in TARGETS]
    candidate["status"] = "source_inline_symbols_mapped_in_viewer_and_proposal_copyfit_remeasurement_pending_human_review"
    candidate["technicalStatus"] = "source_vector_cleanup_and_semantic_mapping_applied_copyfit_remeasurement_pending"
    candidate["diagnosticRendering"] = "semantic_inline_symbols_in_proposal_preview"
    candidate["pendingTerms"] = [
        "The source has mixed bold formatting that still needs visual human review in the Editor."
    ]
    if candidate.get("copyfitMeasurement"):
        candidate["copyfitMeasurementBeforeSymbolRecovery"] = candidate["copyfitMeasurement"]
    candidate["pageRendererVisualLineCount"] = None
    candidate["copyfitClassification"] = "PENDING_REMEASUREMENT"
    candidate["copyfitMeasurement"] = {
        "status": "pending_live_page_renderer_remeasurement_after_symbol_recovery",
        "reason": "The former EXACT run measured placeholder copy. Re-measure the restored semantic-symbol proposal; no approval status is inferred.",
    }
    if "⟦preservar aqui os glifos originais" in candidate.get("proposalText", ""):
        raise ValueError("Placeholder text remains in the proposal.")
    updated_proposal = json.dumps(proposal, ensure_ascii=False, indent=2) + "\n"

    elements = []
    for target in TARGETS:
        element = {
            "id": target["id"], "symbolId": target["symbolId"], "sourceRendering": "semantic-inline",
            "bbox": target["bbox"], "drawingIndices": target["drawingIndices"],
            "anchor": target["anchor"], "metrics": target["metrics"], "mask": target["mask"],
            "provenance": {
                "auditId": "manual-source-mapping-2026-10-23-p30",
                "candidateId": target["candidateId"], "sourcePdfSha256": EXPECTED_PDF_SHA256,
                "sourceObjects": target["drawingIndices"], "underlayStreamXref": CONTENT_XREF,
                "appearanceKey": target["sourceAppearanceKey"],
            },
        }
        if "coveredSourceText" in target:
            element["coveredSourceText"] = target["coveredSourceText"]
        elements.append(element)
    sidecar["elements"].extend(elements)
    updated_sidecar = json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n"

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    contact = Image.new("RGB", (max(img.width for *_, img, _crop, _rebuilt, _pdf in rendered) * 3 + 60,
                                 sum(max(120, row.height * 4 + 44) for _, row, *_ in rendered)), "#f4f0e8")
    y = 0
    proof_rows = []
    for target, overlay, original, crop, rebuilt, original_pdf in rendered:
        scale = 5
        row = Image.new("RGB", (crop.width * scale * 4 + 56, crop.height * scale + 40), "#f4f0e8")
        for i, tile in enumerate([original, crop, rebuilt, original_pdf]):
            row.paste(tile.resize((crop.width * scale, crop.height * scale), Image.Resampling.NEAREST), (8 + i * (crop.width * scale + 8), 24))
        proof_rows.append(row)
    contact = Image.new("RGB", (max(row.width for row in proof_rows), sum(row.height for row in proof_rows)), "#f4f0e8")
    y = 0
    for row in proof_rows:
        contact.paste(row, (0, y)); y += row.height
    manifest = {
        "status": "preflight_passed" if not args.apply else "semantic_source_mapping_applied_copyfit_pending",
        "hypothesis": "The three p.30 example marks are source PDF vector drawings. The book icon with 3 is one compound semantic symbol; its numeral is an embedded PDF font glyph, not vector artwork.",
        "method": "Trace source PDF paint order and drawing indices; render the page content prefix before first text as the exact local underlay; reconstruct each PDF vector path and embedded Optima bold 3 outline; compare native PDF and Viewer background pixels at the same 1710x1710 grid.",
        "sourcePdf": str(PDF), "sourcePdfSha256": EXPECTED_PDF_SHA256, "contentStreamXref": CONTENT_XREF,
        "preTextPrefixBytes": 238, "fontXref": FONT_XREF, "font": "OFMTYB+OptimaLTStd-Bold / CFF glyph three",
        "page": 30, "sourceUnits": ["block_41", *[target["candidateId"] for target in TARGETS]],
        "mappings": metrics, "comparisonImage": str((EVIDENCE / "p030-vector-underlay-preflight.png").relative_to(ROOT)),
        "filesChanged": ([str(SIDECAR.relative_to(ROOT)), str(REGISTRY.relative_to(ROOT)), str(PROPOSAL.relative_to(ROOT)),
                          *[str((PAGE / target["sourceAsset"]).relative_to(ROOT)) for target in TARGETS],
                          *[str((PAGE / target["maskFile"]).relative_to(ROOT)) for target in TARGETS]] if args.apply else []),
        "approval": "not approved; candidate remains pending human editorial review; no Payload write",
        "copyfit": "previous EXACT was invalidated because it measured placeholder text; live PageRenderer remeasurement required after recovery",
        "rollback": str(ROLLBACK.relative_to(ROOT)) if args.apply else "no files changed during preflight",
    }
    contact.save(EVIDENCE / "p030-vector-underlay-preflight.png")
    (EVIDENCE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.apply:
        ROLLBACK.mkdir(parents=True, exist_ok=True)
        originals = {SIDECAR: sidecar_bytes, REGISTRY: registry_bytes, PROPOSAL: proposal_bytes}
        for path, raw in originals.items():
            backup = ROLLBACK / path.name
            backup.write_bytes(raw)
        manifest["rollbackHashes"] = {path.name: sha256(raw) for path, raw in originals.items()}
        (EVIDENCE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for target, _, _, crop, _, _ in rendered:
            crop.save(PAGE / target["maskFile"])
            (PAGE / target["sourceAsset"]).write_bytes(symbol_svg(target, target["paths"], target["glyphPath"]))
        REGISTRY.write_bytes(registry_after)
        SIDECAR.write_text(updated_sidecar, encoding="utf-8")
        PROPOSAL.write_text(updated_proposal, encoding="utf-8")
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "mappings": metrics,
                      "evidence": str(EVIDENCE), "status": manifest["status"]}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
