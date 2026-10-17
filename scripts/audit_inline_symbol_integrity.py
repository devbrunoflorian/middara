"""Resumable, read-only source-object reconciliation for all Rulebook pages.

The source PDF, production sidecars and translations are never written. All
drawings/images/text runs are counted, including objects outside candidate
limits. Geometry discovers candidates; shape identity plus a demonstrated
text slot is required before proposing an inline placement.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import html
import json
import math
from pathlib import Path
import re

import pymupdf as fitz
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = ROOT.parent / 'Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf'
SPECIAL = ('wingdings', 'webdings', 'zapfdingbats', 'symbol')
STATES = ('RECONCILIADO', 'PLACEMENT AUSENTE', 'PROPRIETÁRIO INCORRETO', 'MÁSCARA INCORRETA',
          'DUPLICAÇÃO', 'POSIÇÃO INCORRETA', 'FONTE/GLIFO NÃO MAPEADO', 'INDEPENDENTE', 'INDETERMINADO')


def load(path, fallback=None):
    return json.loads(path.read_text(encoding='utf8')) if path.exists() else fallback


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def records(value, key):
    return value if isinstance(value, list) else (value or {}).get(key, [])


def bbox_union(drawings, indices):
    r = fitz.Rect(drawings[indices[0]]['rect'])
    for i in indices[1:]:
        r |= drawings[i]['rect']
    return r


def normalized_shape(drawings, indices, bbox):
    r = fitz.Rect(bbox)
    if r.width <= 0 or r.height <= 0:
        return None
    structure, values = [], []
    for i in sorted(indices):
        d = drawings[i]
        structure.append((d['type'], tuple(x[0] for x in d['items'])))
        for paint in ['fill', 'color']:
            v = d.get(paint)
            structure.append((paint, v is not None))
            if v is not None:
                values.extend(v)
        for item in d['items']:
            for p in item[1:]:
                if isinstance(p, fitz.Point):
                    values += [(p.x-r.x0)/r.width, (p.y-r.y0)/r.height]
                elif isinstance(p, fitz.Rect):
                    values += [(p.x0-r.x0)/r.width, (p.y0-r.y0)/r.height,
                               (p.x1-r.x0)/r.width, (p.y1-r.y0)/r.height]
                elif isinstance(p, fitz.Quad):
                    for q in [p.ul, p.ur, p.lr, p.ll]:
                        values += [(q.x-r.x0)/r.width, (q.y-r.y0)/r.height]
                else:
                    values.append(float(p))
    return (str(structure), values)


def fingerprint(shape):
    return hashlib.sha256(json.dumps([shape[0], [round(v, 2) for v in shape[1]]]).encode()).hexdigest()[:16] if shape else 'degenerate'


def match_shape(shape, prototypes):
    if not shape:
        return []
    return [p for p in prototypes.get(shape[0], []) if len(p['values']) == len(shape[1])
            and max((abs(a-b) for a, b in zip(shape[1], p['values'])), default=0) < .006]


def compact_components(drawings):
    """Group touching, nearby paint operations; retain excluded paths separately.

    Spatial unions are capped for candidate triage only. Every drawing still
    has an entry in objects.json; oversized/degenerate drawings are counted.
    """
    components = [];active=[]
    for i, d in enumerate(drawings):
        r = d['rect']
        if r.width > 160 or r.height > 64 or (r.width <= 0 and r.height <= 0):
            continue
        neighbors = []
        active=[c for c in active if abs(d['seqno']-c['lastSeq'])<=24]
        for c in active:
            union = c['rect'] | r
            if union.width <= 160 and union.height <= 64 and (c['rect']+(-.2,-.2,.2,.2)).intersects(r+(-.01,-.01,.01,.01)):
                neighbors.append(c)
        if neighbors:
            c = neighbors[0]
            c['rect'] |= r
            c['indices'].append(i)
            c['lastSeq'] = d['seqno']
            for other in neighbors[1:]:
                if (c['rect'] | other['rect']).width <= 160 and (c['rect'] | other['rect']).height <= 64:
                    c['rect'] |= other['rect']; c['indices'] += other['indices']; components.remove(other);active.remove(other)
        else:
            c={'rect': fitz.Rect(r), 'indices': [i], 'lastSeq': d['seqno']};components.append(c);active.append(c)
    return components


def source_lines(page):
    return [l for b in page.get_text('dict', flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)['blocks']
            for l in b.get('lines', []) if l.get('spans')]


def distance(a, b):
    a, b = fitz.Rect(a), fitz.Rect(b)
    return math.hypot(max(a.x0-b.x1, b.x0-a.x1, 0), max(a.y0-b.y1, b.y0-a.y1, 0))


def cells(r):
    r=fitz.Rect(r)
    return [(x,y) for x in range(math.floor(r.x0/32),math.floor(r.x1/32)+1)
            for y in range(math.floor(r.y0/32),math.floor(r.y1/32)+1)]


def index_rows(rows):
    grid=defaultdict(list)
    for i,row in enumerate(rows):
        for cell in cells(row['bbox']):grid[cell].append(i)
    return rows,grid


def query_rows(index,r,pad=40):
    rows,grid=index;ids=set()
    for cell in cells(r+(-pad,-pad,pad,pad)):ids.update(grid.get(cell,[]))
    return [rows[i] for i in sorted(ids)]


def neighbors_for(r, dom):
    found = []
    if '_neighborIndex' not in dom:
        rows=[]
        for bi,b in enumerate(dom.get('blocks',[])):
            for li,line in enumerate(b.get('lines',[])):
                for si,span in enumerate(line.get('spans',[])):
                    rows.append(dict(blockId=b['id'],blockIndex=bi,lineId=line['id'],spanIndex=si,
                        text=span['text'],font=span.get('font'),sizePt=span.get('size',10),origin=span.get('origin'),bbox=span['bbox'],
                        editable=not (b.get('artworkOnly') or b.get('hiddenFromPage') or b.get('adminReadOnly')
                                      or line.get('rasterizedDuplicate') or li in b.get('staticEditorLineIndexes',[]))))
        dom['_neighborIndex']=index_rows(rows)
    for row in query_rows(dom['_neighborIndex'],r):
        box=fitz.Rect(row['bbox']);size=row['sizePt'];dist=distance(r,box)
        if dist>max(5,size*2) or abs((r.y0+r.y1-box.y0-box.y1)/2)>max(r.height,size)*.9:continue
        found.append({**row,'distancePt':round(dist,4)})
    return sorted(found, key=lambda s: (s['distancePt'], abs(s['bbox'][1]-r.y0)))[:16]


def inline_anchor(r, nearby, symbol_id=None):
    choices = []
    for s in nearby:
        if not s['editable'] or not s['text'].strip() or any(f in s.get('font','').lower() for f in SPECIAL):
            continue
        box=fitz.Rect(s['bbox']); size=s['sizePt']
        if r.height > size*2.5 or abs((r.y0+r.y1-box.y0-box.y1)/2) > size*.65:
            continue
        left, right = r.x0-box.x1, box.x0-r.x1
        if -.3 <= left <= 1.6:
            score=abs(left)
            if symbol_id and symbol_id.startswith('dice.') and symbol_id.split('.')[-1].upper() in s['text'].upper():
                score -= 2
            choices.append((score, s, 'after', max(0,left)))
        if -.3 <= right <= 1.6:
            choices.append((abs(right)+.15, s, 'before', max(0,right)))
    if not choices:
        return None
    _, s, side, gap = min(choices, key=lambda c:c[0])
    a=dict(blockId=s['blockId'],blockIndex=s['blockIndex'],lineId=s['lineId'],spanIndex=s['spanIndex'],
           side=side,sizePt=s['sizePt'],ownerSpanRef=dict(lineId=s['lineId'],spanIndex=s['spanIndex']))
    if side=='after':a['gapPt']=round(gap,6)
    return a


def marker_identity(r, nearby):
    letters=[s for s in nearby if s['editable'] and re.fullmatch('[A-D]',s['text'])
             and (r+(-.5,-.5,.5,.5)).contains(fitz.Rect(s['bbox']))]
    if len(letters)!=1:return None
    s=letters[0]
    before=[n for n in nearby if n['lineId']==s['lineId'] and n['spanIndex']==s['spanIndex']-1]
    after=[n for n in nearby if n['lineId']==s['lineId'] and n['spanIndex']==s['spanIndex']+1]
    if not before or not after or not before[0]['text'].rstrip().endswith('(') or not after[0]['text'].lstrip().startswith(')'):
        return None
    return {'symbolId':f'marker.reference.{s["text"].lower()}',
            'evidence':'Source box encloses a single A–D glyph between parenthesized prose references.',
            'anchor':dict(blockId=s['blockId'],blockIndex=s['blockIndex'],lineId=s['lineId'],spanIndex=s['spanIndex'],
                          side='replace-text',textRange=[0,1],sizePt=s['sizePt'],
                          ownerSpanRef=dict(lineId=s['lineId'],spanIndex=s['spanIndex']))}


def prototypes_from_source(doc, registry, existing):
    out=defaultdict(list)
    for p,elements in existing.items():
        ds=doc[p-1].get_drawings()
        for e in elements:
            ids=e.get('drawingIndices',[])
            if not ids or max(ids)>=len(ds):continue
            shape=normalized_shape(ds,ids,e['bbox'])
            if shape:out[shape[0]].append(dict(symbolId=e['symbolId'],values=shape[1],page=p,
                bbox=e['bbox'],drawingIndices=ids,renderVariant=(e.get('metrics') or {}).get('renderVariant')))
    for entry in registry:
        if entry.get('legacy'):continue
        p=entry['source']['page'];r=fitz.Rect(entry['source']['bboxPt']);ds=doc[p-1].get_drawings()
        ids=[i for i,d in enumerate(ds) if (r+(-.04,-.04,.04,.04)).contains(d['rect'])
             and (d['rect'].width>0 or d['rect'].height>0)]
        shape=normalized_shape(ds,ids,r) if ids else None
        if shape:out[shape[0]].append(dict(symbolId=entry['id'],values=shape[1],page=p,bbox=list(r),drawingIndices=ids))
    return out


def page_audit(page, dom, elements, compounds, overlays, registry, prototypes):
    drawings=page.get_drawings();lines=source_lines(page);line_index=index_rows(lines);images=page.get_image_info(hashes=True,xrefs=True)
    traces=page.get_texttrace(); candidates=[]; path_dest={}
    for component in compact_components(drawings):
        r=component['rect'];ids=sorted(component['indices'])
        context=[l for l in query_rows(line_index,r) if distance(r,l['bbox'])<=max(s['size'] for s in l['spans'])*1.5]
        nearby=neighbors_for(r,dom)
        matches=[e for e in elements if set(ids)&set(e.get('drawingIndices',[]))
                 or (distance(r,e['bbox'])==0 and abs(r.width-fitz.Rect(e['bbox']).width)<.25 and abs(r.height-fitz.Rect(e['bbox']).height)<.25)]
        cp=[e for e in compounds if fitz.Rect(e.get('bbox',[0,0,0,0])).contains(r)]
        overlay=[o for o in overlays if fitz.Rect(o['bbox']).contains(r)]
        shape=normalized_shape(drawings,ids,r);refs=match_shape(shape,prototypes)
        probable=sorted({p['symbolId'] for p in refs})
        marker=marker_identity(r,nearby)
        if marker:probable=[marker['symbolId']]
        if not context and not nearby and not matches and not refs:continue
        ident=probable[0] if len(probable)==1 else None
        anchor=marker['anchor'] if marker else inline_anchor(r,nearby,ident)
        status='INDETERMINADO'; evidence=[]
        if matches or cp:
            status='RECONCILIADO'; evidence.append('Source object matches existing placement; runtime/edit/export still have separate evidence states.')
        elif ident and anchor:
            status='PLACEMENT AUSENTE'; evidence.append('Complete source path/paint prototype plus an editable source text slot; not shape proximity alone.')
        elif overlay and any(o.get('category') in ('diagram','combatant-cards','item-cards','cards','page-ornament','decorative-page-chrome') for o in overlay) and not anchor:
            status='INDEPENDENTE';evidence.append('Contained in a documented diagram/card/ornamental source overlay without an editable inline slot.')
        if marker:evidence.append(marker['evidence'])
        priority='alta' if status=='PLACEMENT AUSENTE' or anchor or (overlay and any(o.get('category')=='component-icons' for o in overlay)) else 'média'
        component_id=str(ids[0]) if len(ids)==1 else f'{ids[0]}-{ids[-1]}-n{len(ids)}'
        row=dict(id=f'p{page.number+1:03d}-v{component_id}',page=page.number+1,kind='vector',bbox=list(r),drawingIndices=ids,
                 paintSequences=[drawings[i]['seqno'] for i in ids],shapeGroup=fingerprint(shape),classification=status,priority=priority,
                 probableSymbolIds=probable,symbolId=ident,anchor=anchor,nearby=nearby,
                 sourceContext=[''.join(s['text'] for s in l['spans']) for l in context[:5]],
                 existingPlacements=matches,compoundMatches=cp,overlayMatches=overlay,
                 prototypeEvidence=[{k:v for k,v in p.items() if k!='values'} for p in refs[:3]],evidence=evidence)
        candidates.append(row)
        for i in ids:path_dest[i]=row['id']
    legacy={}
    for e in registry:
        for char in (e.get('legacy') or {}).get('characters',[]):
            legacy[(e['legacy']['font'].lower(),char)]=e['id']
    seen=set()
    for ti,t in enumerate(traces):
        if not any(s in t['font'].lower() for s in SPECIAL):continue
        for char in t['chars']:
            text=chr(char[0]) if 0<=char[0]<=0x10ffff else '\ufffd'
            key=(t['font'],char[0],tuple(round(x,3) for x in char[2]))
            if key in seen or not text.strip():continue
            seen.add(key);r=fitz.Rect(char[3]);ident=legacy.get((t['font'].lower(),text))
            nearby=neighbors_for(r,dom)
            matches=[e for e in elements+compounds if ident==e.get('symbolId') and distance(r,e['bbox'])<.2]
            status='RECONCILIADO' if ident and matches else 'FONTE/GLIFO NÃO MAPEADO'
            if ident and not matches:status='INDETERMINADO'
            candidates.append(dict(id=f'p{page.number+1:03d}-g{ti}-{char[1]}-{len(seen)}',page=page.number+1,kind='font-glyph',bbox=list(r),
                font=t['font'],codepoint=f'U+{char[0]:04X}',glyphId=char[1],text=text,origin=list(char[2]),sourceTrace=ti,
                classification=status,priority='alta' if not ident else 'média',symbolId=ident,probableSymbolIds=[ident] if ident else [],
                shapeGroup=f'{t["font"]}:{char[1]}',nearby=nearby,existingPlacements=matches,evidence=['Actual source texttrace glyph, including font/glyph ID and baseline.']))
    for ii,image in enumerate(images):
        r=fitz.Rect(image['bbox']);nearby=neighbors_for(r,dom)
        if r.width>100 or r.height>100 or not nearby:continue
        overlay=[o for o in overlays if distance(r,o['bbox'])==0 and abs(fitz.Rect(o['bbox']).width-r.width)<2]
        source_id=None
        for e in registry:
            if e['source']['page']==page.number+1 and e['source'].get('assetSizePx',[0,0])!=[0,0] and distance(r,e['source']['bboxPt'])<1:source_id=e['id']
        candidates.append(dict(id=f'p{page.number+1:03d}-i{ii}',page=page.number+1,kind='image',bbox=list(r),xref=image['xref'],
            imageDigest=image['digest'].hex(),pixelSize=[image['width'],image['height']],nearby=nearby,overlayMatches=overlay,
            classification='INDETERMINADO',priority='alta' if r.height<30 else 'média',symbolId=source_id,
            probableSymbolIds=[source_id] if source_id else [],shapeGroup=image['digest'].hex(),evidence=['Source image placement; raster artwork requires contextual verification.']))
    objects=dict(page=page.number+1,sourcePageBoxes=dict(media=list(page.mediabox),crop=list(page.cropbox)),
        drawings=[dict(index=i,id=f'pdf:p{page.number+1}:drawing:{i}',bbox=list(d['rect']),type=d['type'],seqno=d['seqno'],
            pathItemCount=len(d['items']),fill=d.get('fill'),stroke=d.get('color'),candidateId=path_dest.get(i),
            triage='candidate' if i in path_dest else 'retained-outside-primary-inline-triage') for i,d in enumerate(drawings)],
        images=[{k:(v.hex() if isinstance(v,bytes) else list(v) if isinstance(v,tuple) else v) for k,v in image.items()} for image in images],
        textRuns=[dict(font=t['font'],size=t['size'],seqno=t['seqno'],type=t['type'],bbox=list(t['bbox']),
            glyphs=[dict(unicode=c[0],glyphId=c[1],origin=list(c[2]),bbox=list(c[3])) for c in t['chars']]) for t in traces])
    return candidates,objects


def render_diagnostic(page, hidden_page, dest, candidates, elements):
    dest.mkdir(parents=True,exist_ok=True)
    scale=2
    pix=page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False)
    source=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
    source.save(dest/'source.webp','WEBP',quality=88)
    before=dict(textRuns=len(hidden_page.get_texttrace()),drawings=len(hidden_page.get_drawings()),images=len(hidden_page.get_image_info()))
    hidden_page.add_redact_annot(hidden_page.rect,fill=None)
    hidden_page.apply_redactions(images=0,graphics=0,text=0)
    after=dict(textRuns=len(hidden_page.get_texttrace()),drawings=len(hidden_page.get_drawings()),images=len(hidden_page.get_image_info()))
    pix=hidden_page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False)
    Image.frombytes('RGB',(pix.width,pix.height),pix.samples).save(dest/'text-hidden.webp','WEBP',quality=88)
    crops=dest/'crops';crops.mkdir(exist_ok=True)
    for c in candidates:
        r=fitz.Rect(c['bbox']); margin_x=max(28,min(85,r.width*1.7)); margin_y=max(12,min(24,r.height))
        area=(r+(-margin_x,-margin_y,margin_x,margin_y))&page.rect
        crop=source.crop(tuple(round(v*scale) for v in area)) if not area.is_empty else Image.new('RGB',(420,100),'white')
        crop.thumbnail((420,140))
        canvas=Image.new('RGB',(420,164),'#f5f5f5');canvas.paste(crop,((420-crop.width)//2,0))
        draw=ImageDraw.Draw(canvas);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',12)
        draw.text((5,143),f"{c['id']} · {c.get('symbolId') or c['kind']}",fill='#111',font=font)
        name=c['id']+'.webp';canvas.save(crops/name,'WEBP',quality=90)
        c['crop']=f'pages/p{page.number+1:03d}/crops/{name}'
    return {'method':'PyMuPDF text-only redaction in an in-memory copy, images=0 graphics=0 text=0; official file unchanged.',
            'before':before,'after':after,'limitation':'This removes source text operators, including symbol-font glyphs. Vector lettering and image lettering remain visible. It is not a claim that all writing or all semantic symbols survived.'}


def aggregate(out,pdf):
    pages=[];candidates=[];total=Counter();states=Counter();groups=defaultdict(list)
    for path in sorted((out/'pages').glob('p*/audit.json')):
        row=load(path);pages.append(row['page']);candidates+=row['candidates']
        total.update(row['objectCounts']);states.update(c['classification'] for c in row['candidates'])
        for c in row['candidates']:groups[c['shapeGroup']].append(c['id'])
    report=dict(schemaVersion=1,sourcePdf=str(pdf),sourcePdfSha256=sha(pdf),pagesAudited=pages,pageCount=len(pages),
        objectCounts=dict(total),candidateCount=len(candidates),classificationCounts=dict(states),
        groups=[dict(id=k,occurrences=v) for k,v in groups.items()],candidates=candidates,
        limitations=['All source drawings/text runs/images are inventoried. The primary candidate set uses declared size/context triage; rejected objects remain in per-page objects.json.',
        'Shape matches alone never certify meaning. Absent placement proposals require a complete path+paint match and an editable text slot or a separately demonstrated contextual composition.',
        'RECONCILIADO identifies structural correspondence, with editing and export evidence tracked separately; it is not blanket visual certification.'])
    report['ownershipFindings']=[f for c in candidates for f in c.get('ownershipFindings',[])]
    report['secondaryDefectCounts']=dict(Counter(d for c in candidates for d in c.get('confirmedDefects',[])))
    report['candidateCountBeforeCompoundMerges']=len(candidates)+sum(len(c.get('mergedSourceCandidates',[])) for c in candidates)
    dump(out/'audit.json',report)
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pdf',type=Path,default=DEFAULT_PDF)
    p.add_argument('--out',type=Path,default=ROOT/'output/proofs/full-symbol-integrity-2026-10-13')
    p.add_argument('--start',type=int,default=1);p.add_argument('--end',type=int,default=102)
    p.add_argument('--resume',action='store_true');p.add_argument('--no-render',action='store_true')
    args=p.parse_args();existing={}
    registry=load(ROOT/'apps/web/src/symbols/sourceSymbols.json',[])
    # token.blue-totem is an existing registry entry in semanticSymbols.ts.
    registry.append(dict(id='token.blue-totem',source=dict(page=83,bboxPt=[198.953,149.792,219.636,170.475],assetSizePx=[84,83])))
    for n in range(1,103):existing[n]=records(load(ROOT/f'apps/web/public/pages/page_{n:03d}/inline_elements.json',{}),'elements')
    with fitz.open(args.pdf) as doc,fitz.open(args.pdf) as hidden:
        prototypes=prototypes_from_source(doc,registry,existing)
        for n in range(args.start,args.end+1):
            dest=args.out/f'pages/p{n:03d}';audit_path=dest/'audit.json'
            if args.resume and audit_path.exists():
                cached=load(audit_path)
                if not cached.get('pageRectPt'):
                    cached['pageRectPt']=list(doc[n-1].rect)
                    dump(audit_path,cached)
                if not args.no_render and not cached.get('diagnostic'):
                    cached['diagnostic']=render_diagnostic(doc[n-1],hidden[n-1],dest,cached['candidates'],existing[n])
                    dump(audit_path,cached)
                    print(json.dumps({'renderedPage':n,'candidates':len(cached['candidates'])}),flush=True)
                continue
            page=doc[n-1];page_dir=ROOT/f'apps/web/public/pages/page_{n:03d}'
            dom=load(page_dir/f'page_{n:03d}_dom.json',{'blocks':[]})
            compounds=records(load(page_dir/'compound_elements.json',{}),'elements')
            overlays=records(load(page_dir/'fidelity_overlays.json',{}),'overlays')
            candidates,objects=page_audit(page,dom,existing[n],compounds,overlays,registry,prototypes)
            dump(dest/'objects.json',objects)
            diagnostic=render_diagnostic(page,hidden[n-1],dest,candidates,existing[n]) if not args.no_render else None
            dump(audit_path,dict(page=n,pageRectPt=list(page.rect),domSha256=sha(page_dir/f'page_{n:03d}_dom.json') if dom['blocks'] else None,
                objectCounts=dict(drawings=len(objects['drawings']),images=len(objects['images']),textRuns=len(objects['textRuns']),
                    glyphs=sum(len(t['glyphs']) for t in objects['textRuns'])),candidates=candidates,diagnostic=diagnostic))
            print(json.dumps(dict(page=n,candidates=len(candidates),states=dict(Counter(c['classification'] for c in candidates))),ensure_ascii=False),flush=True)
    result=aggregate(args.out,args.pdf)
    print(json.dumps({k:result[k] for k in ['pageCount','objectCounts','candidateCount','classificationCounts']},ensure_ascii=False))


if __name__=='__main__':main()
