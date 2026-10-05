"""Source-reviewed independent p.38 table fields; dry-run unless --apply.

Source IDs/ink coordinates/span units and persistence keys are retained.
Column headers and costs remain anchored to their own source cells; captions
and explanatory prose are not merged across table columns.
"""
from pathlib import Path
import argparse,json
import pymupdf as fitz
from repair_pages059_061_062_passive_and_heading_units import make_units

ROOT=Path(__file__).resolve().parents[1]
PDF=Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
PATH=ROOT/'apps/web/public/pages/page_038/page_038_dom.json'
LEFT, FIRST, SECOND, RIGHT = 86.825,141.1430969,193.8674927,733.9230347

def build(apply):
    data=json.loads(PATH.read_text('utf8'));blocks={b['id']:b for b in data['blocks']}
    assert data['page_number']==38
    document=fitz.open(PDF);page=document[37];traces=page.get_texttrace()
    drawings=page.get_drawings()
    for x in [FIRST,SECOND]:
        assert any(abs(d['rect'].x0-x)<.001 and d['rect'].width<.001
                   and d['rect'].height>15 and 250<d['rect'].y0<559 for d in drawings)
    for block_id in ['block_10','block_27']:
        block=blocks[block_id];lines=block['lines'];assert len(lines)==3
        assert [''.join(s['text'] for s in l['spans']) for l in lines]==['ACTION','SP COST','DESCRIPTION']
        for line in lines:
            span=line['spans'][0]
            assert len(line['spans'])==1 and span['font']=='OptimaLTStd-Bold' and span['size']==8
            assert any(t['font']==span['font'] and t['size']==8
                       and ''.join(chr(c[0]) for c in t['chars'])==span['text']
                       and abs(t['bbox'][0]-span['bbox'][0])<.005 for t in traces)
        units=make_units(38,block,[(name,[line['id']]) for name,line in zip(['action-header','cost-header','description-header'],lines)])
        for unit,x,right in zip(units,[LEFT+4,FIRST+4,SECOND+4],[FIRST-4,SECOND-4,RIGHT-4]):
            unit['fixedPosition']=True
            unit['field']['frame'].update(x=x,width=right-x,textAlign='left' if x>SECOND else 'center')
        assert not block.get('typographicUnits') or block['typographicUnits']==units
        block['typographicUnits']=units

    for block_id,expected in [('block_16','Make an Attack using your equipped Weapon(s) Combat Dice.'),
                              ('block_38','When an Attack deals no Final Damage,')]:
        block=blocks[block_id];lines=block['lines']
        assert ''.join(s['text'] for s in lines[0]['spans']).strip()=='2'
        assert ''.join(s['text'] for s in lines[1]['spans']).startswith(expected)
        assert lines[0]['bbox'][0]<SECOND<lines[1]['bbox'][0]
        units=make_units(38,block,[('sp-cost',[lines[0]['id']]),('description',[l['id'] for l in lines[1:]])])
        for i,unit in enumerate(units):
            unit['fixedPosition']=True
            x=FIRST+4 if i==0 else SECOND+4
            right=SECOND-4 if i==0 else RIGHT-4
            unit['field']['frame'].update(x=x,width=right-x,textAlign='center' if i==0 else 'left',lineHeight=1.1)
        assert not block.get('typographicUnits') or block['typographicUnits']==units
        block['typographicUnits']=units
        block['preserveLegacySpanOverrides']=True

    block=blocks['block_13'];lines=block['lines'];assert len(lines)==3
    assert ''.join(s['text'] for s in lines[0]['spans']).startswith('Move up to your maximum Movement Value.')
    assert lines[1]['spans'][0]['font']=='Webdings' and lines[1]['spans'][0]['text']=='\uf07e'
    units=make_units(38,block,[('move-description',[lines[0]['id']]),('move-important',[l['id'] for l in lines[1:]])])
    for unit in units:
        unit['fixedPosition']=True
        unit['field']['frame'].update(x=SECOND+4,width=RIGHT-4-(SECOND+4),lineHeight=1.1)
    assert not block.get('typographicUnits') or block['typographicUnits']==units
    block['typographicUnits']=units;block['preserveLegacySpanOverrides']=True
    for block_id,name,prefix in [
        ('block_30','dodge-description','During the Dodge step of an Attack,'),
        ('block_33','empower-intro','When building your Combat Dice Pool'),
        ('block_34','empower-attack','When Empowering an Attack,'),
        ('block_35','empower-spell','When Empowering a Spell,'),
    ]:
        block=blocks[block_id];lines=block['lines']
        assert ''.join(s['text'] for s in lines[0]['spans']).startswith(prefix)
        assert all(l['bbox'][0]>SECOND and l['bbox'][2]<RIGHT for l in lines)
        units=make_units(38,block,[(name,[l['id'] for l in lines])])
        units[0]['fixedPosition']=True
        units[0]['field']['frame'].update(x=SECOND+4,width=RIGHT-4-(SECOND+4),lineHeight=1.1)
        assert not block.get('typographicUnits') or block['typographicUnits']==units
        block['typographicUnits']=units;block['preserveLegacySpanOverrides']=True
    if apply:
        PATH.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps(dict(page=38,tableFields=16,sourceInkAndOldSpanUnitsPreserved=True,apply=apply)))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true')
    build(parser.parse_args().apply)
