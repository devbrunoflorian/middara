"""Attach source-reviewed compound-tag proof occurrences to their page spans.

The source PDF's capsule bodies/icons are drawings or font glyphs and their
labels are separate spans. These sidecars join the exact ranges into one
editor object; they do not edit translation records or extracted source DOM.
"""
from __future__ import annotations

import json
from pathlib import Path
import xml.etree.ElementTree as ET

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
COMPACT_STATUS = [
    (37, 'block_16', 'line_16_2', 0, 1, '✜ STATUS',
        [243.9921112060547, 136.19219970703125, 288.6430969238281, 145.377197265625]),
    (100, 'block_24', 'line_24_2', 0, 1, '✜ STATUS',
        [583.6747436523438, 127.44598388671875, 628.3257446289062, 136.6309814453125]),
]


def make_element(registry, dom, symbol_id, block_id, line_id, start, end, expected, rect, *, variant=None, size=None):
    block_index = next(i for i, block in enumerate(dom['blocks']) if block['id'] == block_id)
    block = dom['blocks'][block_index]
    line = next(line for line in block['lines'] if line['id'] == line_id)
    source_text = ''.join(span['text'] for span in line['spans'][start:end + 1]).strip()
    assert source_text == expected, (symbol_id, source_text, expected)
    definition = registry[symbol_id]
    if variant:
        render = definition['render']['variants'][variant]
        assert render
        size = size or 6.543099880218506
        metrics = dict(widthEm=(rect[2]-rect[0])/size, heightEm=(rect[3]-rect[1])/size,
            verticalAlignEm=render['verticalAlignEm'], renderVariant=variant)
    else:
        render = definition['render']
        size = size or 9.0
        metrics = dict(widthEm=(rect[2]-rect[0])/size, heightEm=(rect[3]-rect[1])/size,
            verticalAlignEm=render['verticalAlignEm'])
    return {
        'symbolId': symbol_id,
        'bbox': rect,
        'sizePt': size,
        'metrics': metrics,
        'anchor': {
            'blockId': block_id,
            'blockIndex': block_index,
            'lineId': line_id,
            'spanStartIndex': start,
            'spanEndIndex': end,
        },
    }

dom = json.loads(DOM_PATH.read_text(encoding='utf8'))
registry = {item['id']: item for item in json.loads(REGISTRY_PATH.read_text(encoding='utf8'))}
elements = []
for symbol_id, block_id, line_id, start, end, expected in ANCHORS:
    definition = registry[symbol_id]
    assert definition['composition']['type'] == 'compound'
    elements.append(make_element(registry, dom, symbol_id, block_id, line_id, start, end, expected,
        definition['source']['bboxPt']))

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

# The same compact source STATUS treatment occurs in prose on pages 37 and 100.
# Its viewport is distinct from p. 90 but the semantic identity is the same.
for page_no, block_id, line_id, start, end, expected, rect in COMPACT_STATUS:
    page_dir = ROOT / f'apps/web/public/pages/page_{page_no:03d}'
    page_dom = json.loads((page_dir / f'page_{page_no:03d}_dom.json').read_text(encoding='utf8'))
    item = make_element(registry, page_dom, 'tag.status', block_id, line_id, start, end, expected, rect,
        variant='compact')
    (page_dir / 'compound_elements.json').write_text(
        json.dumps({'schemaVersion': 1, 'elements': [item]}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

    inline_path = page_dir / 'inline_elements.json'
    inline_data = json.loads(inline_path.read_text(encoding='utf8'))
    inline_data['elements'] = [element for element in inline_data['elements']
        if not (element['symbolId'] == 'tag.status.icon' and element['anchor']['blockId'] == block_id
            and element['anchor']['lineId'] == line_id and element['anchor']['spanIndex'] == start)]
    inline_path.write_text(json.dumps(inline_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

    if page_no == 37:
        glyph_overlay = page_dir / 'fidelity-overlay-component-source-zapf-glyphs.svg'
        tree = ET.parse(glyph_overlay)
        root = tree.getroot()
        target = [node for node in root if node.tag.endswith('path')
            and '251.0134' in node.attrib.get('transform', '') and '142.90503' in node.attrib.get('transform', '')]
        if len(target) == 1:
            assert target[0].attrib.get('d', '').startswith('M.4869995')
            root.remove(target[0])
            tree.write(glyph_overlay, encoding='unicode')
        else:
            assert len(target) == 0, f'Unexpected duplicate source STATUS glyph paths: {len(target)}'
    else:
        overlay_path = page_dir / 'fidelity_overlays.json'
        overlay_data = json.loads(overlay_path.read_text(encoding='utf8'))
        remove_urls = {
            '/pages/page_100/fidelity-overlay-component-status-tag-pill.svg',
            '/pages/page_100/fidelity-overlay-component-status-tag-icon.png',
        }
        overlay_data['overlays'] = [overlay for overlay in overlay_data['overlays'] if overlay.get('url') not in remove_urls]
        assert all(not any(overlay.get('url', '').endswith(url.rsplit('/', 1)[-1]) for url in remove_urls)
            for overlay in overlay_data['overlays'])
        overlay_path.write_text(json.dumps(overlay_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

    # This mask was solely for the formerly independent status glyph.
    stale_mask = page_dir / ('inline-element-mask-002.png' if page_no == 37 else 'inline-element-mask-001.png')
    stale_mask.unlink(missing_ok=True)
    print(json.dumps({'page': page_no, 'compoundOccurrences': 1,
        'remainingInlineElements': len(inline_data['elements']), 'variant': 'compact'}, ensure_ascii=False))

# Page 58 uses the same STATUS identity in a larger in-prose capsule. Its
# Zapf dingbat and Optima label become one semantic object; the text is not
# copied into a translated string or removed from the source DOM.
page_no = 58
page_dir = ROOT / 'apps/web/public/pages/page_058'
page_dom = json.loads((page_dir / 'page_058_dom.json').read_text(encoding='utf8'))
rect = [597.9517822265625, 662.9556884765625, 654.2647705078125, 674.5386962890625]
item = make_element(registry, page_dom, 'tag.status', 'block_28', 'line_28_2', 1, 2,
    '✜ STATUS', rect, variant='prose-9pt', size=9.0)
(page_dir / 'compound_elements.json').write_text(
    json.dumps({'schemaVersion': 1, 'elements': [item]}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

inline_path = page_dir / 'inline_elements.json'
inline_data = json.loads(inline_path.read_text(encoding='utf8'))
inline_data['elements'] = [element for element in inline_data['elements']
    if not (element['symbolId'] == 'tag.status.icon' and element['anchor']['blockId'] == 'block_28'
        and element['anchor']['lineId'] == 'line_28_2' and element['anchor']['spanIndex'] == 1)]
inline_path.write_text(json.dumps(inline_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

overlay_path = page_dir / 'fidelity_overlays.json'
overlay_data = json.loads(overlay_path.read_text(encoding='utf8'))
overlay_data['overlays'] = [overlay for overlay in overlay_data['overlays']
    if overlay.get('region') != 'status-tag-inline-symbol']
overlay_path.write_text(json.dumps(overlay_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
(page_dir / 'inline-element-mask-001.png').unlink(missing_ok=True)
(page_dir / 'fidelity-overlay-status-tag-inline-symbol.png').unlink(missing_ok=True)
print(json.dumps({'page': page_no, 'compoundOccurrences': 1,
    'remainingInlineElements': len(inline_data['elements']), 'variant': 'prose-9pt'}, ensure_ascii=False))

# Page 47's condition-tag examples reuse the exact p90 discard/exhaust
# artwork. DISCARD's Zapf glyph and label share a PDF drawing with the capsule;
# EXHAUST's white arrow is a separate source vector, also retained in p90.
page_no = 47
page_dir = ROOT / 'apps/web/public/pages/page_047'
page_dom = json.loads((page_dir / 'page_047_dom.json').read_text(encoding='utf8'))
p47_specs = [
    ('tag.discard', 'block_14', 'line_14_0', 4, 5, '✘DISCARD',
        [228.91329956054688, 157.76373291015625, 288.13531494140625, 173.8267364501953]),
    ('tag.exhaust', 'block_14', 'line_14_1', 0, 0, 'EXHAUST',
        [302.5857849121094, 157.76373291015625, 365.0557861328125, 173.8267364501953]),
]
p47_elements = [make_element(registry, page_dom, symbol_id, block_id, line_id, start, end,
    expected, rect) for symbol_id, block_id, line_id, start, end, expected, rect in p47_specs]
(page_dir / 'compound_elements.json').write_text(
    json.dumps({'schemaVersion': 1, 'elements': p47_elements}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

inline_path = page_dir / 'inline_elements.json'
inline_data = json.loads(inline_path.read_text(encoding='utf8'))
inline_data['elements'] = [element for element in inline_data['elements']
    if not (element['symbolId'] == 'tag.discard.icon' and element['anchor']['blockId'] == 'block_14'
        and element['anchor']['lineId'] == 'line_14_0' and element['anchor']['spanIndex'] == 4)]
inline_path.write_text(json.dumps(inline_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

overlay_path = page_dir / 'fidelity_overlays.json'
overlay_data = json.loads(overlay_path.read_text(encoding='utf8'))
overlay_data['overlays'] = [overlay for overlay in overlay_data['overlays']
    if overlay.get('region') != 'discard-tag-x-symbol']
overlay_path.write_text(json.dumps(overlay_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
(page_dir / 'inline-element-mask-001.png').unlink(missing_ok=True)
(page_dir / 'fidelity-overlay-discard-tag-x-symbol.png').unlink(missing_ok=True)
print(json.dumps({'page': page_no, 'compoundOccurrences': len(p47_elements),
    'remainingInlineElements': len(inline_data['elements']), 'variants': ['source']}, ensure_ascii=False))

# The page-100 composition overlays are no longer referenced; remove their assets.
page100 = ROOT / 'apps/web/public/pages/page_100'
for unused in ['fidelity-overlay-component-status-tag-pill.svg', 'fidelity-overlay-component-status-tag-icon.png']:
    (page100 / unused).unlink(missing_ok=True)
