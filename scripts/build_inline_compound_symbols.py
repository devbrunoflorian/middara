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
    ('tag.exhaust', 'EXHAUST', 'EXAURIR', 106, None),
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
        entries.append(entry)
    compact_status = compact_status_variant(doc, vector_path, native_paint_colors)
    next(entry for entry in entries if entry['id'] == 'tag.status')['render']['variants'] = {'compact': compact_status}
    font.close()
    return entries


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
