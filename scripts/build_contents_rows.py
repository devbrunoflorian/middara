"""Page-3 independent labels and exact leader-free source patches; dry run default."""
from pathlib import Path
import argparse,json,re,math
import pymupdf as fitz
from PIL import Image, ImageChops

ROOT=Path(__file__).resolve().parents[1]
PDF=Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')

def build(apply,verify=False):
    folder=ROOT/'apps/web/public/pages/page_003';data=json.loads((folder/'page_003_dom.json').read_text('utf8'))
    doc=fitz.open(PDF);page=doc[2];stream=page.read_contents()
    artifacts=re.findall(rb'/Artifact\s*<<.*?>>BDC.*?EMC',stream,re.S)
    leaders=[]
    for artifact in artifacts:
        dash=re.search(rb'\[0 ([\d.]+)\]\s*0 d',artifact)
        if not dash:continue
        vals=[float(v) for v in re.search(rb'/BBox \[([^]]+)\]',artifact)[1].split()]
        box=[vals[0],page.rect.height-vals[3],vals[2],page.rect.height-vals[1]]
        leaders.append(dict(bbox=box,periodPt=float(dash[1]),widthPt=1.5 if float(dash[1])>2.5 else 1))
    assert len(leaders)==40
    targets=data['blocks'][-1]['lines'][:40]
    labels=[(bi,b,l) for bi,b in enumerate(data['blocks'][1:-1],1) for l in b['lines']]
    assert len(labels)==len(targets)==40
    rows=[]
    for i,((bi,b,line),number) in enumerate(zip(labels,targets)):
        # Label/ref pairs are ordered in the PDF; leader nearest their baseline.
        leader=min(leaders,key=lambda d:abs((d['bbox'][1]+d['bbox'][3])/2-(number['bbox'][3]-3)))
        exact=next((u for u in b.get('typographicUnits',[]) if u['field']['lineIds']==[line['id']]),None)
        spanunit=next((u for u in b.get('typographicSpanUnits',[]) if set(u['spanRefs'])=={f"{line['id']}:{j}" for j in range(len(line['spans']))}),None)
        stem=f'page_3_block_{bi}' if len(b['lines'])==1 else f"page_3_unit_{exact['id'] if exact else spanunit['id'] if spanunit else 'p3-toc-'+line['id'].replace('_','-')}"
        legacy=[f'page_3_block_{bi}'] if len(b['lines'])>1 else []
        legacy += [f"page_3_unit_{u['id']}" for u in b.get('typographicUnits',[]) if line['id'] in u['field']['lineIds'] and len(u['field']['lineIds'])>1]
        y0=min(line['bbox'][1],leader['bbox'][1])-.5;y1=max(line['bbox'][3],leader['bbox'][3])+.5
        r=[math.floor(line['bbox'][0]*4)/4,math.floor(y0*4)/4,math.ceil(leader['bbox'][2]*4)/4,math.ceil(y1*4)/4]
        rows.append(dict(id=f'toc-{i:02d}',blockId=b['id'],blockIndex=bi,lineId=line['id'],keyStem=stem,legacyCombinedKeyStems=legacy,
          labelBBox=line['bbox'],numberLineId=number['id'],numberBBox=number['bbox'],targetPage=int(''.join(s['text'] for s in number['spans']).strip()),
          leader={**leader,'yPt':(leader['bbox'][1]+leader['bbox'][3])/2},mask=dict(url=f'/pages/page_003/contents-paper-{i:02d}.png',bbox=r)))
    assert len({r['keyStem'] for r in rows})==40
    assert len({tuple(r['leader']['bbox']) for r in rows})==40
    if apply or verify:
        def remove_leader(match):
            value=match[0]
            return re.sub(rb'\bS\b',b'n',value) if re.search(rb'\[0 [\d.]+\]\s*0 d',value) else value
        revised=re.sub(rb'/Artifact\s*<<.*?>>BDC.*?EMC',remove_leader,stream,flags=re.S)
        assert len(re.findall(rb'\bS\b',stream))-len(re.findall(rb'\bS\b',revised))==80
        assert len(page.get_contents())==1
        doc.update_stream(page.get_contents()[0],revised)
        for b in page.get_text('blocks'):
            if b[4].strip():page.add_redact_annot(fitz.Rect(b[:4]),fill=None)
        page.apply_redactions(images=0,graphics=0,text=0)
        pix=page.get_pixmap(matrix=fitz.Matrix(4,4));image=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        for row in rows:
            crop=image.crop(tuple(round(v*4) for v in row['mask']['bbox']))
            destination=folder/row['mask']['url'].rsplit('/',1)[-1]
            if apply:crop.save(destination)
            else:
                with Image.open(destination) as saved:
                    assert saved.size==crop.size, destination
                    assert ImageChops.difference(saved.convert('RGB'),crop).getbbox() is None, destination
        payload=dict(schemaVersion=1,rows=rows)
        if apply:(folder/'contents_rows.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n','utf8')
        else:assert json.loads((folder/'contents_rows.json').read_text('utf8'))==payload
    print(json.dumps(dict(rows=len(rows),uniqueKeys=len({r['keyStem'] for r in rows}),leaders=len(leaders),apply=apply,
                         verifiedMasks=len(rows) if verify else 0,sourcePixelDifferences=0 if verify else None)))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    modes=parser.add_mutually_exclusive_group()
    modes.add_argument('--apply',action='store_true')
    modes.add_argument('--verify',action='store_true',help='Read-only source/JSON/pixel comparison of every shipped patch')
    args=parser.parse_args();build(args.apply,args.verify)
