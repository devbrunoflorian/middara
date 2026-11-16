"""Compare all semantic page-95 capsules with their original PDF crops."""
from __future__ import annotations

import json
from pathlib import Path
from xml.sax.saxutils import quoteattr

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
PAGE_DIR = ROOT / 'apps/web/public/pages/page_095'
OUT_DIR = ROOT / 'docs/project-progress/evidence/2026-10-05-inline-elements-followup'
REGISTRY = {item['id']: item for item in json.loads(
    (ROOT / 'apps/web/src/symbols/sourceSymbols.json').read_text(encoding='utf8'))}
SIDECAR = json.loads((PAGE_DIR / 'compound_elements.json').read_text(encoding='utf8'))
SCALE = 4


def render_paths(paths: list[dict], width: float, height: float, size: tuple[int, int]) -> Image.Image:
    source = ''.join('<path ' + ' '.join(f'{key}={quoteattr(str(value))}' for key, value in path.items()) + '/>'
        for path in paths)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size[0]}" height="{size[1]}" '
        f'viewBox="0 0 {width} {height}">{source}</svg>').encode()
    doc = fitz.open('svg', svg)
    pix = doc[0].get_pixmap(alpha=True)
    return Image.frombytes('RGBA', (pix.width, pix.height), pix.samples)


def main() -> None:
    if len(SIDECAR['elements']) != 14:
        raise ValueError(f"Expected 14 page-95 compounds, got {len(SIDECAR['elements'])}")
    samples: dict[str, tuple[Image.Image, Image.Image, np.ndarray]] = {}
    reports = []
    with fitz.open(PDF) as document, Image.open(PAGE_DIR / 'background.webp') as bg_file, \
        Image.open(PAGE_DIR / 'fidelity-overlay-condition-capsule-paper.png') as patch_file:
        page = document[94]
        overlay = next(item for item in json.loads((PAGE_DIR / 'fidelity_overlays.json').read_text(encoding='utf8'))['overlays']
            if item.get('url') == '/pages/page_095/fidelity-overlay-condition-capsule-paper.png')
        background_rgba = bg_file.convert('RGBA')
        sx, sy = background_rgba.width/page.rect.width, background_rgba.height/page.rect.height
        patch_x, patch_y = round(overlay['bbox'][0]*sx), round(overlay['bbox'][1]*sy)
        background_rgba.alpha_composite(patch_file.convert('RGBA'), dest=(patch_x, patch_y))
        background = background_rgba.convert('RGB')
        sx, sy = background.width/page.rect.width, background.height/page.rect.height
        for element in SIDECAR['elements']:
            symbol_id = element['symbolId']
            variant_id = element['metrics'].get('renderVariant')
            if variant_id not in {'table-6.5pt', 'table-6.54pt'}:
                raise ValueError(f'Unexpected p95 variant {symbol_id}/{variant_id}')
            definition = REGISTRY[symbol_id]
            variant = definition['render']['variants'][variant_id]
            rect = fitz.Rect(element['bbox'])
            pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=rect, alpha=False)
            native = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            bg = background.transform(native.size, Image.Transform.EXTENT,
                (rect.x0*sx, rect.y0*sy, rect.x1*sx, rect.y1*sy), resample=Image.Resampling.BICUBIC)
            rendered = render_paths(variant['paths'], *variant['viewBox'][2:], native.size)
            composed = Image.alpha_composite(bg.convert('RGBA'), rendered).convert('RGB')
            delta = np.abs(np.asarray(native, dtype=np.int16)-np.asarray(composed, dtype=np.int16))
            reports.append({
                'symbolId': symbol_id, 'variant': variant_id, 'sizePt': element['sizePt'],
                'bboxPt': list(rect), 'anchor': element['anchor'],
                'meanAbsoluteChannelError': round(float(delta.mean()), 4),
                'maxChannelError': int(delta.max()), 'cropPx': list(native.size),
            })
            samples.setdefault(symbol_id, (native, composed, delta))

    panels = []
    for symbol_id, (native, composed, delta) in samples.items():
        zoom = 5
        diff = Image.fromarray(np.uint8(np.clip(delta*4, 0, 255)))
        panels.extend([
            (f'{symbol_id} — original PDF', native.resize((native.width*zoom, native.height*zoom), Image.Resampling.NEAREST)),
            (f'{symbol_id} — semantic compound over patched background', composed.resize((composed.width*zoom, composed.height*zoom), Image.Resampling.NEAREST)),
            (f'{symbol_id} — 4x channel difference', diff.resize((diff.width*zoom, diff.height*zoom), Image.Resampling.NEAREST)),
        ])
    width = max(image.width for _, image in panels)
    height = sum(image.height+24 for _, image in panels)
    sheet = Image.new('RGB', (width, height), '#ddd')
    draw = ImageDraw.Draw(sheet)
    y = 0
    for label, image in panels:
        draw.text((4, y+2), label, fill='black')
        y += 22
        sheet.paste(image, (0, y))
        y += image.height+2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    png = OUT_DIR / 'page95-condition-capsules-source-comparison.png'
    report_path = OUT_DIR / 'page95-condition-capsules-source-comparison.json'
    sheet.save(png)
    result = {
        'page': 95, 'totalOccurrences': len(reports),
        'countsBySymbolId': {symbol: sum(row['symbolId'] == symbol for row in reports) for symbol in samples},
        'glyphs': {'tag.status': 'ZapfDingbatsStd U+271C', 'tag.passive': 'ZapfDingbatsStd U+2724',
            'tag.discard': 'ZapfDingbatsStd U+2718'},
        'comparisons': reports,
        'maxMeanAbsoluteChannelError': max(row['meanAbsoluteChannelError'] for row in reports),
        'comparisonPng': str(png),
    }
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
