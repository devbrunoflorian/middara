"""Verify source adapter invariants; render PDF/SVG evidence, never a browser."""
from pathlib import Path
import json
from collections import Counter
from xml.sax.saxutils import quoteattr
import pymupdf as fitz
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/project-progress/evidence/2026-10-05-inline-elements-followup'
PDF=Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
ARTWORK_CATEGORIES={'combatant-cards','item-cards','discipline-cards','fixed-artwork',
    'component-artwork','tokens','initiative-cards','physical-cards'}

def svg_for(entry,box,width,height,ink='#231f20'):
    render=entry['render'];attrs=[]
    for path in render['paths']:
        names={'strokeWidth':'stroke-width','fillRule':'fill-rule','strokeLinecap':'stroke-linecap','strokeLinejoin':'stroke-linejoin'}
        attrs.append('<path '+' '.join(f'{names.get(k,k)}={quoteattr(str(v).replace("currentColor",ink))}' for k,v in path.items())+'/>')
    x,y=entry['source']['bboxPt'][:2];v=render['viewBox']
    # Registry viewBox describes source point coordinates, before em scaling.
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {box.width} {box.height}"><g transform="translate({x-box.x0-v[0]} {y-box.y0-v[1]})">'+''.join(attrs)+'</g></svg>'
    doc=fitz.open('svg',svg.encode());pix=doc[0].get_pixmap(alpha=True)
    return Image.frombytes('RGBA',(pix.width,pix.height),pix.samples)

def main():
    definitions=json.loads((ROOT/'apps/web/src/symbols/sourceSymbols.json').read_text(encoding='utf8'));registry={s['id']:s for s in definitions};errors=[];counts=Counter();pages=[]
    for path in sorted((ROOT/'apps/web/public/pages').glob('page_*/inline_elements.json')):
        dom=json.loads(next(path.parent.glob('page_*_dom.json')).read_text(encoding='utf8'));elements=json.loads(path.read_text(encoding='utf8'))['elements'];pages.append(dom['page_number']);seen=set()
        overlays_path=path.parent/'fidelity_overlays.json';overlays=json.loads(overlays_path.read_text(encoding='utf8')).get('overlays',[]) if overlays_path.exists() else []
        for e in elements:
            a=e['anchor'];b=dom['blocks'][a['blockIndex']];l=next((l for l in b['lines'] if l['id']==a['lineId']),None)
            # One source text span may own multiple adjacent symbols. Treat
            # only exact same-geometry records as duplicates (p.78 has two
            # distinct TEAL dice anchored after the same word).
            stamp=(e['symbolId'],a['lineId'],a['spanIndex'],a['side'],tuple(round(v,3) for v in e['bbox']))
            if e['symbolId'] not in registry or not registry[e['symbolId']]['allowedBlockTypes']:errors.append(f'{path}: unregistered/fixed symbol')
            if stamp in seen:errors.append(f'{path}: duplicate {stamp}')
            seen.add(stamp)
            if b['id']!=a['blockId'] or l is None or a['spanIndex']>=len(l['spans']):errors.append(f'{path}: missing source anchor');continue
            if a['side']=='replace-text':
                start,end=a.get('textRange',[0,0]);text=l['spans'][a['spanIndex']]['text']
                if start<0 or end<=start or end>len(text) or text[start:end].strip():errors.append(f'{path}: stale text range')
            if b.get('hiddenFromPage') or b.get('adminReadOnly') or l.get('rasterizedDuplicate') or b['lines'].index(l) in b.get('staticEditorLineIndexes',[]):errors.append(f'{path}: non-prose anchor {stamp}')
            r=fitz.Rect(e['mask']['bbox']);asset=ROOT/'apps/web/public'/e['mask']['url'].lstrip('/');im=Image.open(asset)
            if im.size!=(round(r.width*4),round(r.height*4)):errors.append(f'{path}: patch geometry mismatch {asset.name}')
            if not r.contains(fitz.Rect(e['bbox'])):errors.append(f'{path}: crop truncates symbol')
            if a['side']!='replace':
                metrics=e.get('metrics',{});size=a['sizePt'];box=fitz.Rect(e['bbox'])
                if abs(metrics.get('widthEm',0)*size-box.width)>.001 or abs(metrics.get('heightEm',0)*size-box.height)>.001:errors.append(f'{path}: metrics mismatch')
            for overlay in overlays:
                crop=fitz.Rect(overlay['bbox'])
                if (overlay.get('category') in ARTWORK_CATEGORIES and crop.width>45 and crop.height>45
                    and str(overlay.get('url','')).endswith('.png') and crop.intersects(fitz.Rect(e['bbox']))):
                    errors.append(f'{path}: intersects large artwork {overlay.get("id")} {stamp}')
            counts[e['symbolId']]+=1
    compound_anchors=[]
    for path in sorted((ROOT/'apps/web/public/pages').glob('page_*/compound_elements.json')):
        dom=json.loads(next(path.parent.glob('page_*_dom.json')).read_text(encoding='utf8'))
        elements=json.loads(path.read_text(encoding='utf8'))['elements']
        for element in elements:
            anchor=element['anchor'];definition=registry.get(element['symbolId'])
            block=dom['blocks'][anchor['blockIndex']] if anchor['blockIndex']<len(dom['blocks']) else None
            line=next((line for line in block['lines'] if line['id']==anchor['lineId']),None) if block else None
            if not definition or definition.get('composition',{}).get('type')!='compound':errors.append(f'{path}: unregistered compound {element["symbolId"]}')
            if not block or block['id']!=anchor['blockId'] or not line:errors.append(f'{path}: missing compound source line');continue
            if anchor['spanStartIndex']<0 or anchor['spanEndIndex']<anchor['spanStartIndex'] or anchor['spanEndIndex']>=len(line['spans']):errors.append(f'{path}: invalid compound span range');continue
            box=fitz.Rect(element['bbox'])
            if abs(element['metrics']['widthEm']*element['sizePt']-box.width)>.001:errors.append(f'{path}: compound width metric mismatch')
            if abs(element['metrics']['heightEm']*element['sizePt']-box.height)>.001:errors.append(f'{path}: compound height metric mismatch')
            if block.get('hiddenFromPage') or block.get('adminReadOnly') or line.get('rasterizedDuplicate'):errors.append(f'{path}: non-prose compound anchor {element["symbolId"]}')
            counts[element['symbolId']]+=1
            compound_anchors.append(dict(symbolId=element['symbolId'],page=dom['page_number'],block=block['id'],line=line['id'],spans=[anchor['spanStartIndex'],anchor['spanEndIndex']]))
    # Evidence of source ink / erasure patch / registry SVG, using native PDF
    # data only. Does not certify CSS, browser baseline, caret or export.
    doc=fitz.open(PDF);examples=[];missing_examples=[];row_height=170
    chosen=['story.pencil','story.flag','attack.melee','attack.ranged','attack.melee-ranged','dice.orange','tag.important.icon','tag.passive.icon','combat.shield']
    sheet=Image.new('RGB',(840,row_height*len(chosen)),'#eeeeee');draw=ImageDraw.Draw(sheet)
    for row,id in enumerate(chosen):
        entry=registry[id];n=entry['source']['page'];sidecar=ROOT/f'apps/web/public/pages/page_{n:03d}/inline_elements.json'
        elements=json.loads(sidecar.read_text(encoding='utf8'))['elements'] if sidecar.exists() else []
        candidates=[e for e in elements if e['symbolId']==id]
        if not candidates:
            missing_examples.append(dict(symbolId=id,page=n,reason='No inline source adapter remains on the representative page.'))
            continue
        element=min(candidates,key=lambda e:sum(abs(a-b) for a,b in zip(e['bbox'],entry['source']['bboxPt'])))
        box=fitz.Rect(element['mask']['bbox']);original=doc[n-1].get_pixmap(matrix=fitz.Matrix(4,4),clip=box);source=Image.frombytes('RGB',(original.width,original.height),original.samples)
        dom=json.loads((ROOT/f'apps/web/public/pages/page_{n:03d}/page_{n:03d}_dom.json').read_text('utf8'));a=element['anchor'];span=next(l for l in dom['blocks'][a['blockIndex']]['lines'] if l['id']==a['lineId'])['spans'][a['spanIndex']]
        ink=element.get('color') or span.get('color') or '#231f20'
        patch=Image.open(ROOT/'apps/web/public'/element['mask']['url'].lstrip('/')).convert('RGB');svg=svg_for(entry,box,patch.width,patch.height,ink);combined=patch.copy();combined.paste(svg,(0,0),svg)
        draw.text((8,row*row_height+4),f'p{n} {id}: PDF / erasure / source SVG',fill='black')
        for col,im in enumerate([source,patch,combined]):
            im=im.resize((im.width*2,im.height*2));sheet.paste(im,(8+col*260,row*row_height+20))
        examples.append(dict(symbolId=id,page=n,paths=len(entry['render']['paths']),bbox=list(box)))
    sheet.save(OUT/'source-erasure-registry-comparison.png')
    report=dict(pages=pages,placements=sum(counts.values()),counts=dict(counts),compoundAnchors=compound_anchors,errors=errors,examples=examples,missingExamples=missing_examples,scope='Source metadata/assets only; browser interaction and final PDF export pending')
    (OUT/'source-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(dict(pages=len(pages),placements=sum(counts.values()),errors=errors)))
    if errors:raise SystemExit(1)

if __name__=='__main__':main()
