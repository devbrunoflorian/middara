"""Compare page-90 composed tags with the official PDF and app background."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from xml.sax.saxutils import quoteattr

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from build_inline_symbol_registry import PDF  # noqa: E402

PAGE_DIR = ROOT / 'apps/web/public/pages/page_090'
OUT_DIR = ROOT / 'docs/project-progress/evidence/2026-10-05-inline-elements-followup'
OUT_DIR.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--background', type=Path, default=PAGE_DIR / 'background.webp', help='clean p.90 app background to composite under the semantic tags')
args = parser.parse_args()
REGISTRY = {item['id']: item for item in json.loads(
    (ROOT / 'apps/web/src/symbols/sourceSymbols.json').read_text(encoding='utf8'))}
DOC = fitz.open(PDF)
SOURCE = DOC[89]
BACKGROUND = Image.open(args.background).convert('RGB')
ROWS = []
REPORT = []

for symbol_id in ['tag.passive', 'tag.status', 'tag.exhaust', 'tag.discard']:
    definition = REGISTRY[symbol_id]
    x0, y0, x1, y1 = definition['source']['bboxPt']
    width, height = x1 - x0, y1 - y0
    native_pix = SOURCE.get_pixmap(matrix=fitz.Matrix(4, 4), clip=fitz.Rect(x0, y0, x1, y1), alpha=False)
    native = Image.frombytes('RGB', (native_pix.width, native_pix.height), native_pix.samples)
    svg_paths = ''.join('<path ' + ' '.join(
        f'{key}={quoteattr(str(value))}' for key, value in path.items()) + '/>'
        for path in definition['render']['paths'])
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{native.width}" height="{native.height}" '
        f'viewBox="0 0 {width} {height}">{svg_paths}</svg>').encode()
    svg_doc = fitz.open('svg', svg)
    rendered_pix = svg_doc[0].get_pixmap(alpha=True)
    rendered = Image.frombytes('RGBA', (rendered_pix.width, rendered_pix.height), rendered_pix.samples)
    bg_crop = BACKGROUND.transform((native.width, native.height), Image.Transform.EXTENT,
        (x0 * BACKGROUND.width / SOURCE.rect.width, y0 * BACKGROUND.height / SOURCE.rect.height,
         x1 * BACKGROUND.width / SOURCE.rect.width, y1 * BACKGROUND.height / SOURCE.rect.height),
        resample=Image.Resampling.BICUBIC)
    composed = Image.alpha_composite(bg_crop.convert('RGBA'), rendered).convert('RGB')
    delta = np.abs(np.asarray(native, dtype=np.int16) - np.asarray(composed, dtype=np.int16))
    mae = float(delta.mean())
    max_error = int(delta.max())
    REPORT.append({'symbolId': symbol_id, 'sourceBBoxPt': definition['source']['bboxPt'],
        'sourceSvgWidthPt': width, 'localizedWidthPt': definition['render']['localized']['pt-BR']['viewBox'][2],
        'nativeVsCompositeMeanAbsoluteChannelError': round(mae, 4), 'maxChannelError': max_error,
        'nativeSizePx': list(native.size)})
    # Native source / reconstructed English / localized composition / amplified difference.
    diff = Image.fromarray(np.uint8(np.clip(delta * 4, 0, 255)))
    scale = 2
    panels = [native.resize((native.width * scale, native.height * scale), Image.Resampling.NEAREST),
        composed.resize((native.width * scale, native.height * scale), Image.Resampling.NEAREST)]
    pt = definition['render']['localized']['pt-BR']
    pt_paths = ''.join('<path ' + ' '.join(f'{key}={quoteattr(str(value))}' for key, value in path.items()) + '/>' for path in pt['paths'])
    pt_width, pt_height = pt['viewBox'][2:]
    localized_svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{round(pt_width*4)}" height="{round(pt_height*4)}" viewBox="0 0 {pt_width} {pt_height}">{pt_paths}</svg>'.encode()
    localized_doc = fitz.open('svg', localized_svg)
    localized_pix = localized_doc[0].get_pixmap(alpha=True)
    localized = Image.frombytes('RGBA', (localized_pix.width, localized_pix.height), localized_pix.samples)
    pt_bg = BACKGROUND.transform(localized.size, Image.Transform.EXTENT,
        (x0 * BACKGROUND.width / SOURCE.rect.width, y0 * BACKGROUND.height / SOURCE.rect.height,
         (x0 + pt_width) * BACKGROUND.width / SOURCE.rect.width, y1 * BACKGROUND.height / SOURCE.rect.height),
        resample=Image.Resampling.BICUBIC)
    localized = Image.alpha_composite(pt_bg.convert('RGBA'), localized).convert('RGB')
    panels.append(localized.resize((localized.width * 2, localized.height * 2), Image.Resampling.NEAREST))
    panels.append(diff.resize((diff.width * scale, diff.height * scale), Image.Resampling.NEAREST))
    cell_w = max(panel.width for panel in panels) + 12
    cell_h = max(panel.height for panel in panels) + 28
    row = Image.new('RGB', (cell_w * 4, cell_h), 'white')
    draw = ImageDraw.Draw(row)
    for i, (label, panel) in enumerate(zip(['PDF', 'EN composition', 'PT-BR composition', '4x diff'], panels)):
        x = i * cell_w + 6
        draw.text((x, 3), label, fill='black')
        row.paste(panel, (x, 22))
    ROWS.append(row)

sheet = Image.new('RGB', (max(row.width for row in ROWS), sum(row.height for row in ROWS)), '#dddddd')
y = 0
for row in ROWS:
    sheet.paste(row, (0, y)); y += row.height
sheet.save(OUT_DIR / 'page90-compound-tags-source-comparison.png')
(OUT_DIR / 'page90-compound-tags-source-comparison.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps(REPORT, ensure_ascii=False, indent=2))
