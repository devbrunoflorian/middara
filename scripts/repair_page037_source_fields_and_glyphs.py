"""Guarded p.37 source glyphs and paragraph fields; dry-run unless --apply.

Glyph paths/CTMs are taken from the native PDF SVG at the exact texttrace origin.
The transparent source layer is hidden by existing inline-element masks after
semantic adoption. Original DOM IDs/text/boxes and old span-unit IDs survive.
"""
from pathlib import Path
import argparse, json, re, xml.etree.ElementTree as ET
import pymupdf as fitz
from repair_pages059_061_062_passive_and_heading_units import make_units

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
FOLDER = ROOT / 'apps/web/public/pages/page_037'
AUDIT = '2026-10-04-p037-source-glyphs-v1'
TARGETS = [
    ('block_16','line_16_2',0,'✜ ','tag.status.icon'),
    ('block_224','line_224_0',1,'➤','marker.arrow'),
    ('block_234','line_234_3',1,'➤','marker.arrow'),
]
NS = {'s':'http://www.w3.org/2000/svg'}

def build(apply):
    path = FOLDER/'page_037_dom.json'
    dom = json.loads(path.read_text('utf8'))
    blocks = {b['id']:b for b in dom['blocks']}
    assert dom['page_number']==37
    doc = fitz.open(PDF); page = doc[36]
    tree = ET.fromstring(page.get_svg_image(text_as_path=True))
    defs = {n.attrib['id']:n for n in tree.findall('.//s:defs/*',NS) if 'id' in n.attrib}
    traces = page.get_texttrace()
    inline = json.loads((FOLDER/'inline_elements.json').read_text('utf8'))['elements']
    paths = []
    for block_id,line_id,index,text,symbol_id in TARGETS:
        line = next(l for l in blocks[block_id]['lines'] if l['id']==line_id)
        span = line['spans'][index]
        assert span['font']=='ZapfDingbatsStd' and span['text']==text
        matches = [t for t in traces if t['font']==span['font'] and abs(t['size']-span['size'])<.001
                   and ''.join(chr(c[0]) for c in t['chars'])==text
                   and abs(t['bbox'][0]-span['bbox'][0])<.005 and abs(t['bbox'][1]-span['bbox'][1])<.005]
        assert len(matches)==1, (block_id,line_id)
        origin = matches[0]['chars'][0][2]
        uses = []
        for use in tree.findall('.//s:use',NS):
            matrix = re.fullmatch(r'matrix\(([^)]+)\)',use.attrib.get('transform',''))
            if not matrix:continue
            values = [float(v) for v in re.split('[ ,]+',matrix[1])]
            if abs(values[4]-origin[0])<.005 and abs(values[5]-origin[1])<.005:uses.append(use)
        assert len(uses)==1, (line_id,len(uses))
        use = uses[0]
        glyph = defs[use.attrib['{http://www.w3.org/1999/xlink}href'].lstrip('#')]
        paths.append(f'<path d="{glyph.attrib["d"]}" transform="{use.attrib["transform"]}" fill="{span["color"]}"/>')
        assert any(e['symbolId']==symbol_id and e['anchor']['blockId']==block_id
                   and e['anchor']['lineId']==line_id and e['anchor']['spanIndex']==index for e in inline)
        span['renderAsSourceOverlayDuplicate']=True
        span['renderSourceOverlayLanguage']='all'
        span['sourcePaintAuditId']=AUDIT
        line['renderSourceSpanGeometry']=True

    for block_id,heading in [('block_18','A. Recover Stamina Points (SP):'),('block_20','B. Un-Exhaust Cards:')]:
        block = blocks[block_id]; lines = block['lines']
        actual = ''.join(s['text'] for s in lines[0]['spans']).strip()
        assert actual==heading and all('Bold' in s['font'] for s in lines[0]['spans'])
        assert len(lines)==4
        for line in lines:
            for span in line['spans']:
                source = [t for t in traces if t['font']==span['font'] and abs(t['size']-span['size'])<.001
                          and t['bbox'][0]>=span['bbox'][0]-.02 and t['bbox'][2]<=span['bbox'][2]+.02
                          and abs(t['bbox'][1]-span['bbox'][1])<2]
                assert source, (block_id,line['id'],span['text'])
                source.sort(key=lambda t:t['bbox'][0])
                assert abs(source[0]['bbox'][0]-span['bbox'][0])<.02 and abs(source[-1]['bbox'][2]-span['bbox'][2])<.02
                actual_text=''.join(chr(c[0]) for t in source for c in t['chars'])
                # Existing DOM appends a synthetic newline to a merged blank
                # source trace; validate text/paint extent without rewriting it.
                assert re.sub(r'\s+',' ',actual_text).strip()==re.sub(r'\s+',' ',span['text']).strip()
        units = make_units(37,block,[('heading',[lines[0]['id']]),('body',[l['id'] for l in lines[1:]])])
        for unit in units:unit['field']['frame']['lineHeight']=1.1
        assert not block.get('typographicUnits') or block['typographicUnits']==units
        block['typographicUnits']=units
        block['preserveLegacySpanOverrides']=True

    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="1710" height="1710" viewBox="0 0 {page.rect.width} {page.rect.height}">'+''.join(paths)+'</svg>\n'
    side_path = FOLDER/'fidelity_overlays.json'
    side = json.loads(side_path.read_text('utf8'))
    name = 'fidelity-overlay-component-source-zapf-glyphs.svg'
    layer = dict(url='/pages/page_037/'+name,bbox=[0,0,dom['width'],dom['height']],widthPx=1710,heightPx=1710,
                 language='en',languageInvariant=True,zIndex=2,auditId=AUDIT,category='source-glyphs',sourcePdfPage=37)
    side['overlays']=[o for o in side['overlays'] if o.get('auditId')!=AUDIT]+[layer]
    if apply:
        backup = ROOT/'tmp/page37-source-before.json'
        if not backup.exists():backup.write_bytes(path.read_bytes())
        path.write_text(json.dumps(dom,ensure_ascii=False,indent=2)+'\n','utf8')
        side_path.write_text(json.dumps(side,ensure_ascii=False,indent=2)+'\n','utf8')
        (FOLDER/name).write_text(svg,'utf8')
    print(json.dumps(dict(page=37,sourceGlyphs=len(paths),paragraphFields=4,legacySpanUnitsPreserved=True,apply=apply)))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    build(parser.parse_args().apply)
