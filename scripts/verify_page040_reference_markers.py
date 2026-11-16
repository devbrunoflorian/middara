"""Compare the ten semantic p40 reference markers with the official PDF."""
from __future__ import annotations

import json
from pathlib import Path
from xml.sax.saxutils import quoteattr

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
PAGE_DIR = ROOT / 'apps/web/public/pages/page_040'
OUT_DIR = ROOT / 'docs/project-progress/evidence/2026-10-05-inline-elements-followup'
REGISTRY = {item['id']: item for item in json.loads(
    (ROOT / 'apps/web/src/symbols/sourceSymbols.json').read_text(encoding='utf8'))}
SIDECAR = json.loads((PAGE_DIR / 'compound_elements.json').read_text(encoding='utf8'))
SCALE = 4


def render_paths(paths: list[dict], view_box: list[float], size: tuple[int, int]) -> Image.Image:
    attrs = lambda path: ' '.join(f'{key}={quoteattr(str(value))}' for key, value in path.items())
    body = ''.join(f'<path {attrs(path)}/>' for path in paths)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" color="#231f20" width="{size[0]}" '
        f'height="{size[1]}" viewBox="{view_box[0]} {view_box[1]} {view_box[2]} {view_box[3]}">{body}</svg>').encode()
    document = fitz.open('svg', svg)
    pix = document[0].get_pixmap(alpha=True)
    return Image.frombytes('RGBA', (pix.width, pix.height), pix.samples)


def main() -> None:
    if len(SIDECAR['elements']) != 10:
        raise ValueError(f"Expected ten page-40 marker compounds, got {len(SIDECAR['elements'])}")
    report_rows = []
    panels = []
    with fitz.open(PDF) as document, Image.open(PAGE_DIR / 'background.webp') as bg_file, \
        Image.open(PAGE_DIR / 'fidelity-overlay-reference-markers-paper.png') as patch_file:
        page = document[39]
        background_rgba = bg_file.convert('RGBA')
        sx, sy = background_rgba.width/page.rect.width, background_rgba.height/page.rect.height
        overlay = next(item for item in json.loads((PAGE_DIR / 'fidelity_overlays.json').read_text(encoding='utf8'))['overlays']
            if item.get('region') == 'Paper patches beneath ten semantic A-D reference markers')
        dest = (round(overlay['bbox'][0]*sx), round(overlay['bbox'][1]*sy))
        background_rgba.alpha_composite(patch_file.convert('RGBA'), dest=dest)
        background = background_rgba.convert('RGB')

        for element in SIDECAR['elements']:
            symbol_id = element['symbolId']
            definition = REGISTRY[symbol_id]
            rect = fitz.Rect(element['bbox'])
            source_pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=rect, alpha=False)
            source = Image.frombytes('RGB', (source_pix.width, source_pix.height), source_pix.samples)
            bg = background.transform(source.size, Image.Transform.EXTENT,
                (rect.x0*sx, rect.y0*sy, rect.x1*sx, rect.y1*sy), resample=Image.Resampling.BICUBIC)
            visual = definition['render']
            rendered = render_paths(visual['paths'], visual['viewBox'], source.size)
            composed = Image.alpha_composite(bg.convert('RGBA'), rendered).convert('RGB')
            delta = np.abs(np.asarray(source, dtype=np.int16)-np.asarray(composed, dtype=np.int16))
            row = {
                'symbolId': symbol_id,
                'font': definition['composition']['sourceFont'],
                'sourceFontSizePt': element['sizePt'],
                'bboxPt': list(rect),
                'anchor': element['anchor'],
                'meanAbsoluteChannelError': round(float(delta.mean()), 4),
                'maxChannelError': int(delta.max()),
                'cropPx': list(source.size),
            }
            report_rows.append(row)
            zoom = 5
            source_zoom = source.resize((source.width*zoom, source.height*zoom), Image.Resampling.NEAREST)
            composed_zoom = composed.resize((composed.width*zoom, composed.height*zoom), Image.Resampling.NEAREST)
            diff = Image.fromarray(np.uint8(np.clip(delta*4, 0, 255))).resize(
                (source.width*zoom, source.height*zoom), Image.Resampling.NEAREST)
            panels.append((symbol_id, source_zoom, composed_zoom, diff))

    cell_w = max(image.width for row in panels for image in row[1:])+12
    cell_h = max(image.height for row in panels for image in row[1:])+32
    sheet = Image.new('RGB', (cell_w*3, cell_h*len(panels)), '#ddd')
    draw = ImageDraw.Draw(sheet)
    for i, (symbol_id, source, composed, diff) in enumerate(panels):
        y = i*cell_h
        draw.text((4,y+2), f'{symbol_id} — source PDF, composed, 4x diff', fill='black')
        sheet.paste(source, (0,y+24))
        sheet.paste(composed, (cell_w,y+24))
        sheet.paste(diff, (cell_w*2,y+24))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    png = OUT_DIR / 'page40-reference-markers-source-comparison.png'
    report_path = OUT_DIR / 'page40-reference-markers-source-comparison.json'
    sheet.save(png)
    result = {
        'page': 40,
        'totalOccurrences': len(report_rows),
        'countsBySymbolId': {symbol: sum(row['symbolId'] == symbol for row in report_rows)
            for symbol in sorted({row['symbolId'] for row in report_rows})},
        'sourceGlyph': 'OptimaLTStd-Bold, letters A–D, 8 pt; white vector 9.996 pt square',
        'diagramFurnitureUntouched': True,
        'comparisons': report_rows,
        'maxMeanAbsoluteChannelError': max(row['meanAbsoluteChannelError'] for row in report_rows),
        'comparisonPng': str(png),
    }
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
