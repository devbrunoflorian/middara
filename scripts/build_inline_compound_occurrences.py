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

# Page 59's PASSIVE tag is a smaller capsule embedded in ordinary prose.
# Keep the icon and Demi label together as one `tag.passive` editing object.
page_no = 59
page_dir = ROOT / 'apps/web/public/pages/page_059'
page_dom = json.loads((page_dir / 'page_059_dom.json').read_text(encoding='utf8'))
rect = [440.44500732421875, 576.989013671875, 491.6820068359375, 588.011962890625]
item = make_element(registry, page_dom, 'tag.passive', 'block_195', 'line_195_1', 1, 2,
    '✤PASSIVE', rect, variant='prose-8pt', size=8.0)
(page_dir / 'compound_elements.json').write_text(
    json.dumps({'schemaVersion': 1, 'elements': [item]}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

inline_path = page_dir / 'inline_elements.json'
inline_data = json.loads(inline_path.read_text(encoding='utf8'))
inline_data['elements'] = [element for element in inline_data['elements']
    if not (element['symbolId'] == 'tag.passive.icon' and element['anchor']['blockId'] == 'block_195'
        and element['anchor']['lineId'] == 'line_195_1' and element['anchor']['spanIndex'] == 1)]
inline_path.write_text(json.dumps(inline_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
(page_dir / 'inline-element-mask-000.png').unlink(missing_ok=True)
print(json.dumps({'page': page_no, 'compoundOccurrences': 1,
    'remainingInlineElements': len(inline_data['elements']), 'variant': 'prose-8pt'}, ensure_ascii=False))

# Page 73 repeats the same measured 8pt PASSIVE capsule in its page legend.
page_no = 73
page_dir = ROOT / 'apps/web/public/pages/page_073'
page_dom = json.loads((page_dir / 'page_073_dom.json').read_text(encoding='utf8'))
rect = [418.22882080078125, 547.78662109375, 469.4658203125, 558.8096313476562]
item = make_element(registry, page_dom, 'tag.passive', 'block_108', 'line_108_1', 1, 2,
    '✤PASSIVE', rect, variant='prose-8pt', size=8.0)
(page_dir / 'compound_elements.json').write_text(
    json.dumps({'schemaVersion': 1, 'elements': [item]}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

inline_path = page_dir / 'inline_elements.json'
inline_data = json.loads(inline_path.read_text(encoding='utf8'))
removed = [element for element in inline_data['elements']
    if element['symbolId'] == 'tag.passive.icon' and element['anchor']['blockId'] == 'block_108'
        and element['anchor']['lineId'] == 'line_108_1' and element['anchor']['spanIndex'] == 1]
assert len(removed) <= 1, f'Unexpected duplicate p73 source icon adapters: {len(removed)}'
inline_data['elements'] = [element for element in inline_data['elements'] if element not in removed]
inline_path.write_text(json.dumps(inline_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
if removed:
    mask_path = ROOT / 'apps/web/public' / removed[0]['mask']['url'].lstrip('/')
    mask_path.unlink(missing_ok=True)
else:
    previous = json.loads((page_dir / 'compound_elements.json').read_text(encoding='utf8'))
    assert any(element['symbolId'] == 'tag.passive' and element['anchor']['blockId'] == 'block_108'
        and element['anchor']['lineId'] == 'line_108_1' and element['anchor']['spanStartIndex'] == 1
        and element['anchor']['spanEndIndex'] == 2 for element in previous['elements']), \
        'No p73 source adapter or existing compound anchor found'
print(json.dumps({'page': page_no, 'compoundOccurrences': 1,
    'remainingInlineElements': len(inline_data['elements']), 'variant': 'prose-8pt'}, ensure_ascii=False))

# Page 70 has one visually present compact EXHAUST tag in the example callout.
# Two other extracted EXHAUST runs have no visible ink in the source PDF render
# and no matching DOM anchor, so they are deliberately not adopted.
page_no = 70
page_dir = ROOT / 'apps/web/public/pages/page_070'
page_dom = json.loads((page_dir / 'page_070_dom.json').read_text(encoding='utf8'))
rect = [272.79730224609375, 570.8878784179688, 319.2807312011719, 579.8575439453125]
item = make_element(registry, page_dom, 'tag.exhaust', 'block_36', 'line_36_1', 0, 0,
    'EXHAUST', rect, variant='prose-6.62pt', size=6.6209611892700195)
(page_dir / 'compound_elements.json').write_text(
    json.dumps({'schemaVersion': 1, 'elements': [item]}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({'page': page_no, 'compoundOccurrences': 1,
    'variant': 'prose-6.62pt', 'excludedInvisibleExtractions': 2}, ensure_ascii=False))

# Page 95 has three reusable compact capsule shapes repeated across rules tables.
# Join each icon+label pair into one editing object; adjacent body prose/newline
# spans and the two larger standalone DISCARD glyphs remain ordinary content.
page_no = 95
page_dir = ROOT / 'apps/web/public/pages/page_095'
page_dom = json.loads((page_dir / 'page_095_dom.json').read_text(encoding='utf8'))
p95_specs = [
    ('tag.status', 'block_7', 'line_7_0', 0, 1, '✜ STATUS',
        [155.0869140625, 85.0252685546875, 193.44090270996094, 94.21026611328125], 'table-6.5pt', 6.5),
    ('tag.status', 'block_20', 'line_20_0', 0, 1, '✜ STATUS',
        [155.0869140625, 285.7438659667969, 193.44090270996094, 294.9288635253906], 'table-6.5pt', 6.5),
    ('tag.status', 'block_35', 'line_35_0', 0, 1, '✜ STATUS',
        [155.0869140625, 475.2506103515625, 193.44090270996094, 484.43560791015625], 'table-6.5pt', 6.5),
    ('tag.passive', 'block_10', 'line_10_0', 0, 1, '✤PASSIVE',
        [155.0869140625, 116.8455810546875, 197.7779083251953, 126.03057861328125], 'table-6.54pt', 6.543099880218506),
    ('tag.passive', 'block_13', 'line_13_0', 0, 1, '✤PASSIVE',
        [155.0869140625, 147.7752685546875, 197.7779083251953, 156.96026611328125], 'table-6.54pt', 6.543099880218506),
    ('tag.passive', 'block_16', 'line_16_0', 0, 1, '✤PASSIVE',
        [155.0869140625, 184.95989990234375, 197.7779083251953, 194.1448974609375], 'table-6.54pt', 6.543099880218506),
    ('tag.passive', 'block_23', 'line_23_0', 0, 1, '✤PASSIVE',
        [155.0869140625, 315.8192138671875, 197.7779083251953, 325.00421142578125], 'table-6.54pt', 6.543099880218506),
    ('tag.passive', 'block_28', 'line_28_0', 0, 1, '✤PASSIVE',
        [155.0869140625, 397.61279296875, 197.7779083251953, 406.79779052734375], 'table-6.54pt', 6.543099880218506),
    ('tag.passive', 'block_31', 'line_31_0', 0, 1, '✤PASSIVE',
        [155.0869140625, 427.5423583984375, 197.7779083251953, 436.72735595703125], 'table-6.54pt', 6.543099880218506),
    ('tag.discard', 'block_59', 'line_59_0', 0, 1, '✘DISCARD',
        [519.9058837890625, 76.23919677734375, 558.2598876953125, 85.4241943359375], 'table-6.5pt', 6.5),
    ('tag.discard', 'block_62', 'line_62_0', 0, 1, '✘DISCARD',
        [519.9058837890625, 131.35159301757812, 558.2598876953125, 140.53659057617188], 'table-6.5pt', 6.5),
    ('tag.discard', 'block_64', 'line_64_0', 0, 1, '✘DISCARD',
        [519.9058837890625, 161.71420288085938, 558.2598876953125, 170.89920043945312], 'table-6.5pt', 6.5),
    ('tag.discard', 'block_66', 'line_66_0', 0, 1, '✘DISCARD',
        [519.9058837890625, 190.84201049804688, 558.2598876953125, 200.02700805664062], 'table-6.5pt', 6.5),
    ('tag.discard', 'block_68', 'line_68_0', 0, 1, '✘DISCARD',
        [519.9058837890625, 229.05029296875, 558.2598876953125, 238.23529052734375], 'table-6.5pt', 6.5),
]
p95_elements = [make_element(registry, page_dom, symbol_id, block_id, line_id, start, end,
    expected, rect, variant=variant, size=size)
    for symbol_id, block_id, line_id, start, end, expected, rect, variant, size in p95_specs]
(page_dir / 'compound_elements.json').write_text(
    json.dumps({'schemaVersion': 1, 'elements': p95_elements}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

inline_path = page_dir / 'inline_elements.json'
inline_data = json.loads(inline_path.read_text(encoding='utf8'))
removed = [element for element in inline_data['elements'] if any(
    element['symbolId'] == symbol_id+'.icon'
    and element['anchor']['blockId'] == block_id and element['anchor']['lineId'] == line_id
    and element['anchor']['spanIndex'] == start
    for symbol_id, block_id, line_id, start, *_ in p95_specs)]
assert len(removed) in (0, 14), f'Expected 14 p95 tag-icon adapters or an already-applied migration, found {len(removed)}'
inline_data['elements'] = [element for element in inline_data['elements'] if element not in removed]
inline_path.write_text(json.dumps(inline_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
for element in removed:
    mask = ROOT / 'apps/web/public' / element['mask']['url'].lstrip('/')
    mask.unlink(missing_ok=True)

overlay_path = page_dir / 'fidelity_overlays.json'
overlay_data = json.loads(overlay_path.read_text(encoding='utf8'))
overlay_region = 'All fourteen STATUS/PASSIVE/DISCARD rounded black tag capsules'
matching_overlays = [overlay for overlay in overlay_data['overlays'] if overlay.get('region') == overlay_region]
assert len(matching_overlays) == (1 if removed else 0), \
    f'Expected the p95 fixed capsule overlay to match migration state, found {len(matching_overlays)}'
overlay_data['overlays'] = [overlay for overlay in overlay_data['overlays'] if overlay.get('region') != overlay_region]
overlay_path.write_text(json.dumps(overlay_data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
(page_dir / 'fidelity-overlay-component-condition-tag-pills.svg').unlink(missing_ok=True)
print(json.dumps({'page': page_no, 'compoundOccurrences': len(p95_elements),
    'remainingInlineElements': len(inline_data['elements']), 'removedComponentOverlays': len(matching_overlays)}, ensure_ascii=False))

# The ten A-D callouts in page-40 prose each consist of a white source tile and
# a separate 8pt letter. Keep the two larger A/B diagram labels independent.
page_no = 40
page_dir = ROOT / 'apps/web/public/pages/page_040'
page_dom = json.loads((page_dir / 'page_040_dom.json').read_text(encoding='utf8'))
p40_specs = [
    ('marker.reference.b', 'block_8', 'line_8_3', 1, 'B', [390.7929992675781,328.08001708984375,400.78900146484375,338.0760192871094]),
    ('marker.reference.d', 'block_8', 'line_8_3', 4, 'D', [620.2186889648438,328.08001708984375,630.2146606445312,338.0760192871094]),
    ('marker.reference.b', 'block_9', 'line_9_0', 1, 'B', [236.8531036376953,344.7492980957031,246.84910583496094,354.74530029296875]),
    ('marker.reference.c', 'block_9', 'line_9_0', 4, 'C', [556.1791381835938,344.7492980957031,566.1751098632812,354.74530029296875]),
    ('marker.reference.d', 'block_9', 'line_9_1', 4, 'D', [234.45350646972656,355.7492980957031,244.4495086669922,365.74530029296875]),
    ('marker.reference.b', 'block_10', 'line_10_0', 1, 'B', [160.7633056640625,372.4186096191406,170.75930786132812,382.41461181640625]),
    ('marker.reference.a', 'block_10', 'line_10_2', 3, 'A', [442.38348388671875,394.4186096191406,452.3794860839844,404.41461181640625]),
    ('marker.reference.a', 'block_10', 'line_10_3', 1, 'A', [185.45339965820312,405.4186096191406,195.44940185546875,415.41461181640625]),
    ('marker.reference.a', 'block_37', 'line_37_8', 3, 'A', [586.1011962890625,725.3963012695312,596.09716796875,735.3922729492188]),
    ('marker.reference.b', 'block_37', 'line_37_11', 1, 'B', [502.54779052734375,759.3963012695312,512.5438232421875,769.3922729492188]),
]
p40_elements = []
for symbol_id, block_id, line_id, span_index, letter, rect in p40_specs:
    p40_elements.append(make_element(registry, page_dom, symbol_id, block_id, line_id,
        span_index, span_index, letter, rect, size=8.0))
(page_dir / 'compound_elements.json').write_text(
    json.dumps({'schemaVersion': 1, 'elements': p40_elements}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({'page': page_no, 'compoundOccurrences': len(p40_elements),
    'letters': {letter: sum(item[4] == letter for item in p40_specs) for letter in 'ABCD'},
    'diagramMarkersUntouched': 2}, ensure_ascii=False))

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
