"""Guarded p.39 paragraph targets; dry run default, no text or DB migration."""
from pathlib import Path
import argparse,json
import pymupdf as fitz
from repair_pages059_061_062_passive_and_heading_units import make_units

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/'apps/web/public/pages/page_039/page_039_dom.json'
PDF=Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')

def build(apply):
    data=json.loads(PATH.read_text('utf8'));blocks={b['id']:b for b in data['blocks']}
    assert data['page_number']==39
    doc=fitz.open(PDF);traces=doc[38].get_texttrace()
    for id,prefix in [('block_37','Adventurers are limited to '),('block_38','Areas on a '),('block_49','\uf07e')]:
        block=blocks[id];lines=block['lines'];first=lines[0]['spans'][0]
        assert first['text'].startswith(prefix)
        assert any(t['font']==first['font'] and abs(t['size']-first['size'])<.001
            and abs(t['bbox'][0]-first['bbox'][0])<.03
            and ''.join(chr(c[0]) for c in t['chars']).startswith(prefix) for t in traces)
        assert block.get('typographicSpanUnits')
        units=make_units(39,block,[('paragraph',[l['id'] for l in lines])])
        units[0]['field']['frame']['lineHeight']=1.1
        assert not block.get('typographicUnits') or block['typographicUnits']==units
        block['typographicUnits']=units;block['preserveLegacySpanOverrides']=True
    for id,title in [('block_13','Example:'),('block_14','Example:'),('block_43','Free Movement & Diagonal Movement')]:
        block=blocks[id]
        assert ''.join(s['text'] for s in block['lines'][0]['spans']).strip()==title
        assert len(block['typographicUnits'])==2 and len(block['typographicSpanUnits'])==2
        block['preserveLegacySpanOverrides']=True
    assert sum(bool(l.get('rasterizedDuplicate')) for b in data['blocks'] for l in b['lines'])==14
    if apply:PATH.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps(dict(page=39,newParagraphFields=3,existingHeadingBodyFields=6,legacyOptInBlocks=6,apply=apply)))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true')
    build(parser.parse_args().apply)
