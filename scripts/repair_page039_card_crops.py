"""Exact shared p.39 physical card crops; dry run unless --apply."""
import argparse,json
from repair_page039_fields import ROOT,PATH,PDF
import pymupdf as fitz

AUDIT='2026-10-05-p039-shared-card-crops-v1'
TARGETS=[('avian-flight-card',[90,259,407,327.5],'block_22','Avian Flight'),
         ('like-the-shadows-card',[147,590,344,721],'block_32','Like the Shadows')]

def build(apply):
    data=json.loads(PATH.read_text('utf8'));blocks={b['id']:b for b in data['blocks']}
    assert data['page_number']==39
    doc=fitz.open(PDF);page=doc[38];traces=page.get_texttrace()
    side=PATH.parent/'fidelity_overlays.json';overlays=json.loads(side.read_text('utf8')) if side.exists() else {'overlays':[]}
    for name,bbox,block_id,title in TARGETS:
        block=blocks[block_id];line=block['lines'][0];span=line['spans'][0]
        assert ''.join(s['text'] for s in line['spans']).strip()==title and line['rasterizedDuplicate']
        assert any(t['font']==span['font'] and abs(t['bbox'][0]-span['bbox'][0])<.03
                   and ''.join(chr(c[0]) for c in t['chars']).startswith(title) for t in traces)
        r=fitz.Rect(bbox)
        for b in data['blocks']:
            for l in b['lines']:
                if l.get('rasterizedDuplicate') or not ''.join(s['text'] for s in l['spans']).strip():continue
                assert not r.intersects(fitz.Rect(l['bbox'])),(name,b['id'],l['id'])
        url=f'/pages/page_039/fidelity-overlay-component-{name}.png'
        pix=page.get_pixmap(matrix=fitz.Matrix(4,4),clip=r)
        item=dict(url=url,bbox=bbox,widthPx=pix.width,heightPx=pix.height,language='en',languageInvariant=True,
                  auditId=AUDIT,category='physical-cards',sourcePdfPage=39,region=name)
        old=next((e for e in overlays['overlays'] if e['url']==url),None)
        assert old is None or old==item
        if apply:
            pix.save(PATH.parent/url.rsplit('/',1)[-1])
            if old is None:overlays['overlays'].append(item)
    if apply:side.write_text(json.dumps(overlays,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps(dict(page=39,exactSharedCardCrops=2,newSuppressions=0,apply=apply)))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true');build(parser.parse_args().apply)
