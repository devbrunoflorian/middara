"""Full, source-reviewed tag compositions; consumed by the sole registry builder.

Source EN glyph outlines are retained exactly. Localized labels use the shipped
Optima Demi face; only the background's central length grows, not its corners.
No source page or stored translation is edited by this module.
"""
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from copy import deepcopy
import pymupdf as fitz
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
NS = {'s': 'http://www.w3.org/2000/svg'}
SPECS = [
    ('tag.passive', 'PASSIVE', 'PASSIVO', 97, '✤'),
    ('tag.status', 'STATUS', 'STATUS', 105, '✜'),
    ('tag.exhaust', 'EXHAUST', 'EXAUSTAR', 106, None),
    ('tag.discard', 'DISCARD', 'DESCARTAR', 109, '✘'),
]


def source_glyph_paths(page, rect, svg, codepoint=None, font_contains=None):
    definitions = {node.attrib.get('id'): node for node in svg.findall('.//s:defs/*', NS)}
    chars = [char for trace in page.get_texttrace() if trace['type'] == 0
        and (font_contains is None or font_contains in trace['font'])
        for char in trace['chars'] if rect.contains(fitz.Rect(char[3]))
        and (codepoint is None or char[0] == codepoint)]
    paths = []
    for use in svg.findall('.//s:use', NS):
        matrix = re.fullmatch(r'matrix\(([^)]+)\)', use.attrib.get('transform', ''))
        if not matrix:
            continue
        m = [float(value) for value in re.split('[ ,]+', matrix[1])]
        if not any(abs(m[4]-char[2][0]) < .002 and abs(m[5]-char[2][1]) < .002 for char in chars):
            continue
        ref = use.attrib['{http://www.w3.org/1999/xlink}href'].lstrip('#')
        shape = definitions[ref]
        paths.append(dict(d=shape.attrib['d'], transform=f'matrix({m[0]} {m[1]} {m[2]} {m[3]} {m[4]-rect.x0} {m[5]-rect.y0})', fill=use.attrib.get('fill', '#ffffff')))
    if not paths:
        raise ValueError('Missing source text paths in compound')
    return paths


def localized_label(font, text, size, origin, fill, tracking=0):
    glyphs = font.getGlyphSet(); cmap = font.getBestCmap(); scale = size/font['head'].unitsPerEm
    paths = []; cursor = origin[0]
    for char in text:
        name = cmap[ord(char)]; pen = SVGPathPen(glyphs); glyphs[name].draw(pen)
        paths.append(dict(d=pen.getCommands(), transform=f'matrix({scale} 0 0 {-scale} {cursor} {origin[1]})', fill=fill))
        cursor += font['hmtx'].metrics[name][0]*scale + (tracking if len(paths) < len(text)-1 else 0)
    return paths, cursor-origin[0]


def extend_background(drawing, rect, delta):
    """Keep both corner radii intact by moving only the right half of the body."""
    result = deepcopy(drawing); middle = (rect.x0+rect.x1)/2
    def point(p):
        return fitz.Point(p.x + (delta if p.x > middle else 0), p.y)
    items = []
    for item in drawing['items']:
        op = item[0]
        if op in ('l', 'c'):
            items.append((op, *(point(p) for p in item[1:])))
        elif op == 're':
            r = item[1]; items.append((op, fitz.Rect(point(r.tl), point(r.br)), *item[2:]))
        elif op == 'qu':
            q = item[1]; items.append((op, fitz.Quad(*(point(p) for p in [q.ul, q.ur, q.ll, q.lr]))))
        else:
            raise ValueError(f'Unsupported compound background operation {op}')
    result['items'] = items
    return result


def compound_definitions(doc, vector_path, native_paint_colors, definition):
    page = doc[89]; drawings = page.get_drawings(); svg = ET.fromstring(page.get_svg_image(text_as_path=True))
    font = TTFont(ROOT/'apps/web/public/fonts/Optima LT Std Demi.otf'); entries = []
    bold_font = TTFont(ROOT/'apps/web/public/fonts/Optima LT Std Bold.otf')
    for id, en, pt, index, icon in SPECS:
        body = drawings[index]; rect = body['rect']
        traces = [trace for trace in page.get_texttrace() if trace['font'] == 'OptimaLTStd-DemiBold'
            and ''.join(chr(char[0]) for char in trace['chars']) == en]
        trace = next(trace for trace in traces if rect.contains(fitz.Rect(trace['bbox'])))
        assert trace['size'] == 9 and body['type'] == 'f' and 15 < rect.height < 17
        origin = trace['chars'][0][2]; size = trace['size']; width = trace['bbox'][2]-trace['bbox'][0]
        components = [(i, shape) for i, shape in enumerate(drawings) if rect.contains(shape['rect'])]
        assert [i for i, _ in components] == ([106, 107] if id == 'tag.exhaust' else [index])
        vectors = [dict(d=vector_path(shape), transform=f'translate({-rect.x0} {-rect.y0})', fill='#231f20' if i == index else '#ffffff') for i, shape in components]
        vectors = native_paint_colors(page, rect, vectors)
        paths = vectors + source_glyph_paths(page, rect, svg)
        local_origin = [origin[0]-rect.x0, origin[1]-rect.y0]
        # The source PDF uses 0.45 pt of tracking on these labels. Verify it
        # against the actual advances/origins instead of relying on bbox width.
        cmap = font.getBestCmap(); units = font['head'].unitsPerEm
        gaps = []
        for left, right in zip(trace['chars'], trace['chars'][1:]):
            advance = font['hmtx'].metrics[cmap[left[0]]][0] * size / units
            gaps.append(right[2][0]-left[2][0]-advance)
        source_advance = sum(font['hmtx'].metrics[cmap[char[0]]][0] * size / units for char in trace['chars'])
        assert abs(source_advance + sum(gaps) - width) < .003, (en, source_advance, gaps, width)
        # The four source labels share this measured face and 0.45 pt of visual
        # tracking on most pairs; the PT label uses that proven typographic
        # rhythm, while EN stays the exact PDF outline paths above.
        tracking = .45
        translated, translated_width = localized_label(font, pt, size, local_origin, '#ffffff', tracking)
        delta = translated_width-width
        icon_paths = source_glyph_paths(page, rect, svg)[:1] if icon else []
        if icon:
            assert any(char[0] == ord(icon) for t in page.get_texttrace() for char in t['chars'] if rect.contains(fitz.Rect(char[3])))
        # The original page background already owns the source capsule body.
        # Preserve its full width for shorter PT labels and only grow to fit a
        # longer label, so the source drawing is always completely covered.
        background_delta = max(0, delta)
        localized_width = rect.width + background_delta
        pt_vectors = [dict(vectors[0], d=vector_path(extend_background(body, rect, background_delta))), *vectors[1:]]
        metrics = dict(widthEm=rect.width/size, heightEm=rect.height/size, verticalAlignEm=(rect.y1-origin[1])/size)
        render = dict(viewBox=[0, 0, rect.width, rect.height], paths=paths, **metrics)
        localized_icon_paths = source_glyph_paths(page, rect, svg, ord(icon), 'ZapfDingbatsStd') if icon else []
        render['localized'] = {'pt-BR': dict(viewBox=[0, 0, localized_width, rect.height], paths=pt_vectors+localized_icon_paths+translated,
            **dict(metrics, widthEm=localized_width/size))}
        entry = definition(id, en, pt, 90, list(rect), render, 'Tags compostas')
        entry['composition'] = dict(type='compound', labelKey='inline.'+id, sourceFont='OptimaLTStd-DemiBold',
            localizedFont='/fonts/Optima LT Std Demi.otf', localizedLabel={'en': en, 'pt-BR': pt},
            backgroundDrawing=index, iconGlyph=icon, foregroundDrawings=[i for i, _ in components[1:]],
            sourceLabelBbox=list(trace['bbox']), sourceLabelOrigin=list(origin), sourceLabelSize=size)
        entry['description'] = {'en': en+' complete tag: background, icon and localized label.',
            'pt-BR': pt+' — tag completa: fundo, ícone e rótulo localizado. Termo PT editorial provisório.'}
        if id == 'tag.exhaust':
            entry['description']['pt-BR'] = 'EXAUSTAR — tag completa: fundo, ícone e rótulo localizado. Termo PT aprovado pelo usuário.'
        entries.append(entry)
    status = next(entry for entry in entries if entry['id'] == 'tag.status')
    compact_status = compact_status_variant(doc, vector_path, native_paint_colors)
    status['render']['variants'] = {'compact': compact_status}
    status['render']['variants']['prose-9pt'] = prose_status_variant(doc, vector_path, native_paint_colors)
    passive = next(entry for entry in entries if entry['id'] == 'tag.passive')
    passive['render']['variants'] = {
        'prose-8pt': prose_passive_variant(doc, vector_path, native_paint_colors, font),
        'table-6.54pt': compact_table_tag_variant(doc, vector_path, native_paint_colors,
            symbol_id='tag.passive', label='PASSIVE', pt_label='PASSIVO', glyph='✤',
            font_name='OptimaLTStd-DemiBold', font=font, drawing_indices=[162,164,166,175,177,183],
            tracking=.3271574),
    }
    status['render']['variants']['table-6.5pt'] = compact_table_tag_variant(doc, vector_path,
        native_paint_colors, symbol_id='tag.status', label='STATUS', pt_label='STATUS', glyph='✜',
        font_name='OptimaLTStd-Bold', font=bold_font, drawing_indices=[154,169,194], tracking=0)
    exhaust = next(entry for entry in entries if entry['id'] == 'tag.exhaust')
    exhaust['render'].setdefault('variants', {})['prose-6.62pt'] = prose_exhaust_variant(
        doc, vector_path, native_paint_colors, font)
    discard = next(entry for entry in entries if entry['id'] == 'tag.discard')
    discard['render']['variants'] = {'table-6.5pt': compact_table_tag_variant(doc, vector_path,
        native_paint_colors, symbol_id='tag.discard', label='DISCARD', pt_label='DESCARTAR', glyph='✘',
        font_name='OptimaLTStd-Bold', font=bold_font, drawing_indices=[280,281,282,283,284], tracking=0)}
    entries.extend(reference_letter_definitions(doc, vector_path, definition, bold_font))
    font.close()
    bold_font.close()
    return entries


def reference_letter_definitions(doc, vector_path, definition, bold_font):
    """Create source-exact white tile + letter objects for page-40 inline refs."""
    page = doc[39]
    drawings = page.get_drawings()
    svg = ET.fromstring(page.get_svg_image(text_as_path=True))
    specs = {
        'A': [103,104,135],
        'B': [97,99,102,136],
        'C': [100],
        'D': [98,101],
    }
    entries = []
    for letter, drawing_indices in specs.items():
        if ord(letter) not in bold_font.getBestCmap():
            raise ValueError(f'Optima Bold font file lacks page-40 marker {letter}')
        body = drawings[drawing_indices[0]]
        tile_rect = fitz.Rect(body['rect'])
        if body['type'] != 'f' or tuple(body.get('fill') or ()) != (1.0,1.0,1.0):
            raise ValueError(f'Unexpected page-40 marker tile for {letter}: {body}')
        if abs(tile_rect.width-9.996) > .002 or abs(tile_rect.height-9.996) > .002:
            raise ValueError(f'Unexpected page-40 marker tile size for {letter}: {tile_rect}')

        representative = None
        relative_char_bbox = None
        for index in drawing_indices:
            box = fitz.Rect(drawings[index]['rect'])
            if (drawings[index]['type'] != 'f'
                or abs(box.width-tile_rect.width) > .003
                or abs(box.height-tile_rect.height) > .003
                or tuple(drawings[index].get('fill') or ()) != (1.0,1.0,1.0)):
                raise ValueError(f'Inconsistent page-40 {letter} tile path at drawing {index}: {box}')
            traces = [trace for trace in page.get_texttrace()
                if trace['font'] == 'OptimaLTStd-Bold'
                and ''.join(chr(char[0]) for char in trace['chars']) == letter
                and abs(trace['size']-8) < .002
                and (box+(-1,-2,1,2)).intersects(fitz.Rect(trace['bbox']))]
            if len(traces) != 1:
                raise ValueError(f'Expected one Optima Bold {letter} label above p40 drawing {index}, found {len(traces)}')
            trace = traces[0]
            char_rect = fitz.Rect(trace['chars'][0][3])
            offset = tuple(round(value,5) for value in (
                char_rect.x0-box.x0, char_rect.y0-box.y0,
                char_rect.x1-box.x0, char_rect.y1-box.y0))
            if relative_char_bbox is None:
                relative_char_bbox = offset
                representative = (box, trace)
            elif max(abs(a-b) for a,b in zip(offset,relative_char_bbox)) > .003:
                raise ValueError(f'Page-40 {letter} glyph metrics vary across reference tiles')

        assert representative is not None
        box, trace = representative
        label_rect = fitz.Rect(trace['chars'][0][3])
        rect = box | label_rect
        origin = trace['chars'][0][2]
        paths = [dict(d=vector_path(body), transform=f'translate({-rect.x0} {-rect.y0})', fill='#ffffff')]
        label_paths = source_glyph_paths(page, rect, svg, ord(letter), 'OptimaLTStd-Bold')
        if not label_paths:
            raise ValueError(f'Missing source glyph outline for page-40 reference {letter}')
        paths.extend(dict(path, fill='currentColor') for path in label_paths)
        size = trace['size']
        metrics = dict(widthEm=rect.width/size, heightEm=rect.height/size,
            verticalAlignEm=(rect.y1-origin[1])/size)
        symbol_id = f'marker.reference.{letter.lower()}'
        entry = definition(symbol_id, f'Reference {letter}', f'Referência {letter}', 40,
            list(rect), dict(viewBox=[0,0,rect.width,rect.height],paths=paths,**metrics), 'Marcadores alfabéticos')
        entry['composition'] = dict(type='compound', sourceFont='OptimaLTStd-Bold', sourceFontSizePt=size,
            localizedLabel={'en':letter,'pt-BR':letter}, fixedTile='white 10pt square')
        entry['description'] = {
            'en': f'White reference tile {letter} with its letter as one movable inline object.',
            'pt-BR': f'Quadrado branco de referência {letter} e sua letra em um único objeto inline móvel.',
        }
        entries.append(entry)
    return entries


def compact_table_tag_variant(doc, vector_path, native_paint_colors, *, symbol_id, label,
    pt_label, glyph, font_name, font, drawing_indices, tracking):
    """Rebuild repeated 6.5pt condition capsules in the page-95 rules tables."""
    page = doc[94]
    drawings = page.get_drawings()
    svg = ET.fromstring(page.get_svg_image(text_as_path=True))
    codepoint = ord(glyph)
    reference = drawings[drawing_indices[0]]
    rect = fitz.Rect(reference['rect'])
    if reference['type'] != 'f' or tuple(round(v, 4) for v in reference['fill']) != (0.1367, 0.122, 0.1253):
        raise ValueError(f'Unexpected p95 {symbol_id} capsule body: {reference}')

    def normalized_items(drawing, bbox):
        result = []
        for item in drawing['items']:
            coords = []
            for value in item[1:]:
                if isinstance(value, fitz.Point):
                    coords.extend(((value.x-bbox.x0)/bbox.width, (value.y-bbox.y0)/bbox.height))
                elif isinstance(value, fitz.Rect):
                    coords.extend(((value.x0-bbox.x0)/bbox.width, (value.y0-bbox.y0)/bbox.height,
                        (value.x1-bbox.x0)/bbox.width, (value.y1-bbox.y0)/bbox.height))
                elif isinstance(value, fitz.Quad):
                    for point in [value.ul, value.ur, value.lr, value.ll]:
                        coords.extend(((point.x-bbox.x0)/bbox.width, (point.y-bbox.y0)/bbox.height))
                else:
                    coords.append(value)
            result.append((item[0], coords))
        return result

    target_items = normalized_items(reference, rect)
    expected_size = 6.543099880218506 if symbol_id == 'tag.passive' else 6.5
    first_label = None
    for index in drawing_indices:
        body = drawings[index]
        body_rect = fitz.Rect(body['rect'])
        if body['type'] != 'f' or abs(body_rect.width-rect.width) > .002 or abs(body_rect.height-rect.height) > .002:
            raise ValueError(f'Inconsistent p95 {symbol_id} capsule geometry at drawing {index}: {body_rect}')
        candidate_items = normalized_items(body, body_rect)
        same_paths = len(candidate_items) == len(target_items) and all(
            left[0] == right[0] and len(left[1]) == len(right[1])
            and max((abs(a-b) for a, b in zip(left[1], right[1])), default=0) < .000003
            for left, right in zip(candidate_items, target_items))
        if not same_paths:
            raise ValueError(f'p95 {symbol_id} background drawings are not exact geometry matches')
        if tuple(round(v, 4) for v in body['fill']) != (0.1367, 0.122, 0.1253):
            raise ValueError(f'Inconsistent p95 {symbol_id} fill at drawing {index}: {body["fill"]}')

        labels = [trace for trace in page.get_texttrace() if trace['font'] == font_name
            and ''.join(chr(char[0]) for char in trace['chars']) == label
            and body_rect.contains(fitz.Rect(trace['bbox']))]
        icons = [char for trace in page.get_texttrace() if trace['font'] == 'ZapfDingbatsStd'
            for char in trace['chars'] if char[0] == codepoint and body_rect.contains(fitz.Rect(char[3]))]
        if len(labels) != 1 or len(icons) != 1 or abs(labels[0]['size']-expected_size) > .002:
            raise ValueError(f'Missing/mismatched p95 {symbol_id} glyph or label at drawing {index}')
        trace = labels[0]
        relative_label = (trace['chars'][0][2][0]-body_rect.x0, trace['chars'][0][2][1]-body_rect.y0)
        if first_label is None:
            first_label = (trace, relative_label)
        elif abs(relative_label[0]-first_label[1][0]) > .002 or abs(relative_label[1]-first_label[1][1]) > .002:
            raise ValueError(f'p95 {symbol_id} label origin differs across repeated capsules')

    trace = first_label[0]
    origin = trace['chars'][0][2]
    size = trace['size']
    vectors = [dict(d=vector_path(reference), transform=f'translate({-rect.x0} {-rect.y0})', fill='#231f20')]
    vectors = native_paint_colors(page, rect, vectors)
    paths = vectors + source_glyph_paths(page, rect, svg, codepoint, 'ZapfDingbatsStd')
    paths += source_glyph_paths(page, rect, svg, font_contains=font_name)
    if len(paths) < 8:
        raise ValueError(f'Incomplete p95 {symbol_id} source capsule: only {len(paths)} paths')

    local_origin = [origin[0]-rect.x0, origin[1]-rect.y0]
    if pt_label == label:
        translated = source_glyph_paths(page, rect, svg, font_contains=font_name)
        translated_width = trace['bbox'][2]-trace['bbox'][0]
    else:
        translated, translated_width = localized_label(font, pt_label,
            size, local_origin, '#ffffff', tracking)
    source_width = trace['bbox'][2]-trace['bbox'][0]
    delta = max(0, translated_width-source_width)
    localized_width = rect.width+delta
    localized_body = dict(vectors[0], d=vector_path(extend_background(reference, rect, delta)))
    localized_icon = source_glyph_paths(page, rect, svg, codepoint, 'ZapfDingbatsStd')
    metrics = dict(widthEm=rect.width/size, heightEm=rect.height/size,
        verticalAlignEm=(rect.y1-origin[1])/size)
    return dict(viewBox=[0, 0, rect.width, rect.height], paths=paths, **metrics,
        localized={'pt-BR': dict(viewBox=[0, 0, localized_width, rect.height],
            paths=[localized_body, *localized_icon, *translated],
            **dict(metrics, widthEm=localized_width/size))})


def compact_status_variant(doc, vector_path, native_paint_colors):
    """Rebuild the measured compact STATUS capsule shared by source pages 37 and 100."""
    page = doc[36]
    drawing_index = 109
    drawings = page.get_drawings()
    body = drawings[drawing_index]
    rect = fitz.Rect(body['rect'])
    assert body['type'] == 'f' and abs(rect.width - 44.65099) < .002 and abs(rect.height - 9.184998) < .002
    other_page = doc[99]
    other_body = other_page.get_drawings()[218]
    other_rect = fitz.Rect(other_body['rect'])
    assert other_body['type'] == 'f' and abs(other_rect.width - rect.width) < .002 and abs(other_rect.height - rect.height) < .002
    assert tuple(round(v, 4) for v in body['fill']) == tuple(round(v, 4) for v in other_body['fill'])
    for left, right in zip(body['items'], other_body['items']):
        assert left[0] == right[0]
        left_points = [coord for point in left[1:] for coord in (point.x-rect.x0, point.y-rect.y0)]
        right_points = [coord for point in right[1:] for coord in (point.x-other_rect.x0, point.y-other_rect.y0)]
        assert len(left_points) == len(right_points) and max(abs(a-b) for a,b in zip(left_points,right_points)) < .002

    traces = [trace for trace in page.get_texttrace() if trace['font'] == 'OptimaLTStd-DemiBold'
        and ''.join(chr(char[0]) for char in trace['chars']) == 'STATUS' and rect.contains(fitz.Rect(trace['bbox']))]
    label = next(trace for trace in traces if abs(trace['size'] - 6.54309988) < .001)
    assert all(fitz.Rect(char[3]).x0 >= rect.x0 and fitz.Rect(char[3]).y0 >= rect.y0
        and fitz.Rect(char[3]).x1 <= rect.x1 and fitz.Rect(char[3]).y1 <= rect.y1 for char in label['chars'])
    icon_chars = [char for trace in page.get_texttrace() if trace['font'] == 'ZapfDingbatsStd'
        for char in trace['chars'] if char[0] == ord('✜') and rect.contains(fitz.Rect(char[3]))]
    assert len(icon_chars) == 1 and abs(icon_chars[0][1] - 4) == 0
    peer_label = [trace for trace in other_page.get_texttrace() if trace['font'] == 'OptimaLTStd-DemiBold'
        and ''.join(chr(char[0]) for char in trace['chars']) == 'STATUS' and other_rect.contains(fitz.Rect(trace['bbox']))]
    peer_icons = [char for trace in other_page.get_texttrace() if trace['font'] == 'ZapfDingbatsStd'
        for char in trace['chars'] if char[0] == ord('✜') and other_rect.contains(fitz.Rect(char[3]))]
    assert len(peer_label) == 1 and abs(peer_label[0]['size']-label['size']) < .001
    assert len(peer_icons) == 1 and abs(peer_icons[0][1]-icon_chars[0][1]) == 0
    assert abs(peer_label[0]['chars'][0][2][0]-other_rect.x0 - (label['chars'][0][2][0]-rect.x0)) < .002
    assert abs(peer_label[0]['chars'][0][2][1]-other_rect.y0 - (label['chars'][0][2][1]-rect.y0)) < .002

    svg = ET.fromstring(page.get_svg_image(text_as_path=True))
    body_path = dict(d=vector_path(body), transform=f'translate({-rect.x0} {-rect.y0})', fill='#231f20')
    body_path = native_paint_colors(page, rect, [body_path])[0]
    paths = [body_path]
    paths.extend(source_glyph_paths(page, rect, svg, ord('✜'), 'ZapfDingbatsStd'))
    paths.extend(source_glyph_paths(page, rect, svg, font_contains='OptimaLTStd-DemiBold'))
    size = label['size']
    metrics = dict(widthEm=rect.width/size, heightEm=rect.height/size,
        verticalAlignEm=(rect.y1-label['chars'][0][2][1])/size)
    return dict(viewBox=[0, 0, rect.width, rect.height], paths=paths, **metrics)


def prose_status_variant(doc, vector_path, native_paint_colors):
    """Rebuild the measured 9pt STATUS capsule used inline in page 58 prose."""
    page = doc[57]
    drawing_index = 107
    drawings = page.get_drawings()
    body = drawings[drawing_index]
    rect = fitz.Rect(body['rect'])
    expected = (597.9517822265625, 662.9556884765625, 654.2647705078125, 674.5386962890625)
    assert body['type'] == 'f' and max(abs(a-b) for a,b in zip(rect, expected)) < .002
    assert tuple(round(v, 4) for v in body['fill']) == (0.1367, 0.122, 0.1253)

    labels = [trace for trace in page.get_texttrace()
        if trace['font'] == 'OptimaLTStd-DemiBold'
        and ''.join(chr(char[0]) for char in trace['chars']) == 'STATUS'
        and rect.contains(fitz.Rect(trace['bbox']))]
    icons = [char for trace in page.get_texttrace() if trace['font'] == 'ZapfDingbatsStd'
        for char in trace['chars'] if char[0] == ord('✜') and rect.contains(fitz.Rect(char[3]))]
    assert len(labels) == 1 and abs(labels[0]['size'] - 9) < .001
    assert len(icons) == 1

    svg = ET.fromstring(page.get_svg_image(text_as_path=True))
    paths = [dict(d=vector_path(body), transform=f'translate({-rect.x0} {-rect.y0})', fill='#231f20')]
    paths = native_paint_colors(page, rect, paths)
    paths.extend(source_glyph_paths(page, rect, svg, ord('✜'), 'ZapfDingbatsStd'))
    paths.extend(source_glyph_paths(page, rect, svg, font_contains='OptimaLTStd-DemiBold'))
    assert len(paths) >= 8, f'Incomplete p58 STATUS composition: {len(paths)} SVG paths'

    size = labels[0]['size']
    metrics = dict(widthEm=rect.width/size, heightEm=rect.height/size,
        verticalAlignEm=(rect.y1-labels[0]['chars'][0][2][1])/size)
    return dict(viewBox=[0, 0, rect.width, rect.height], paths=paths, **metrics)


def prose_passive_variant(doc, vector_path, native_paint_colors, font):
    """Rebuild the measured 8pt PASSIVE capsule used inline in page 59 prose."""
    page = doc[58]
    drawing_index = 246
    drawings = page.get_drawings()
    body = drawings[drawing_index]
    rect = fitz.Rect(body['rect'])
    expected = (440.44500732421875, 576.989013671875, 491.6820068359375, 588.011962890625)
    assert body['type'] == 'f' and max(abs(a-b) for a,b in zip(rect, expected)) < .002
    assert tuple(round(v, 4) for v in body['fill']) == (0.1367, 0.122, 0.1253)

    labels = [trace for trace in page.get_texttrace()
        if trace['font'] == 'OptimaLTStd-DemiBold'
        and ''.join(chr(char[0]) for char in trace['chars']) == 'PASSIVE'
        and rect.contains(fitz.Rect(trace['bbox']))]
    icons = [char for trace in page.get_texttrace() if trace['font'] == 'ZapfDingbatsStd'
        for char in trace['chars'] if char[0] == ord('✤') and rect.contains(fitz.Rect(char[3]))]
    assert len(labels) == 1 and abs(labels[0]['size'] - 8) < .001
    assert len(icons) == 1

    svg = ET.fromstring(page.get_svg_image(text_as_path=True))
    paths = [dict(d=vector_path(body), transform=f'translate({-rect.x0} {-rect.y0})', fill='#231f20')]
    paths = native_paint_colors(page, rect, paths)
    paths.extend(source_glyph_paths(page, rect, svg, ord('✤'), 'ZapfDingbatsStd'))
    paths.extend(source_glyph_paths(page, rect, svg, font_contains='OptimaLTStd-DemiBold'))
    assert len(paths) >= 8, f'Incomplete p59 PASSIVE composition: {len(paths)} SVG paths'

    label = labels[0]
    size = label['size']
    origin = label['chars'][0][2]
    local_origin = [origin[0]-rect.x0, origin[1]-rect.y0]
    # The source label tracks at 0.4 pt for adjacent letters on this compact tag.
    translated, translated_width = localized_label(font, 'PASSIVO', size, local_origin, '#ffffff', .4)
    source_width = label['bbox'][2] - label['bbox'][0]
    delta = max(0, translated_width - source_width)
    localized_width = rect.width + delta
    localized_body = dict(paths[0], d=vector_path(extend_background(body, rect, delta)))
    localized_icon = source_glyph_paths(page, rect, svg, ord('✤'), 'ZapfDingbatsStd')

    metrics = dict(widthEm=rect.width/size, heightEm=rect.height/size,
        verticalAlignEm=(rect.y1-origin[1])/size)
    return dict(viewBox=[0, 0, rect.width, rect.height], paths=paths, **metrics,
        localized={'pt-BR': dict(viewBox=[0, 0, localized_width, rect.height],
            paths=[localized_body, *localized_icon, *translated],
            **dict(metrics, widthEm=localized_width/size))})


def prose_exhaust_variant(doc, vector_path, native_paint_colors, font):
    """Rebuild the visible compact EXHAUST capsule in page 70's example prose."""
    page = doc[69]
    drawings = page.get_drawings()
    body_index, arrow_index = 188, 189
    body, arrow = drawings[body_index], drawings[arrow_index]
    rect = fitz.Rect(body['rect'])
    expected = (272.79730224609375, 570.8878784179688, 319.2807312011719, 579.8575439453125)
    assert body['type'] == 'f' and max(abs(a-b) for a,b in zip(rect, expected)) < .002
    assert arrow['type'] == 'f' and rect.contains(arrow['rect'])
    assert tuple(round(v, 4) for v in body['fill']) == (0.1367, 0.122, 0.1253)
    assert tuple(round(v, 4) for v in arrow['fill']) == (1.0, 1.0, 1.0)

    labels = [trace for trace in page.get_texttrace()
        if trace['font'] == 'OptimaLTStd-DemiBold'
        and ''.join(chr(char[0]) for char in trace['chars']) == 'EXHAUST'
        and rect.contains(fitz.Rect(trace['bbox']))]
    assert len(labels) == 1 and abs(labels[0]['size'] - 6.8607001304626465) < .002
    label = labels[0]
    origin = label['chars'][0][2]
    svg = ET.fromstring(page.get_svg_image(text_as_path=True))
    vectors = [
        dict(d=vector_path(body), transform=f'translate({-rect.x0} {-rect.y0})', fill='#231f20'),
        dict(d=vector_path(arrow), transform=f'translate({-rect.x0} {-rect.y0})', fill='#ffffff'),
    ]
    vectors = native_paint_colors(page, rect, vectors)
    paths = vectors + source_glyph_paths(page, rect, svg, font_contains='OptimaLTStd-DemiBold')
    assert len(paths) >= 9, f'Incomplete compact EXHAUST composition: {len(paths)} SVG paths'

    size = label['size']
    local_origin = [origin[0]-rect.x0, origin[1]-rect.y0]
    # Source pair spacing averages just under 0.3 pt on this 6.86pt tag.
    translated, translated_width = localized_label(font, 'EXAUSTAR', size, local_origin, '#ffffff', .3)
    source_width = label['bbox'][2] - label['bbox'][0]
    delta = max(0, translated_width - source_width)
    localized_width = rect.width + delta
    localized_body = dict(paths[0], d=vector_path(extend_background(body, rect, delta)))
    localized_arrow = dict(paths[1], d=vector_path(extend_background(arrow, rect, delta)))
    metrics = dict(widthEm=rect.width/size, heightEm=rect.height/size,
        verticalAlignEm=(rect.y1-origin[1])/size)
    return dict(viewBox=[0, 0, rect.width, rect.height], paths=paths, **metrics,
        localized={'pt-BR': dict(viewBox=[0, 0, localized_width, rect.height],
            paths=[localized_body, localized_arrow, *translated],
            **dict(metrics, widthEm=localized_width/size))})
