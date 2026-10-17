"""Reconcile source candidates and prepare deterministic sidecars in isolation.

There is deliberately no --apply option: canonical data is read-only. Each
patch records source hashes and an exact before sidecar for a reviewable,
reversible application. Assets preserve each source occurrence's paint.
"""
from __future__ import annotations
import argparse
from collections import Counter
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import xml.etree.ElementTree as ET
from xml.sax.saxutils import quoteattr

import pymupdf as fitz
from PIL import Image

from audit_inline_symbol_integrity import ROOT, DEFAULT_PDF, load, dump, records, sha, normalized_shape, match_shape, prototypes_from_source, inline_anchor, aggregate
from build_inline_symbol_registry import vector_path, native_paint_colors

PAINT_VARIANT_IDS={'combat.page','combat.skull','combat.damage-star','combat.shield','attack.melee','attack.ranged','attack.melee-ranged'}
NS={'s':'http://www.w3.org/2000/svg'}


def neutral(drawings):
    return [{**d,'fill':(0,0,0) if d.get('fill') is not None else None,
             'color':(0,0,0) if d.get('color') is not None else None} for d in drawings]


def whitespace_anchor(c,dom):
    r=fitz.Rect(c['bbox']); candidates=[]
    for s in c.get('nearby',[]):
        if not s['editable'] or s['text'].strip():continue
        box=fitz.Rect(s['bbox']);size=s['sizePt']
        if abs((r.y0+r.y1-box.y0-box.y1)/2)>size*.7:continue
        b=dom['blocks'][s['blockIndex']];line=next(l for l in b['lines'] if l['id']==s['lineId'])
        if -.3<=r.x0-box.x1<=1.6:
            owners=[(i,x) for i,x in enumerate(line['spans'][:s['spanIndex']]) if x['text'].strip()]
            if owners:
                oi,owner=owners[-1]
                candidates.append((abs(r.x0-box.x1),s,oi,'after'))
        if -.3<=box.x0-r.x1<=1.6:
            owners=[(i,x) for i,x in enumerate(line['spans']) if i>s['spanIndex'] and x['text'].strip()]
            if owners:
                oi,owner=owners[0]
                candidates.append((abs(box.x0-r.x1)+.1,s,oi,'before'))
    if not candidates:return None
    _,s,oi,side=min(candidates,key=lambda x:x[0])
    return dict(blockId=s['blockId'],blockIndex=s['blockIndex'],lineId=s['lineId'],spanIndex=s['spanIndex'],
                side=side,sizePt=s['sizePt'],ownerSpanRef=dict(lineId=s['lineId'],spanIndex=oi))


def source_paths(page,indices,box):
    drawings=page.get_drawings();paths=[]
    for i in indices:
        d=drawings[i]
        color=lambda value:'#'+''.join(f'{round(v*255):02x}' for v in value) if value is not None else 'none'
        paths.append(dict(d=vector_path(d),transform=f'translate({-box.x0} {-box.y0})',
            fill=color(d.get('fill')),stroke=color(d.get('color')),strokeWidth=d.get('width') or 0,
            fillRule='evenodd' if d.get('even_odd') else 'nonzero',
            strokeLinecap=['butt','round','square'][max(d.get('lineCap') or (0,0,0))],
            strokeLinejoin=['miter','round','bevel'][round(d.get('lineJoin') or 0)]))
    return native_paint_colors(page,box,paths)


def letter_paths(page,letter,origin,box,cache):
    if page.number not in cache:
        cache[page.number]=ET.fromstring(page.get_svg_image(text_as_path=True))
    svg=cache[page.number];defs={n.attrib.get('id'):n for n in svg.findall('.//s:defs/*',NS)};out=[]
    for use in svg.findall('.//s:use',NS):
        if use.attrib.get('data-text')!=letter:continue
        href=use.attrib.get('{http://www.w3.org/1999/xlink}href','').lstrip('#')
        match=re.fullmatch(r'matrix\(([^)]+)\)',use.attrib.get('transform',''))
        if href not in defs or not match:continue
        m=[float(v) for v in re.split('[ ,]+',match[1])]
        if abs(m[4]-origin[0])>.02 or abs(m[5]-origin[1])>.02:continue
        p=dict(d=defs[href].attrib['d'],transform=f'matrix({m[0]} {m[1]} {m[2]} {m[3]} {m[4]-box.x0} {m[5]-box.y0})')
        for k,v in use.attrib.items():
            if k in ['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin']:
                p[{'stroke-width':'strokeWidth','stroke-linecap':'strokeLinecap','stroke-linejoin':'strokeLinejoin'}.get(k,k)]=float(v) if k=='stroke-width' else v
        p.setdefault('fill','#231f20');out.append(p)
    if not out:raise ValueError(f'No exact source glyph {letter} at {origin} on p{page.number+1}')
    return out


def write_svg(path,box,paths):
    names={'strokeWidth':'stroke-width','fillRule':'fill-rule','strokeLinecap':'stroke-linecap','strokeLinejoin':'stroke-linejoin'}
    path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{box.width}" height="{box.height}" viewBox="0 0 {box.width} {box.height}" overflow="visible">'+
        ''.join('<path '+' '.join(f'{names.get(k,k)}={quoteattr(str(v))}' for k,v in p.items())+'/>' for p in paths)+'</svg>',encoding='utf8')


def baseline_for(page,dom,anchor):
    owner=anchor.get('ownerSpanRef') or anchor;b=dom['blocks'][anchor['blockIndex']]
    line=next(l for l in b['lines'] if l['id']==owner['lineId']);s=line['spans'][owner['spanIndex']]
    if s.get('origin'):return s['origin'][1]
    # A blank slot lacks origin in some sidecars. Match its owning source line
    # to the actual PDF trace; never use bbox bottom as a baseline substitute.
    for block in page.get_text('dict')['blocks']:
        for l in block.get('lines',[]):
            for span in l['spans']:
                if span['font']==s['font'] and abs(span['size']-s['size'])<.02 and abs(span['bbox'][1]-s['bbox'][1])<.05:
                    return span['origin'][1]
    raise ValueError(f'Baseline unavailable: {anchor}')


def source_origin(page, span):
    if span.get('origin'):
        return span['origin']
    matches=[]
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines',[]):
            for item in line['spans']:
                if item['text']==span['text'] and item['font']==span['font'] and abs(item['size']-span['size'])<.02:
                    delta=sum(abs(a-b) for a,b in zip(item['bbox'],span['bbox']))
                    if delta<.3:matches.append((delta,item['origin']))
    if len(matches)!=1:
        raise ValueError(f'Exact source origin unavailable: {span}')
    return matches[0][1]


def appearance_key(page,drawings,c,box,covered,dom):
    appearance=normalized_shape(drawings,c.get('drawingIndices',[]),list(box))
    paints=[{k:d.get(k) for k in ['fill','color','width','lineCap','lineJoin','even_odd','fill_opacity','stroke_opacity']}
        for i in c.get('drawingIndices',[]) for d in [drawings[i]]]
    glyph=None
    if covered:
        block=dom['blocks'][c['anchor']['blockIndex']];line=next(l for l in block['lines'] if l['id']==covered['lineId']);s=line['spans'][covered['spanIndex']]
        origin=source_origin(page,s)
        glyph=dict(text=covered['text'],font=s['font'],size=s['size'],origin=[round((origin[0]-box.x0)/box.width,3),round((origin[1]-box.y0)/box.height,3)])
    return hashlib.sha256(json.dumps([c['symbolId'],appearance[0] if appearance else c.get('imageDigest'),
        [round(v,3) for v in appearance[1]] if appearance else [],paints,glyph],sort_keys=True).encode()).hexdigest()


def image_text_contract(page,c,dom):
    box=fitz.Rect(c['bbox']);covered=[];companions=[];baseline=baseline_for(page,dom,c['anchor'])
    owner_block=dom['blocks'][c['anchor']['blockIndex']]
    for bi,block in enumerate(dom['blocks']):
        for line in block.get('lines',[]):
            for si,s in enumerate(line['spans']):
                r=fitz.Rect(s['bbox'])
                if s['text'].strip() and s['size']<c['anchor']['sizePt']*.4 and box.contains(r):
                    covered.append(dict(blockId=block['id'],lineId=line['id'],spanIndex=si,text=s['text']))
                if block['id']==owner_block['id'] or not s['text'].strip():continue
                if abs(s['size']-c['anchor']['sizePt'])>.01 or not(-.2<=r.x0-box.x1<=1.6):continue
                origin=source_origin(page,s)
                if abs(origin[1]-baseline)<.03:
                    companions.append(dict(blockId=block['id'],blockIndex=bi,lineId=line['id'],spanIndex=si,text=s['text']))
    if len(companions)!=1 or companions[0]['text'].strip()!='Blue Totem.':
        raise ValueError('Reviewed image/prose continuation changed; needs source review')
    return covered,companions


def hydrate_metadata(out,pdf,report):
    root=out/'patches';manifest=load(root/'patch-manifest.json');candidates={c['id']:c for c in report['candidates']}
    if sha(pdf)!=manifest['sourcePdfSha256']:raise ValueError('Source PDF changed')
    with fitz.open(pdf) as doc:
        for p in manifest['pages']:
            n=p['page'];path=root/f'pages/page_{n:03d}/inline_elements.json';sidecar=load(path)
            dom=load(ROOT/f'apps/web/public/pages/page_{n:03d}/page_{n:03d}_dom.json');page=doc[n-1];ds=page.get_drawings()
            for e in sidecar['elements']:
                provenance=e.get('provenance',{})
                if provenance.get('auditId')!='full-symbol-integrity-2026-10-13':continue
                c=candidates[provenance['candidateId']]
                if c['kind']=='image':
                    e['coveredSourceTexts'],e['sourceTextCompanions']=image_text_contract(page,c,dom)
                    e['mask'].pop('clipShape',None)
                    a_path=out/f'pages/p{n:03d}/audit.json';a=load(a_path)
                    for audited in a['candidates']:
                        if audited['id']!=c['id']:continue
                        audited['sourceComposition']={'drawings':c['drawingIndices'],'imageXref':c['xref'],'coveredSourceTexts':e['coveredSourceTexts'],'sourceTextCompanions':e['sourceTextCompanions']}
                        audited['ownershipFindings']=[dict(classification='PROPRIETÁRIO INCORRETO',kind='source-prose-fragment',sourceRef=ref,
                            expectedOwner=e['anchor'],evidence='Same actual PDF baseline and source sentence continuation after the inline image; real editor proof includes the fragment and intentional deletion hides its old paint. Existing independently saved fragments are preserved.') for ref in e['sourceTextCompanions']]
                        merged=[x for x in a['candidates'] if x['kind']=='vector' and set(x.get('drawingIndices',[]))==set(c['drawingIndices'])]
                        audited['mergedSourceCandidates']=merged or audited.get('mergedSourceCandidates',[])
                    a['candidates']=[x for x in a['candidates'] if not(x['kind']=='vector' and set(x.get('drawingIndices',[]))==set(c['drawingIndices']))]
                    dump(a_path,a)
                e['metrics']['sourceAppearanceKey']=appearance_key(page,ds,c,fitz.Rect(e['bbox']),e.get('coveredSourceText'),dom)
                e['provenance']['maskSha256']=sha(path.parent/e['mask']['url'].split('/')[-1])
            dump(path,sidecar);p['preparedSidecarSha256']=sha(path)
    dump(root/'patch-manifest.json',manifest)
    aggregate(out,pdf)
    print(json.dumps({'metadataHydrated':manifest['placementCount'],'canonicalWrites':0}),flush=True)


def reconcile(out,pdf):
    registry=load(ROOT/'apps/web/src/symbols/sourceSymbols.json',[]);existing={}
    for n in range(1,103):existing[n]=records(load(ROOT/f'apps/web/public/pages/page_{n:03d}/inline_elements.json',{}),'elements')
    with fitz.open(pdf) as doc:
        prototypes=prototypes_from_source(doc,registry,existing);neutral_prototypes={}
        for refs in prototypes.values():
            for p in refs:
                if p['symbolId'] not in PAINT_VARIANT_IDS:continue
                ds=doc[p['page']-1].get_drawings();s=normalized_shape(neutral(ds),p['drawingIndices'],p['bbox'])
                if s:neutral_prototypes.setdefault(s[0],[]).append({**p,'values':s[1]})
        for n in range(1,103):
            path=out/f'pages/p{n:03d}/audit.json';a=load(path);dom=load(ROOT/f'apps/web/public/pages/page_{n:03d}/page_{n:03d}_dom.json')
            ds=doc[n-1].get_drawings()
            for c in a['candidates']:
                if (fitz.Rect(c['bbox']) & doc[n-1].rect).is_empty:
                    c['classification']='INDEPENDENTE';c['evidence'].append('Source object lies entirely outside the visible page crop; retained in source inventory but not inline page content.');continue
                if c['kind']=='vector' and not c.get('existingPlacements') and not c.get('compoundMatches'):
                    if not c.get('symbolId'):
                        s=normalized_shape(neutral(ds),c['drawingIndices'],c['bbox']);refs=match_shape(s,neutral_prototypes)
                        ids=sorted({p['symbolId'] for p in refs})
                        if len(ids)==1:
                            c['symbolId']=ids[0];c['probableSymbolIds']=ids
                            c['evidence'].append('Complete path topology/normalized geometry matches reviewed source; paint differs. Occurrence asset will preserve the actual paint, with an editable prose slot required.')
                    if c.get('symbolId') and not c.get('anchor'):
                        c['anchor']=whitespace_anchor(c,dom) or inline_anchor(fitz.Rect(c['bbox']),c.get('nearby',[]),c['symbolId'])
                    if c.get('symbolId') and c.get('anchor') and c['classification']!='INDEPENDENTE':
                        c['classification']='PLACEMENT AUSENTE';c['priority']='alta'
                elif c['kind']=='image' and c.get('symbolId')=='token.blue-totem':
                    # This reviewed source image has a fill and stroke circle
                    # underneath it. The image and these paths are one token.
                    r=fitz.Rect(c['bbox'])
                    members=[i for i,d in enumerate(ds) if r.contains(d['rect'])
                        and abs(d['rect'].width-r.width)<1 and abs(d['rect'].height-r.height)<1]
                    if len(members)!=2:raise ValueError('Blue Totem source composition changed')
                    c['drawingIndices']=members
                    c['anchor']=inline_anchor(fitz.Rect(c['bbox']),c.get('nearby',[]),c['symbolId'])
                    if c['anchor']:
                        c['classification']='PLACEMENT AUSENTE';c['evidence'].append('Exact source image xref/digest and reviewed token registry bounds; source sentence ends “Adventure Book for the” immediately before this token.')
                elif c['kind']=='font-glyph' and c.get('symbolId') and not c.get('existingPlacements'):
                    exact=[s for s in c.get('nearby',[]) if s['font']==c['font'] and s['text'].strip()==c['text'].strip()]
                    if exact:
                        c['classification']='RECONCILIADO';c['evidence'].append('Existing legacy-font codec mapping and exact source span: a vector sidecar is not required for this glyph identity.')
            for c in a['candidates']:
                c['evidence']=list(dict.fromkeys(c['evidence']))
                if c['classification']=='PLACEMENT AUSENTE':
                    c.pop('patchBlockedReason',None)
                    overlays=records(load(ROOT/f'apps/web/public/pages/page_{n:03d}/fidelity_overlays.json',{}),'overlays')
                    block=dom['blocks'][c['anchor']['blockIndex']]
                    block_text=' '.join(s['text'] for l in block.get('lines',[]) for s in l['spans'])
                    enclosing=[o for o in overlays if
                        (o.get('category')=='item-cards' and fitz.Rect(o['bbox']).contains(fitz.Rect(block['bbox'])))
                        or (o.get('category')=='component-icons' and len(re.findall('[A-Za-z]+',block_text))<5
                            and fitz.Rect(o['bbox']).intersects(fitz.Rect(block['bbox'])))]
                    r=fitz.Rect(c['bbox'])
                    interior=[s for s in c.get('nearby',[]) if s['text'].strip().isdigit()
                        and r.x0-.5<=s['bbox'][0] and s['bbox'][2]<=r.x1+.5
                        and r.y0-.5<=(s['bbox'][1]+s['bbox'][3])/2<=r.y1+.5]
                    if enclosing or interior:
                        c['classification']='INDETERMINADO';c['patchBlockedReason']='Existing preserved component artwork or a numeric glyph inside the drawing requires a composite editable contract; matching shape plus proximity does not justify separate symbol movement.'
                        if c['patchBlockedReason'] not in c['evidence']:c['evidence'].append(c['patchBlockedReason'])
            dump(path,a)
    return aggregate(out,pdf)


def prepare(out,pdf,report,selected_pages=None):
    glyph_cache={};root=out/'patches';root.mkdir(exist_ok=True)
    previous=load(root/'patch-manifest.json',{})
    safe_ids={c['id'] for c in report['candidates'] if c['classification']=='PLACEMENT AUSENTE'}
    plan=[p for p in previous.get('pages',[]) if selected_pages and p['page'] not in selected_pages and set(p['candidateIds'])<=safe_ids]
    missing=[c for c in report['candidates'] if c['classification']=='PLACEMENT AUSENTE']
    if selected_pages:missing=[c for c in missing if c['page'] in selected_pages]
    with fitz.open(pdf) as source,fitz.open(pdf) as masks:
        for n in sorted({c['page'] for c in missing}):
            targets=[c for c in missing if c['page']==n];canonical=ROOT/f'apps/web/public/pages/page_{n:03d}'
            dest=root/f'pages/page_{n:03d}';dest.mkdir(parents=True,exist_ok=True)
            dom=load(canonical/f'page_{n:03d}_dom.json');original=load(canonical/'inline_elements.json',{'schemaVersion':1,'elements':[]});sidecar=copy.deepcopy(original)
            dump(dest/'inline_elements.before.json',original);page=source[n-1];mask_page=masks[n-1];ds=page.get_drawings();paint_bounds=page.get_bboxlog()
            pending=[]
            for c in targets:
                box=fitz.Rect(c['bbox']);anchor=copy.deepcopy(c['anchor']);covered=None;paths=[]
                if anchor['side']=='replace-text':
                    b=dom['blocks'][anchor['blockIndex']];line=next(l for l in b['lines'] if l['id']==anchor['lineId']);span=line['spans'][anchor['spanIndex']]
                    paths=source_paths(page,c['drawingIndices'],box)+letter_paths(page,span['text'],source_origin(page,span),box,glyph_cache)
                    covered=dict(lineId=anchor['lineId'],spanIndex=anchor['spanIndex'],text=span['text']);anchor['side']='before';anchor.pop('textRange')
                elif c['kind']=='vector':paths=source_paths(page,c['drawingIndices'],box)
                suffix='.svg' if paths else '.png';name=f'audit-source-{c["id"]}{suffix}'
                if paths:write_svg(dest/name,box,paths)
                elif c['symbolId']=='token.blue-totem':shutil.copyfile(canonical/'fidelity-overlay-component-inline-blue-totem-token.png',dest/name)
                else:raise ValueError(f'No safe asset recipe for {c["id"]}')
                baseline=baseline_for(page,dom,anchor);size=anchor['sizePt']
                # Complete topology and paint, normalized to the measured box.
                # Coordinates differ below 0.001 of the ink box only due to
                # source PDF rounding. Metrics still compare in point space.
                metrics=dict(widthEm=box.width/size,heightEm=box.height/size,advanceEm=box.width/size,
                    verticalAlignEm=(box.y1-baseline)/size,sourceAssetUrl=f'/pages/page_{n:03d}/{name}',sourceAppearanceKey=appearance_key(page,ds,c,box,covered,dom),renderVariant='audit-source-'+sha(dest/name)[:12])
                maskbox=box+(-.75,-.75,.75,.75);maskbox=fitz.Rect(math.floor(maskbox.x0*4)/4,math.floor(maskbox.y0*4)/4,math.ceil(maskbox.x1*4)/4,math.ceil(maskbox.y1*4)/4)
                maskname=f'audit-mask-{c["id"]}.png';element=dict(symbolId=c['symbolId'],sourceRendering='semantic-inline',bbox=list(box),anchor=anchor,metrics=metrics,
                    drawingIndices=c.get('drawingIndices',[]),mask=dict(url=f'/pages/page_{n:03d}/{maskname}',bbox=list(maskbox)),
                    provenance=dict(auditId='full-symbol-integrity-2026-10-13',candidateId=c['id'],sourcePdfSha256=report['sourcePdfSha256'],
                        sourceObjects=c.get('drawingIndices') or {'xref':c.get('xref'),'digest':c.get('imageDigest')},assetSha256=sha(dest/name),baselinePt=baseline))
                if covered:element['coveredSourceText']=covered
                if c['kind']=='image':element['coveredSourceTexts'],element['sourceTextCompanions']=image_text_contract(page,c,dom)
                sidecar['elements'].append(element);pending.append((c,element,maskbox,maskname))
            # The working copy loses text only; then exact confirmed shapes are
            # removed if fully covered. Neighboring large backgrounds stay.
            mask_page.add_redact_annot(mask_page.rect,fill=None);mask_page.apply_redactions(images=0,graphics=0,text=0)
            for c,e,box,name in pending:
                if c['kind']=='image':
                    uses=[i for i in mask_page.get_image_info(xrefs=True) if i['xref']==c['xref']]
                    if len(uses)!=1:raise ValueError('A shared image needs an occurrence-local removal recipe')
                    # Replacing the RGB image alone retains its source soft
                    # mask in this PDF, leaving a black circle. An empty Form
                    # XObject removes this unique paint call and its soft mask.
                    masks.update_object(c['xref'],'<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << >> >>')
                    masks.update_stream(c['xref'],b'')
                if c.get('drawingIndices'):
                    removal=fitz.Rect(c['bbox'])
                    for i in c['drawingIndices']:
                        seq=ds[i]['seqno'];removal |= fitz.Rect(paint_bounds[seq][1])
                        if ds[i]['type']=='fs' and seq+1<len(paint_bounds) and paint_bounds[seq+1][0]=='stroke-path':removal|=fitz.Rect(paint_bounds[seq+1][1])
                    mask_page.add_redact_annot(removal+(-.2,-.2,.2,.2),fill=None);mask_page.apply_redactions(images=0,graphics=1,text=1)
            pix=mask_page.get_pixmap(matrix=fitz.Matrix(4,4),alpha=False);clean=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
            for c,e,box,name in pending:
                clean.crop(tuple(round(v*4) for v in box)).save(dest/name)
                e['provenance']['maskSha256']=sha(dest/name)
            dump(dest/'inline_elements.json',sidecar)
            plan.append(dict(page=n,originalSidecarSha256=sha(canonical/'inline_elements.json') if (canonical/'inline_elements.json').exists() else None,
                domSha256=sha(canonical/f'page_{n:03d}_dom.json'),preparedSidecarSha256=sha(dest/'inline_elements.json'),
                preparedPath=str(dest.relative_to(ROOT)),newPlacementCount=len(pending),candidateIds=[c['id'] for c,_,_,_ in pending],
                blockedCanonicalWrite='The user requires review before canonical sidecar overwrite; this generator has no apply mode.'))
            print(json.dumps({'preparedPage':n,'placements':len(pending)},ensure_ascii=False),flush=True)
    plan.sort(key=lambda p:p['page'])
    active_pages={p['page'] for p in plan}
    for old in previous.get('pages',[]):
        if old['page'] in active_pages:continue
        n=old['page'];canonical=ROOT/f'apps/web/public/pages/page_{n:03d}'
        # Invalidated proposals must not remain loadable by the isolated lab.
        dump(root/f'pages/page_{n:03d}/inline_elements.json',load(canonical/'inline_elements.json',{'schemaVersion':1,'elements':[]}))
    dump(root/'patch-manifest.json',dict(sourcePdfSha256=report['sourcePdfSha256'],mode='prepared-only; canonical data untouched',
        placementCount=sum(p['newPlacementCount'] for p in plan),pageCount=len(plan),pages=plan))
    return plan


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pdf',type=Path,default=DEFAULT_PDF);p.add_argument('--out',type=Path,default=ROOT/'output/proofs/full-symbol-integrity-2026-10-13');p.add_argument('--reconcile-only',action='store_true');p.add_argument('--metadata-only',action='store_true');p.add_argument('--pages',help='Prepare only these comma-separated pages while retaining other prepared patches');args=p.parse_args()
    if args.metadata_only:
        hydrate_metadata(args.out,args.pdf,load(args.out/'audit.json'));return
    report=reconcile(args.out,args.pdf);print(json.dumps({'reconciledStates':report['classificationCounts']},ensure_ascii=False),flush=True)
    if not args.reconcile_only:
        plan=prepare(args.out,args.pdf,report,{int(x) for x in args.pages.split(',')} if args.pages else None);print(json.dumps({'preparedPages':len(plan),'preparedPlacements':sum(x['newPlacementCount'] for x in plan)}),flush=True)


if __name__=='__main__':main()
