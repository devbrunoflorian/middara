"""Attach the source-reviewed compound-tag proof occurrences on PDF page 90.

The source PDF's four capsule bodies/icons are drawings and its labels are
separate spans. This sidecar joins those exact ranges into one editor object;
it does not edit translation records or extracted source DOM.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / 'apps/web/public/pages/page_090'
DOM_PATH = PAGE_DIR / 'page_090_dom.json'
REGISTRY_PATH = ROOT / 'apps/web/src/symbols/sourceSymbols.json'

ANCHORS = [
    ('tag.passive', 'block_15', 'line_15_1', 0, 1, '✤PASSIVE'),
    ('tag.status', 'block_17', 'line_17_0', 0, 1, '✜ STATUS'),
    ('tag.exhaust', 'block_18', 'line_18_0', 0, 0, 'EXHAUST'),
    ('tag.discard', 'block_20', 'line_20_0', 0, 1, '✘DISCARD'),
]

dom = json.loads(DOM_PATH.read_text(encoding='utf8'))
registry = {item['id']: item for item in json.loads(REGISTRY_PATH.read_text(encoding='utf8'))}
elements = []
for symbol_id, block_id, line_id, start, end, expected in ANCHORS:
    block_index = next(i for i, block in enumerate(dom['blocks']) if block['id'] == block_id)
    block = dom['blocks'][block_index]
    line = next(line for line in block['lines'] if line['id'] == line_id)
    source_text = ''.join(span['text'] for span in line['spans'][start:end + 1]).strip()
    assert source_text == expected, (symbol_id, source_text, expected)
    definition = registry[symbol_id]
    assert definition['composition']['type'] == 'compound'
    rect = definition['source']['bboxPt']
    size = 9.0
    elements.append({
        'symbolId': symbol_id,
        'bbox': rect,
        'sizePt': size,
        'metrics': {
            'widthEm': (rect[2] - rect[0]) / size,
            'heightEm': (rect[3] - rect[1]) / size,
            'verticalAlignEm': definition['render']['verticalAlignEm'],
        },
        'anchor': {
            'blockId': block_id,
            'blockIndex': block_index,
            'lineId': line_id,
            'spanStartIndex': start,
            'spanEndIndex': end,
        },
    })

(PAGE_DIR / 'compound_elements.json').write_text(
    json.dumps({'schemaVersion': 1, 'elements': elements}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

# These three single-glyph adapters/overlays are now parts of the complete
# capsule compositions. FLIP and PER ENCOUNTER are intentionally untouched.
inline_path = PAGE_DIR / 'inline_elements.json'
inline_data = json.loads(inline_path.read_text(encoding='utf8'))
inline_data['elements'] = [element for element in inline_data['elements']
    if element['symbolId'] not in {'tag.passive.icon', 'tag.status.icon', 'tag.discard.icon'}]
inline_path.write_text(json.dumps(inline_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

overlay_path = PAGE_DIR / 'fidelity_overlays.json'
overlay_data = json.loads(overlay_path.read_text(encoding='utf8'))
overlay_data['overlays'] = [overlay for overlay in overlay_data['overlays']
    if overlay.get('region') not in {
        'PASSIVE condition-tag floral glyph',
        'STATUS condition-tag cross glyph',
        'DISCARD condition-tag X glyph',
    }]
overlay_path.write_text(json.dumps(overlay_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

print(json.dumps({'page': 90, 'compoundOccurrences': len(elements),
    'remainingInlineElements': len(inline_data['elements']),
    'remainingComponentOverlays': len(overlay_data['overlays'])}, ensure_ascii=False))
