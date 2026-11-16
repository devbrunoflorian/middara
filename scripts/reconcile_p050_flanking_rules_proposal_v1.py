from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

if len(sys.argv) != 7:
    raise SystemExit('usage: reconcile_p050_flanking_rules_proposal_v1.py SOURCE_PDF EXPORT_PDF VIEWER_PNG PROOF_DIR MANIFEST_PATH SNAPSHOT_JSON')

source_pdf, export_pdf, viewer_png = map(Path, sys.argv[1:4])
proof_dir, manifest_path, snapshot_path = map(Path, sys.argv[4:7])
root = Path.cwd()
page_number = 50
expected_source_sha256 = 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351'
version = proof_dir.name.rsplit('-', 1)[-1]
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
normalize = lambda value: ' '.join(str(value).replace('\ufffc', '').split())


def stable(value):
    if isinstance(value, list):
        return '[' + ','.join(stable(item) for item in value) + ']'
    if isinstance(value, dict):
        return '{' + ','.join(json.dumps(key, ensure_ascii=False, separators=(',', ':')) + ':' + stable(value[key]) for key in sorted(value)) + '}'
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


if digest(source_pdf) != expected_source_sha256:
    raise RuntimeError(f'Official EN source PDF hash changed: {digest(source_pdf)}')
source_doc = pymupdf.open(source_pdf)
export_doc = pymupdf.open(export_pdf)
if len(source_doc) < page_number or len(export_doc) != 1:
    raise RuntimeError('Expected official source p.50 and one isolated PDF page')
source_page, export_page = source_doc[page_number - 1], export_doc[0]
if tuple(round(float(v), 3) for v in source_page.mediabox) != tuple(round(float(v), 3) for v in export_page.mediabox):
    raise RuntimeError('Source and exported PDF MediaBox differ')

dom_path = root / 'apps/web/public/pages/page_050/page_050_dom.json'
dom = json.loads(dom_path.read_text(encoding='utf-8'))
block = next(item for item in dom['blocks'] if item['id'] == 'block_13')
units = block['typographicUnits']
snapshot = json.loads(snapshot_path.read_text(encoding='utf-8'))
baseline = json.loads((proof_dir / f'payload-baseline-{version}.json').read_text(encoding='utf-8'))
definitions = [
    ('p50-block-13-paragraph-1', 'Quando 2 aliados estão em lados ou cantos opostos de um oponente, desde que nenhum esteja sob um efeito que o impeça de realizar um Ataque e cada um também tenha uma \ufffc Arma equipada, ambos flanqueiam esse oponente. Miniaturas que realizam um \ufffc Ataque contra um alvo que flanqueiam recebem +1 na ROLAGEM DE ATAQUE.', 'When 2 allies are on opposite sides or corners of an opponent'),
    ('p50-block-13-paragraph-2', 'Algumas Habilidades concedem bônus a Aventureiros e Combatentes apenas quando flanqueiam um alvo. Por exemplo, miniaturas com a Tag BACKSTAB recebem +3 de DANO FÍSICO ao realizar um \ufffc Ataque contra um alvo que flanqueiam.', 'Some Abilities give Adventurers and Combatants bonuses'),
    ('p50-block-13-paragraph-3', 'Armas com o Ícone \ufffc não recebem o bônus de flanqueio. Miniaturas equipadas com Armas que exibem o Ícone \ufffc não podem conceder o bônus de flanqueio a outra miniatura.', 'Weapons with the'),
    ('p50-block-13-paragraph-4', 'Armas com a Tag Alcance também podem flanquear e criar oportunidades para aliados usarem BACKSTAB. Se uma miniatura com Alcance estiver atacando um oponente enquanto houver outro aliado que esteja ao Alcance Corpo a Corpo (ou ao Alcance da própria Tag Alcance desse aliado) do alvo e em um lado ou canto oposto do mesmo alvo, você recebe o bônus de flanqueio.', 'Weapons with the Reach Tag may also Flank'),
    ('p50-block-13-paragraph-5', 'Os diagramas abaixo ajudam a explicar melhor:', 'Below are some Diagrams to help explain this better:'),
]
if version == 'v2':
    definitions[1] = (
        'p50-block-13-paragraph-2',
        'Algumas Habilidades só concedem bônus a Aventureiros e Combatentes quando flanqueiam um alvo. Por exemplo, miniaturas com a Tag BACKSTAB recebem +3 de DANO FÍSICO ao realizar um \ufffc Ataque contra um alvo que flanqueiam.',
        'Some Abilities give Adventurers and Combatants bonuses',
    )
    definitions[2] = (
        'p50-block-13-paragraph-3',
        'Armas com o Ícone \ufffc não recebem bônus de flanqueio. Miniaturas equipadas com Armas que exibem o Ícone \ufffc não podem conceder esse bônus a outra miniatura.',
        'Weapons with the',
    )
    definitions[3] = (
        'p50-block-13-paragraph-4',
        'Armas com a Tag Alcance também podem flanquear e abrir oportunidades para aliados usarem BACKSTAB. Quando uma miniatura com Alcance ataca um oponente, você também recebe o bônus de flanqueio se outro aliado estiver ao Alcance Corpo a Corpo do alvo (ou ao Alcance da própria Tag Alcance desse aliado) e em um lado ou canto oposto do mesmo alvo.',
        'Weapons with the Reach Tag may also Flank',
    )

candidate_keys = [f'page_50_unit_{unit_id}__pt-BR' for unit_id, _, _ in definitions]
snapshot_translations = snapshot.get('translations', [])
candidate_docs = [doc for doc in snapshot_translations if doc.get('spanKey') in candidate_keys]
human_docs = [doc for doc in snapshot_translations if str(doc.get('spanKey', '')).startswith('page_50_') and doc.get('spanKey') not in candidate_keys]
if len(candidate_docs) != 5 or len(human_docs) != 10 or len(snapshot_translations) != 15:
    raise RuntimeError('Snapshot must contain exactly five candidates plus the ten existing human p.50 records')
baseline_by_key = {record['spanKey']: record for record in baseline['humanRecords']}
human_preserved = len(baseline_by_key) == 10
for record in human_docs:
    old = baseline_by_key.get(record.get('spanKey'))
    if not old or record.get('id') != old.get('id') or record.get('updatedAt') != old.get('updatedAt'):
        human_preserved = False
    elif hashlib.sha256(stable(record).encode('utf-8')).hexdigest() != old.get('sha256'):
        human_preserved = False
if not human_preserved:
    raise RuntimeError('An existing human p.50 translation was modified or omitted from the snapshot')

candidate_texts = {}
candidate_segments = {}
for unit_id, target, _ in definitions:
    key = f'page_50_unit_{unit_id}__pt-BR'
    record = next((doc for doc in candidate_docs if doc.get('spanKey') == key), None)
    if not record or record.get('language') != 'pt-BR':
        raise RuntimeError(f'Missing candidate record {key}')
    segments = record.get('data', {}).get('segments', [])
    text = ''.join(segment.get('text', '') for segment in segments)
    if normalize(text) != normalize(target):
        raise RuntimeError(f'Snapshot candidate text mismatch for {unit_id}')
    candidate_texts[unit_id] = normalize(text)
    candidate_segments[unit_id] = segments

full_export_text = export_page.get_text()
flat_export_text = normalize(full_export_text)
candidate_occurrences = {unit_id: flat_export_text.count(text) for unit_id, text in candidate_texts.items()}
if any(count != 1 for count in candidate_occurrences.values()):
    raise RuntimeError(f'Actual PDF does not contain each candidate exactly once: {candidate_occurrences}')
source_fallback_occurrences = {prefix: flat_export_text.count(normalize(prefix)) for _, _, prefix in definitions}
if any(source_fallback_occurrences.values()):
    raise RuntimeError(f'English source fallback remains in a proposed p.50 unit: {source_fallback_occurrences}')

# Baseline source visual-line count is grouped by measured text baseline; a
# single visual line may be split into several extracted line IDs around icons.
source_visual_line_counts = {}
source_boxes = {}
source_ink_bounds = {}
for unit, (unit_id, _, _) in zip(units, definitions, strict=True):
    line_ids = set(unit['field']['lineIds'])
    baselines = []
    for line in block['lines']:
        if line['id'] not in line_ids:
            continue
        origin = next((span.get('origin') for span in line['spans'] if span.get('origin') and not span.get('renderOnlyStrokePass')), None)
        baseline_y = float(origin[1]) if origin else float(line['bbox'][3]) - 2.7
        if not any(abs(baseline_y - old) < 0.6 for old in baselines):
            baselines.append(baseline_y)
    source_visual_line_counts[unit_id] = len(baselines)
    ink = [float(value) for value in unit['field']['bbox']]
    frame = unit['field']['frame']
    source_boxes[unit_id] = [float(frame['x']), ink[1], float(frame['x']) + float(frame['width']), ink[3]]
    source_ink_bounds[unit_id] = ink

# Merge PDF text runs with the same visual baseline so each measured line is
# counted once even when bold words are separate spans.
raw_lines = []
for text_block in export_page.get_text('dict')['blocks']:
    if text_block.get('type') != 0:
        continue
    for line in text_block.get('lines', []):
        text = ''.join(span['text'] for span in line.get('spans', []))
        bbox = [float(value) for value in line['bbox']]
        if text.strip() and 90 <= bbox[0] <= 735 and 280 <= bbox[1] <= 440:
            raw_lines.append({'bbox': bbox, 'text': text})
raw_lines.sort(key=lambda item: (item['bbox'][1], item['bbox'][0]))
visual_lines = []
for line in raw_lines:
    group = next((item for item in visual_lines if abs(item['y'] - line['bbox'][1]) <= 0.9), None)
    if group is None:
        visual_lines.append({'y': line['bbox'][1], 'parts': [line]})
    else:
        group['parts'].append(line)
visual_lines.sort(key=lambda item: item['y'])
for group in visual_lines:
    group['parts'].sort(key=lambda item: item['bbox'][0])
    group['text'] = ''.join(item['text'] for item in group['parts'])
    group['bbox'] = [
        min(item['bbox'][0] for item in group['parts']),
        min(item['bbox'][1] for item in group['parts']),
        max(item['bbox'][2] for item in group['parts']),
        max(item['bbox'][3] for item in group['parts']),
    ]

target_groups = {}
target_visual_line_counts = {}
frame_fit = {}
overflow_by_unit = {}
for index, (unit_id, _, _) in enumerate(definitions):
    target = candidate_texts[unit_id]
    prefix = target[:36]
    start = next((i for i, line in enumerate(visual_lines) if normalize(line['text']).startswith(prefix)), None)
    if start is None:
        raise RuntimeError(f'Cannot locate candidate beginning in exported PDF for {unit_id}: {prefix}')
    collected = []
    acc = ''
    next_prefix = normalize(definitions[index + 1][1])[:24] if index + 1 < len(definitions) else None
    for line in visual_lines[start:]:
        line_text = normalize(line['text'])
        if next_prefix and collected and line_text.startswith(next_prefix):
            break
        collected.append(line)
        acc = normalize(f'{acc} {line_text}')
        if target in acc:
            break
    if target not in normalize(' '.join(line['text'] for line in collected)):
        raise RuntimeError(f'Could not reconstruct complete target text for {unit_id}')
    box = source_boxes[unit_id]
    # Keep only lines whose ink intersects this unit's source vertical region;
    # overflowing lines are deliberately retained so the fit failure surfaces.
    relevant = [line for line in collected if line['bbox'][0] <= box[2] + 1 and line['bbox'][1] <= box[3] + 12]
    target_groups[unit_id] = relevant
    target_visual_line_counts[unit_id] = len(relevant)
    errors = []
    for line in relevant:
        x0, y0, x1, y1 = line['bbox']
        for edge, actual, limit, direction in (
            ('left', x0, box[0], -1), ('top', y0, box[1], -1),
            ('right', x1, box[2], 1), ('bottom', y1, box[3], 1),
        ):
            overflow = (limit - actual) if direction < 0 else (actual - limit)
            if overflow > 0.75:
                errors.append({'edge': edge, 'overflowPt': round(overflow, 3), 'lineText': line['text']})
    overflow_by_unit[unit_id] = errors
    frame_fit[unit_id] = not errors

collisions = []
for left_index in range(len(definitions) - 1):
    left_id = definitions[left_index][0]
    right_id = definitions[left_index + 1][0]
    for left in target_groups[left_id]:
        for right in target_groups[right_id]:
            a, b = left['bbox'], right['bbox']
            overlap_x = min(a[2], b[2]) - max(a[0], b[0])
            overlap_y = min(a[3], b[3]) - max(a[1], b[1])
            if overlap_x > 0.25 and overlap_y > 0.25:
                collisions.append({'upperUnit': left_id, 'lowerUnit': right_id, 'overlapXPt': round(overlap_x, 3), 'overlapYPt': round(overlap_y, 3)})

scale = 1.57
source_pix = source_page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
export_pix = export_page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
source_image = Image.frombytes('RGB', (source_pix.width, source_pix.height), source_pix.samples)
export_image = Image.frombytes('RGB', (export_pix.width, export_pix.height), export_pix.samples)
viewer_image = Image.open(viewer_png).convert('RGB')
if source_image.size != export_image.size or source_image.size != viewer_image.size:
    raise RuntimeError(f'Viewer/source/export raster sizes differ: {viewer_image.size}, {source_image.size}, {export_image.size}')
crop_page_points = pymupdf.Rect(85, 285, 735, 435)
crop = tuple(round(value * scale) for value in (crop_page_points.x0, crop_page_points.y0, crop_page_points.x1, crop_page_points.y1))
panels = [source_image.crop(crop), viewer_image.crop(crop), export_image.crop(crop)]
labels = ['FONTE OFICIAL EN', 'VIEWER PT-BR ISOLADO', 'PDF EXPORTADO PT-BR']
label_height, gap = 38, 10
comparison = Image.new('RGB', (sum(panel.width for panel in panels) + gap * 2, panels[0].height + label_height), 'white')
draw = ImageDraw.Draw(comparison)
try:
    font = ImageFont.truetype('arial.ttf', 20)
except OSError:
    font = ImageFont.load_default()
x = 0
for panel, label in zip(panels, labels, strict=True):
    draw.text((x + 8, 8), label, fill='#202020', font=font)
    comparison.paste(panel, (x, label_height))
    x += panel.width + gap
comparison_path = proof_dir / f'source-viewer-pdf-crop-{version}.png'
comparison_bytes = io.BytesIO()
comparison.save(comparison_bytes, format='PNG', optimize=True)
new_bytes = comparison_bytes.getvalue()
if comparison_path.exists() and comparison_path.read_bytes() != new_bytes:
    raise RuntimeError(f'Refusing to overwrite changed comparison proof: {comparison_path}')
if not comparison_path.exists():
    comparison_path.write_bytes(new_bytes)

manifest = {
    'page': page_number,
    'locale': 'pt-BR',
    'sourcePdfSha256': digest(source_pdf),
    'exportPdfSha256': digest(export_pdf),
    'viewerScreenshotSha256': digest(viewer_png),
    'comparisonCropSha256': hashlib.sha256(new_bytes).hexdigest(),
    'mediaBoxPt': [float(value) for value in source_page.mediabox],
    'sourceVisualLineCounts': source_visual_line_counts,
    'targetVisualLineCounts': target_visual_line_counts,
    'sourceFramesPt': source_boxes,
    'sourceInkBoundsPt': source_ink_bounds,
    'frameFitByUnit': frame_fit,
    'overflowByUnit': overflow_by_unit,
    'allTextInsideSourceFrames': all(frame_fit.values()),
    'noInterUnitCollision': not collisions,
    'collisions': collisions,
    'candidateTextOccurrences': candidate_occurrences,
    'sourceFallbackOccurrences': source_fallback_occurrences,
    'humanPageRecordsBefore': 10,
    'humanPageRecordsInSnapshot': len(human_docs),
    'humanPageRecordsPreserved': human_preserved,
    'payloadWriteRequests': 0,
    'comparisonImage': str(comparison_path),
    'comparison': ['official EN source PDF', 'isolated PageRenderer PT-BR Viewer screenshot', 'independent raster of official one-page PT-BR export'],
}
manifest_path.parent.mkdir(parents=True, exist_ok=True)
manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
if manifest_path.exists() and manifest_path.read_bytes() != manifest_bytes:
    raise RuntimeError(f'Refusing to overwrite changed copyfit receipt: {manifest_path}')
if not manifest_path.exists():
    manifest_path.write_bytes(manifest_bytes)
print(json.dumps(manifest, ensure_ascii=True, indent=2))
