"""Compare source STATUS tag compounds on pages 37/58/100 to the official PDF."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from xml.sax.saxutils import quoteattr

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from build_inline_symbol_registry import PDF  # noqa: E402

REGISTRY = {item['id']: item for item in json.loads(
    (ROOT / 'apps/web/src/symbols/sourceSymbols.json').read_text(encoding='utf8'))}
SYMBOL = REGISTRY['tag.status']
OUT_DIR = ROOT / 'docs/project-progress/evidence/2026-10-05-inline-elements-followup'
PAGES = [37, 58, 100]
SCALE = 4


def svg_render(variant: dict, size: tuple[int, int]) -> Image.Image:
    paths = ''.join('<path ' + ' '.join(f'{key}={quoteattr(str(value))}' for key, value in path.items()) + '/>'
        for path in variant['paths'])
    width, height = variant['viewBox'][2:]
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size[0]}" height="{size[1]}" '
        f'viewBox="0 0 {width} {height}">{paths}</svg>').encode()
    document = fitz.open('svg', svg)
    pixelmap = document[0].get_pixmap(alpha=True)
    return Image.frombytes('RGBA', (pixelmap.width, pixelmap.height), pixelmap.samples)


def main() -> None:
    report = []
    panels = []
    with fitz.open(PDF) as document:
        for page_number in PAGES:
            sidecar = json.loads((ROOT / f'apps/web/public/pages/page_{page_number:03d}/compound_elements.json').read_text(encoding='utf8'))
            item = next(element for element in sidecar['elements'] if element['symbolId'] == 'tag.status')
            variant_id = item['metrics']['renderVariant']
            variant = SYMBOL['render']['variants'][variant_id]
            rect = fitz.Rect(item['bbox'])
            source_page = document[page_number - 1]
            source_pix = source_page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=rect, alpha=False)
            native = Image.frombytes('RGB', (source_pix.width, source_pix.height), source_pix.samples)
            rendered = svg_render(variant, native.size)

            background = Image.open(ROOT / f'apps/web/public/pages/page_{page_number:03d}/background.webp').convert('RGB')
            sx, sy = background.width / source_page.rect.width, background.height / source_page.rect.height
            bg = background.transform(native.size, Image.Transform.EXTENT,
                (rect.x0 * sx, rect.y0 * sy, rect.x1 * sx, rect.y1 * sy), resample=Image.Resampling.BICUBIC)
            composed = Image.alpha_composite(bg.convert('RGBA'), rendered).convert('RGB')
            delta = np.abs(np.asarray(native, dtype=np.int16) - np.asarray(composed, dtype=np.int16))
            report.append({
                'page': page_number,
                'symbolId': item['symbolId'],
                'renderVariant': variant_id,
                'sourceBBoxPt': list(rect),
                'sizePt': item['sizePt'],
                'nativeVsComposedMeanAbsoluteChannelError': round(float(delta.mean()), 4),
                'maxChannelError': int(delta.max()),
                'pixels': list(native.size),
            })

            scale = 3
            panels.append((page_number,
                native.resize((native.width * scale, native.height * scale), Image.Resampling.NEAREST),
                composed.resize((composed.width * scale, composed.height * scale), Image.Resampling.NEAREST),
                Image.fromarray(np.uint8(np.clip(delta * 4, 0, 255))).resize(
                    (native.width * scale, native.height * scale), Image.Resampling.NEAREST)))

    cell_width = max(panel.width for _, *items in panels for panel in items) + 16
    row_heights = [max(panel.height for panel in items) + 28 for _, *items in panels]
    sheet = Image.new('RGB', (cell_width * 3, sum(row_heights)), '#dddddd')
    draw = ImageDraw.Draw(sheet)
    y = 0
    for (page_number, native, composed, diff), row_height in zip(panels, row_heights):
        draw.text((4, y + 3), f'PDF page {page_number}', fill='black')
        for col, (label, panel) in enumerate((('PDF', native), ('Semantic EN', composed), ('4x diff', diff))):
            x = col * cell_width + 8
            draw.text((x, y + 14), label, fill='black')
            sheet.paste(panel, (x, y + 30))
        y += row_height

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / 'compact-status-source-comparison.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    sheet.save(OUT_DIR / 'compact-status-source-comparison.png')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
