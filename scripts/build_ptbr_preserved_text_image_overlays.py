"""Create PT-BR variants of shared source-image crops with live prose left clear."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


PAGES_ROOT = Path("apps/web/public/pages")
SOURCE_PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
LOCAL_FONTS = Path("apps/web/public/fonts")
FONT_FILES = {
    "OptimaLTStd": "Optima LT Std Roman.otf",
    "OptimaLTStd-Bold": "Optima LT Std Bold.otf",
    "OptimaLTStd-Italic": "Optima LT Std Italic.otf",
    "OptimaLTStd-BoldItalic": "Optima LT Std Bold Italic.otf",
    "OptimaLTStd-Black": "Optima LT Std Black.otf",
    "OptimaLTStd-BlackItalic": "Optima LT Std Black Italic.otf",
    "OptimaLTStd-DemiBold": "Optima LT Std Demi.otf",
    "OptimaLTStd-DemiBoldItalic": "Optima LT Std Demi Italic.otf",
    "OptimaLTStd-ExtraBlack": "Optima LT Std Extra Black.otf",
    "OptimaLTStd-ExtraBlackItalic": "Optima LT Std Extra Black Italic.otf",
    "OptimaLTStd-Medium": "Optima LT Std Medium.otf",
    "OptimaLTStd-MediumItalic": "Optima LT Std Medium Italic.otf",
    "Cinzel-Regular": "Cinzel-Regular.otf",
    "Cinzel-Bold": "Cinzel-Bold.otf",
    "Cinzel-Black": "Cinzel-Black.otf",
}
VARIANTS = {
    "page_016": {
        "source": "fidelity-overlay-exit-tokens.png",
        "target": "fidelity-overlay-exit-tokens-ptbr.png",
        "source_pdf_page": 16,
        "preserve_lines": {"line_175_7": "things more difficult!"},
    },
}


def normalized(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\n", " ")).strip()


def draw_live_glyph_mask(
    mask: Image.Image,
    page: pymupdf.Page,
    page_bbox: list[float],
    line: dict,
    font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont],
) -> int:
    """Mask only the PDF glyph shapes, leaving adjacent artwork pixels opaque."""
    line_bbox = line["bbox"]
    line_center_y = (line_bbox[1] + line_bbox[3]) / 2
    scale_x = mask.width / (page_bbox[2] - page_bbox[0])
    scale_y = mask.height / (page_bbox[3] - page_bbox[1])
    if abs(scale_x - scale_y) > 0.01:
        raise ValueError(f"Non-uniform source crop scale is unsupported: {scale_x}, {scale_y}")

    draw = ImageDraw.Draw(mask)
    masked_chars = 0
    for span in page.get_texttrace():
        font_name = span["font"]
        font_file = FONT_FILES.get(font_name)
        for char in span.get("chars", []):
            codepoint, _glyph_id, origin, char_bbox = char
            char_center_y = (char_bbox[1] + char_bbox[3]) / 2
            # Pair by the actual PDF character baseline, not block/line rectangles.
            # Bound the right edge by the selected source line so printed card text
            # at the same height cannot accidentally be erased.
            if abs(char_center_y - line_center_y) > 2.0:
                continue
            if char_bbox[2] <= page_bbox[0] or char_bbox[0] >= page_bbox[2]:
                continue
            if char_bbox[0] >= line_bbox[2] + 0.5 or codepoint < 32:
                continue
            if not font_file:
                raise ValueError(f"No local mask font is mapped for source font {font_name!r}")

            font_size_px = round(span["size"] * scale_y)
            font_key = (font_name, font_size_px)
            if font_key not in font_cache:
                font_path = LOCAL_FONTS / font_file
                if not font_path.is_file():
                    raise FileNotFoundError(font_path)
                font_cache[font_key] = ImageFont.truetype(str(font_path), font_size_px)

            x_px = (origin[0] - page_bbox[0]) * scale_x
            y_px = (origin[1] - page_bbox[1]) * scale_y
            draw.text((x_px, y_px), chr(codepoint), font=font_cache[font_key], fill=255, anchor="ls")
            masked_chars += 1
    return masked_chars


def main() -> None:
    if not SOURCE_PDF.is_file():
        raise FileNotFoundError(SOURCE_PDF)
    source_pdf = pymupdf.open(SOURCE_PDF)
    created = 0
    updated = 0
    for page_name, spec in VARIANTS.items():
        page_dir = PAGES_ROOT / page_name
        sidecar_path = page_dir / "fidelity_overlays.json"
        dom_path = page_dir / f"{page_name}_dom.json"
        source_path = page_dir / spec["source"]
        target_path = page_dir / spec["target"]

        sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
        overlays = sidecar.get("overlays", [])
        source_url = f"/pages/{page_name}/{spec['source']}"
        source_overlay = next(
            (overlay for overlay in overlays if overlay.get("url") == source_url and overlay.get("language") == "en"),
            None,
        )
        if source_overlay is None:
            raise ValueError(f"Missing audited English overlay for {page_name}: {source_url}")

        data = json.loads(dom_path.read_text(encoding="utf-8"))
        lines = {
            line["id"]: line
            for block in data.get("blocks", [])
            for line in block.get("lines", [])
        }
        with Image.open(source_path) as source_image:
            image = source_image.convert("RGBA")
        width_px, height_px = image.size
        if width_px != source_overlay["widthPx"] or height_px != source_overlay["heightPx"]:
            raise ValueError(f"Unexpected pixel dimensions for {source_path}: {image.size}")

        mask = Image.new("L", image.size, 0)
        font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}
        masked_counts = {}
        source_page = source_pdf[spec["source_pdf_page"] - 1]
        for line_id, expected_text in spec["preserve_lines"].items():
            line = lines[line_id]
            actual_text = normalized("".join(span.get("text", "") for span in line.get("spans", [])))
            if actual_text != expected_text:
                raise ValueError(f"{page_name}/{line_id} changed: {actual_text!r}")
            masked_counts[line_id] = draw_live_glyph_mask(
                mask, source_page, source_overlay["bbox"], line, font_cache,
            )

        # Expand by one output pixel for antialias fringe, then clear only glyph
        # pixels. A line-sized rectangular knockout can cut adjacent card art.
        mask = mask.filter(ImageFilter.MaxFilter(3)).point(lambda value: 255 if value else 0)
        alpha = ImageChops.multiply(image.getchannel("A"), ImageChops.invert(mask))
        image.putalpha(alpha)
        image.save(target_path, format="PNG", optimize=True)
        target_url = f"/pages/{page_name}/{spec['target']}"
        target_overlay = {
            "url": target_url,
            "bbox": source_overlay["bbox"],
            "widthPx": width_px,
            "heightPx": height_px,
            "language": "pt-BR",
            "sourceOverlayUrl": source_url,
            "preservedTextLineIds": list(spec["preserve_lines"]),
            "maskMethod": "pdf-glyph-contours",
            "auditId": f"2026-10-04-{page_name}-source-art-with-live-glyph-masks-v2",
            "sourcePdfPage": spec["source_pdf_page"],
        }

        existing = next((overlay for overlay in overlays if overlay.get("url") == target_url), None)
        if existing:
            if existing != target_overlay:
                overlays[overlays.index(existing)] = target_overlay
                updated += 1
        else:
            overlays.append(target_overlay)
            created += 1
        sidecar_path.write_text(
            json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"{page_name}: PDF glyph masks by line={masked_counts}")

    print(f"Created {created} and updated {updated} PT-BR source-art variants; no translation data was read or changed.")


if __name__ == "__main__":
    main()
