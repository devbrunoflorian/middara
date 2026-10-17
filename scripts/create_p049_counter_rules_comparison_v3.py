from __future__ import annotations

import hashlib
import io
import json
import re
import sys
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
if len(sys.argv) != 7:
    raise SystemExit('usage: create_p049_counter_rules_comparison_v3.py SOURCE_PDF EXPORT_PDF VIEWER_PNG EVIDENCE_DIR MANIFEST_PATH SNAPSHOT_JSON')
source_pdf, export_pdf, viewer_png = map(Path, sys.argv[1:4])
evidence_dir, manifest_path = Path(sys.argv[4]), Path(sys.argv[5])
snapshot_path = Path(sys.argv[6])
evidence_dir.mkdir(parents=True, exist_ok=True)
manifest_path.parent.mkdir(parents=True, exist_ok=True)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
expected_source_hash = 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351'
if sha(source_pdf) != expected_source_hash:
    raise RuntimeError(f'Official source PDF hash changed: actual={sha(source_pdf)} expected={expected_source_hash} path={source_pdf}')

source_doc = pymupdf.open(source_pdf)
export_doc = pymupdf.open(export_pdf)
if len(source_doc) < 49 or len(export_doc) != 1:
    raise RuntimeError('Expected official source p.49 and a one-page export')
source_page, export_page = source_doc[48], export_doc[0]
if tuple(source_page.mediabox) != tuple(export_page.mediabox):
    raise RuntimeError('Source and export MediaBox differ')
source_text, export_text = source_page.get_text(), export_page.get_text()
page_dom = json.loads((ROOT / 'apps/web/public/pages/page_049/page_049_dom.json').read_text(encoding='utf-8'))
blocks = page_dom['blocks'][:4]
if [block['id'] for block in blocks] != ['block_20', 'block_21', 'block_22', 'block_23']:
    raise RuntimeError('p.49 rule block ownership changed')
source_boxes = [block['bbox'] for block in blocks]
source_line_counts = {f'page_49_block_{i}': len(block['lines']) for i, block in enumerate(blocks)}
next_tops = [source_boxes[i + 1][1] for i in range(3)] + [page_dom['blocks'][4]['bbox'][1]]
page_rect = source_page.rect
export_lines = []
for text_block in export_page.get_text('dict')['blocks']:
    for line in text_block.get('lines', []):
        bbox = [float(v) for v in line['bbox']]
        line_text = ''.join(span['text'] for span in line['spans']).strip()
        if line_text and 90 <= bbox[0] <= 410 and 80 <= bbox[1] <= 390:
            export_lines.append({'bbox': bbox, 'text': line_text})

fallbacks = (
    'If a figure Attacks a target and the Attack misses',
    'Adventurers and Command Combatants may use the COUNTER',
    'To COUNTER, the target being Attacked',
    'It is possible for some back and forth to occur',
)
snapshot = json.loads(snapshot_path.read_text(encoding='utf-8'))
target_texts = [
    ''.join(segment.get('text', '') for segment in record['data']['segments'])
    for record in snapshot['translations']
]
if len(target_texts) != 4:
    raise RuntimeError(f'Expected four snapshot candidate texts; got {len(target_texts)}')
def normalize_pdf(value: str) -> str:
    # Hyphenated labels may be broken at a PDF line edge and the exporter can
    # omit that visual hyphen in text extraction. Normalize all word-internal
    # hyphens on both sides before comparing; the raster comparison preserves
    # the actual visible typography.
    value = re.sub(r'(?<=\w)-\s+(?=\w)', '', value)
    value = re.sub(r'(?<=\w)-(?=\w)', '', value)
    return ' '.join(value.split())

normalized_export_text = normalize_pdf(export_text)
target_counts = {f'page_49_block_{index}': normalized_export_text.count(normalize_pdf(target)) for index, target in enumerate(target_texts)}
fallback_counts = {fallback: export_text.count(fallback) for fallback in fallbacks}
if any(value != 1 for value in target_counts.values()):
    raise RuntimeError(f'Target text missing/duplicated in actual export: {target_counts}')
if any(fallback_counts.values()):
    raise RuntimeError(f'English source fallback remains in actual export: {fallback_counts}')
if not all(text in source_text for text in ('If a figure Attacks a target', 'Adventurers and Command Combatants', 'To COUNTER', 'It is possible for some back and forth')):
    raise RuntimeError('Expected rule source text missing from official PDF')

target_lines_by_unit = {}
target_line_counts = {}
frame_fit_by_unit = {}
overflow_by_unit = {}
for index, box in enumerate(source_boxes):
    key = f'page_49_block_{index}'
    target = normalize_pdf(target_texts[index])
    prefix = target[:24]
    start = next((pos for pos, line in enumerate(export_lines)
                  if normalize_pdf(line['text']).startswith(prefix)), None)
    if start is None:
        raise RuntimeError(f'Cannot locate exported text for {key}: {prefix}')
    candidates, accumulated = [], ''
    for line in export_lines[start:]:
        candidates.append(line)
        accumulated = normalize_pdf(f'{accumulated} {line["text"]}')
        if target in accumulated:
            break
        if line['bbox'][1] > next_tops[index] + 1:
            break
    if target not in accumulated:
        raise RuntimeError(f'Could not reconstruct full exported candidate for {key}: {accumulated}')
    candidates = [line for line in candidates
                  if box[0] - 0.75 <= line['bbox'][0] <= box[2] + 0.75]
    target_lines_by_unit[key] = candidates
    target_line_counts[key] = len(candidates)
    errors = []
    for line in candidates:
        bbox = line['bbox']
        for edge, actual, limit in [('left', bbox[0], box[0]), ('top', bbox[1], box[1]),
                                    ('right', bbox[2], box[2]), ('bottom', bbox[3], box[3])]:
            delta = actual - limit if edge in ('left', 'top') else limit - actual
            if delta < -0.75:
                errors.append({'edge': edge, 'overflowPt': round(-delta, 3), 'lineText': line['text']})
    overflow_by_unit[key] = errors
    frame_fit_by_unit[key] = not errors

collisions = []
for index in range(3):
    left_key, right_key = f'page_49_block_{index}', f'page_49_block_{index + 1}'
    for left in target_lines_by_unit[left_key]:
        for right in target_lines_by_unit[right_key]:
            a, b = left['bbox'], right['bbox']
            horizontal_overlap = min(a[2], b[2]) - max(a[0], b[0])
            if a[3] > b[1] + 0.25 and horizontal_overlap > 0.25:
                collisions.append({'left': left_key, 'right': right_key, 'leftText': left['text'], 'rightText': right['text'], 'overlapPt': round(a[3] - b[1], 3)})

viewer_image = Image.open(viewer_png).convert('RGB')
scale = 1.57
source_pix = source_page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
export_pix = export_page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
source_image = Image.frombytes('RGB', (source_pix.width, source_pix.height), source_pix.samples)
export_image = Image.frombytes('RGB', (export_pix.width, export_pix.height), export_pix.samples)
if source_image.size != export_image.size or source_image.size != viewer_image.size:
    raise RuntimeError(f'Raster size mismatch: source={source_image.size}, export={export_image.size}, viewer={viewer_image.size}')
crop_points = pymupdf.Rect(90, 45, 410, 455)
crop = tuple(round(v * scale) for v in (crop_points.x0, crop_points.y0, crop_points.x1, crop_points.y1))
images = [source_image.crop(crop), viewer_image.crop(crop), export_image.crop(crop)]
labels = ['FONTE EN', 'VIEWER PT-BR ISOLADO', 'PDF EXPORTADO PT-BR']
label_height, gap = 38, 10
canvas = Image.new('RGB', (sum(image.width for image in images) + 2 * gap, images[0].height + label_height), 'white')
draw = ImageDraw.Draw(canvas)
try:
    font = ImageFont.truetype('arial.ttf', 20)
except OSError:
    font = ImageFont.load_default()
x = 0
for image, label in zip(images, labels, strict=True):
    draw.text((x + 8, 8), label, fill='#202020', font=font)
    canvas.paste(image, (x, label_height))
    x += image.width + gap
comparison_path = evidence_dir / 'source-viewer-pdf-crop.png'
buffer = io.BytesIO()
canvas.save(buffer, format='PNG', optimize=True)
comparison_bytes = buffer.getvalue()
if comparison_path.exists() and comparison_path.read_bytes() != comparison_bytes:
    raise RuntimeError(f'Refusing to overwrite comparison evidence: {comparison_path}')
if not comparison_path.exists(): comparison_path.write_bytes(comparison_bytes)

manifest = {
    'page': 49,
    'locale': 'pt-BR',
    'sourcePdfSha256': sha(source_pdf),
    'exportPdfSha256': sha(export_pdf),
    'viewerScreenshotSha256': sha(viewer_png),
    'comparisonCropSha256': hashlib.sha256(comparison_bytes).hexdigest(),
    'mediaBoxPt': list(source_page.mediabox),
    'rasterSize': list(source_image.size),
    'cropPagePoints': list(crop_points),
    'targetTextOccurrences': target_counts,
    'sourceFallbackOccurrences': fallback_counts,
    'sourceLineCounts': source_line_counts,
    'targetLineCounts': target_line_counts,
    'frameFitByUnit': frame_fit_by_unit,
    'overflowByUnit': overflow_by_unit,
    'allTextInsideSourceFrames': all(frame_fit_by_unit.values()),
    'noInterUnitCollision': not collisions,
    'collisions': collisions,
    'comparisonImage': str(comparison_path),
    'comparison': ['official source PDF page 49', 'PageRenderer capture from immutable snapshot', 'independent raster of exported one-page PDF'],
}
manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
if manifest_path.exists() and manifest_path.read_bytes() != manifest_bytes:
    raise RuntimeError(f'Refusing to overwrite copyfit evidence: {manifest_path}')
if not manifest_path.exists(): manifest_path.write_bytes(manifest_bytes)
print(json.dumps(manifest, ensure_ascii=True, indent=2))
