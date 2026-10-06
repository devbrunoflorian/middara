"""Build source-confirmed inline SVGs and explicit page anchors (dry run default).

Reads the global audit; never changes original DOMs, keys, translations or PDF.
Page placements need a text gap/prefix proof and are listed for review. Tiny
images, furniture and full cards are deliberately not inferred as symbols.
"""
from __future__ import annotations
import argparse
import json
import math
import re
import xml.etree.ElementTree as ET
from collections import defaultdict,Counter
from xml.sax.saxutils import quoteattr
from pathlib import Path
import pymupdf as fitz
from PIL import Image
from build_inline_compound_symbols import compound_definitions

ROOT=Path(__file__).resolve().parents[1]
PDF=Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
AUDIT=ROOT/'docs/project-progress/evidence/2026-10-04-inline-elements/inventory.json'
CONTEXTS=['paragraph','typographic-field','span-unit','credit-field']
NS={'s':'http://www.w3.org/2000/svg'}
SOURCE_DRAWINGS={}

def source_drawings(page):
    if page.number not in SOURCE_DRAWINGS:SOURCE_DRAWINGS[page.number]=page.get_drawings()
    return SOURCE_DRAWINGS[page.number]

def color(value):
    return '#'+''.join(f'{round(v*255):02x}' for v in value) if value else 'none'

def native_paint_colors(page,rect,paths):
    """Resolve flat paint through the PDF renderer, preserving its color space.

    get_drawings() RGB can differ from the ICC/CMYK-managed raster. A native
    SVG ownership map identifies interior pixels for each fill/stroke; the
    modal PDF color comes from that exact shape, not a nearby guessed sample.
    """
    box=rect+(-2,-2,2,2)
    box=fitz.Rect(math.floor(box.x0*4)/4,math.floor(box.y0*4)/4,math.ceil(box.x1*4)/4,math.ceil(box.y1*4)/4)
    pix=page.get_pixmap(matrix=fitz.Matrix(4,4),clip=box)
    native=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
    names={'strokeWidth':'stroke-width','fillRule':'fill-rule','strokeLinecap':'stroke-linecap','strokeLinejoin':'stroke-linejoin'}
    attrs=[];labels={}
    for i,path in enumerate(paths):
        p={**path}
        p['transform']=f'translate({rect.x0-box.x0} {rect.y0-box.y0}) '+p.get('transform','')
        for paint in ['fill','stroke']:
            if p.get(paint,'none')=='none':continue
            label=(40+(i*2+(paint=='stroke'))*5,100,180)
            labels[label]=(i,paint);p[paint]='#'+''.join(f'{n:02x}' for n in label)
        attrs.append('<path '+' '.join(f'{names.get(k,k)}={quoteattr(str(v))}' for k,v in p.items())+'/>')
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{pix.width}" height="{pix.height}" viewBox="0 0 {box.width} {box.height}">'+''.join(attrs)+'</svg>'
    ownership_doc=fitz.open('svg',svg.encode());ownership_pix=ownership_doc[0].get_pixmap(alpha=True)
    ownership=Image.frombytes('RGBA',(ownership_pix.width,ownership_pix.height),ownership_pix.samples)
    counters={key:Counter() for key in labels}
    for rgba,rgb in zip(ownership.get_flattened_data(),native.get_flattened_data()):
        if rgba[3]==255 and rgba[:3] in counters:counters[rgba[:3]][rgb]+=1
    for label,(i,paint) in labels.items():
        candidates=counters[label]
        if not candidates:continue # wholly covered or subpixel paint, no proof
        rgb,count=candidates.most_common(1)[0]
        if count/sum(candidates.values())<.25:raise ValueError(f'Non-flat/ambiguous source paint p{page.number+1} {i}:{paint}')
        paths[i][paint]='#'+''.join(f'{n:02x}' for n in rgb)
    ownership_doc.close()
    return paths

def vector_path(drawing):
    parts=[];last=None
    for item in drawing['items']:
        op=item[0]
        if op in ('l','c'):
            start=item[1]
            if last!=start:parts.append(f'M {start.x} {start.y}')
            if op=='l':parts.append(f'L {item[2].x} {item[2].y}');last=item[2]
            else:parts.append('C '+' '.join(f'{p.x} {p.y}' for p in item[2:]));last=item[-1]
        elif op=='re':
            r=item[1];parts.append(f'M {r.x0} {r.y0} H {r.x1} V {r.y1} H {r.x0} Z');last=None
        elif op=='qu':
            q=item[1];parts.append('M '+f'{q.ul.x} {q.ul.y} L {q.ur.x} {q.ur.y} L {q.lr.x} {q.lr.y} L {q.ll.x} {q.ll.y} Z');last=None
        else:raise ValueError(f'Unsupported PDF path operation {op}')
    if drawing.get('closePath'):parts.append('Z')
    return ' '.join(parts)

def complete_component(page, occurrence):
    """Include enclosed paint operations of an explicitly reviewed symbol.

    Candidate fingerprints can describe only a background circle or one edge.
    A semantic match must include the enclosed foreground, not just that body.
    This helper proposes components; full geometry is compared below.
    """
    drawings=source_drawings(page);indices=list(occurrence['drawingIndices']);rect=fitz.Rect(occurrence['bbox'])
    seq=max(drawings[i]['seqno'] for i in indices)
    for i,drawing in enumerate(drawings):
        if i in indices or not seq<drawing['seqno']<=seq+8:continue
        if (rect+(-.02,-.02,.02,.02)).contains(drawing['rect']):indices.append(i)
    return {**occurrence,'drawingIndices':sorted(indices)}

def same_component(page, occurrence, prototype_page, prototype):
    """Compare all normalized paths and paint, including enclosed glyphs."""
    rect=fitz.Rect(occurrence['bbox']);ref=fitz.Rect(prototype['bbox'])
    ds=source_drawings(page);ps=source_drawings(prototype_page)
    if len(occurrence['drawingIndices'])!=len(prototype['drawingIndices']):return False
    for i,j in zip(occurrence['drawingIndices'],prototype['drawingIndices']):
        a,b=ds[i],ps[j]
        if a['type']!=b['type'] or len(a['items'])!=len(b['items']):return False
        for name in ['fill','color']:
            if (a.get(name) is None)!=(b.get(name) is None):return False
            if a.get(name) and any(abs(x-y)>.012 for x,y in zip(a[name],b[name])):return False
        for ai,bi in zip(a['items'],b['items']):
            if ai[0]!=bi[0]:return False
            # The source recipes use lines/curves/rectangles/quads only.
            def coords(item,r):
                values=[]
                for v in item[1:]:
                    if isinstance(v,fitz.Point):values.extend([(v.x-r.x0)/r.width,(v.y-r.y0)/r.height])
                    elif isinstance(v,fitz.Rect):values.extend([(v.x0-r.x0)/r.width,(v.y0-r.y0)/r.height,(v.x1-r.x0)/r.width,(v.y1-r.y0)/r.height])
                    elif isinstance(v,fitz.Quad):
                        for p in [v.ul,v.ur,v.lr,v.ll]:values.extend([(p.x-r.x0)/r.width,(p.y-r.y0)/r.height])
                    else:values.append(v)
                return values
            if any(abs(x-y)>.003 for x,y in zip(coords(ai,rect),coords(bi,ref))):return False
    return True

def definition(id,en,pt,page,bbox,render,category='Regras e combate',legacy=None):
    return dict(id=id,category=category,labels={'en':en,'pt-BR':pt},description={'en':en+' — source PDF symbol.','pt-BR':pt+' — símbolo do PDF original.'},
        searchTerms={'en':en.lower().split(),'pt-BR':pt.lower().split()},editorTokens={'en':f'⟦{en}⟧','pt-BR':f'⟦{pt}⟧'},
        allowedBlockTypes=CONTEXTS,source=dict(pdf=PDF.name,page=page,bboxPt=bbox,assetSizePx=[0,0]),render=render,**({'legacy':legacy} if legacy else {}))

def glyph_definition(doc,spec):
    id,en,pt,font,text,page_no=spec;page=doc[page_no-1]
    traces=[t for t in page.get_texttrace() if font in t['font'] and any(c[0]==ord(text) for c in t['chars'])]
    if not traces:raise ValueError(f'No source glyph for {id}')
    trace=traces[-1];ch=next(c for c in trace['chars'] if c[0]==ord(text));origin=ch[2]
    svg=ET.fromstring(page.get_svg_image(text_as_path=True));defs={n.attrib.get('id'):n for n in svg.findall('.//s:defs/*',NS)}
    found=[]
    for use in svg.findall('.//s:use',NS):
        href=use.attrib.get('{http://www.w3.org/1999/xlink}href','').lstrip('#')
        matrix=re.fullmatch(r'matrix\(([^)]+)\)',use.attrib.get('transform',''))
        if href not in defs or not matrix:continue
        m=[float(v) for v in re.split('[ ,]+',matrix[1])]
        if abs(m[4]-origin[0])<.02 and abs(m[5]-origin[1])<.02:found.append((use,defs[href],m))
    if not found:raise ValueError(f'No source SVG use at glyph origin {id}')
    use,path,m=found[-1];size=trace['size']
    # Use the font ascender/descender, not guessed Unicode fallback metrics.
    x0,y0,x1,y1=ch[3];width=max(.1,x1-x0);height=max(.1,y1-y0)
    d=path.attrib['d'];paths=[dict(d=d,transform=f'matrix({m[0]} {m[1]} {m[2]} {m[3]} {m[4]-x0} {m[5]-y0})',fill='currentColor')]
    if id=='tag.important.icon':
        # PDF paints the white outline first and red fill above it.
        paths=[{**paths[0], 'fill':'none','stroke':'#ffffff','strokeWidth':2/size},
               {**paths[0],'fill':'#b91d23'}]
        paths=native_paint_colors(page,fitz.Rect([x0,y0,x1,y1]),paths)
    render=dict(viewBox=[0,0,width,height],paths=paths,widthEm=width/size,heightEm=height/size,verticalAlignEm=(y1-origin[1])/size)
    entry=definition(id,en,pt,page_no,[x0,y0,x1,y1],render,'Tags e glifos',dict(font=font,characters=[text]))
    if id=='marker.checkbox':entry['allowedBlockTypes']=[];entry['description']['pt-BR']='Quadrado fixo de checklist; fora da inserção em prosa.'
    return entry

def anchor_for(dom,rect):
    choices=[]
    for bi,b in enumerate(dom['blocks']):
        if b.get('hiddenFromPage') or b.get('adminReadOnly'):continue
        for li,line in enumerate(b.get('lines',[])):
            if line.get('rasterizedDuplicate') or li in b.get('staticEditorLineIndexes',[]):continue
            for si,s in enumerate(line['spans']):
                if not s['text'].strip() or any(f in s['font'] for f in ('Wingdings','Webdings','Zapf')):continue
                box=fitz.Rect(s['bbox']);size=s['size']
                if rect.height>size*1.6 or abs((rect.y0+rect.y1)/2-(box.y0+box.y1)/2)>size*.5:continue
                left=abs(rect.x0-box.x1);right=abs(rect.x1-box.x0)
                if left<=1.1 and rect.x1>box.x1+.5:choices.append((left,bi,line['id'],si,'after',size))
                if right<=1.1 and rect.x0<box.x0-.5:choices.append((right,bi,line['id'],si,'before',size))
                # A leading blank span provides the deliberate icon slot.
                if si and not line['spans'][si-1]['text'].strip() and rect.x0>=line['spans'][si-1]['bbox'][0]-size*1.4 and right<=size*.6:
                    choices.append((right+.1,bi,line['id'],si,'before',size))
    if not choices:return None
    _,bi,line,si,side,size=min(choices)
    return dict(blockId=dom['blocks'][bi]['id'],blockIndex=bi,lineId=line,spanIndex=si,side=side,sizePt=size)

def source_baseline(page, dom, anchor, cache):
    """Match original font/baseline; DOMs may merge spans, so compare Y bounds."""
    block=dom['blocks'][anchor['blockIndex']]
    span=next(l for l in block['lines'] if l['id']==anchor['lineId'])['spans'][anchor['spanIndex']]
    if page.number not in cache:
        cache[page.number]=[s for b in page.get_text('dict',flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)['blocks'] for l in b.get('lines',[]) for s in l['spans']]
    matches=[s for s in cache[page.number]
        if s['font']==span['font'] and abs(s['size']-span['size'])<.02
        and abs(s['bbox'][1]-span['bbox'][1])<.03 and abs(s['bbox'][3]-span['bbox'][3])<.03
        and s['bbox'][0]>=span['bbox'][0]-.05 and s['bbox'][0]<=span['bbox'][2]+.05]
    if not matches:raise ValueError(f"No proven baseline p{page.number+1} {anchor['lineId']}:{anchor['spanIndex']}")
    return matches[0]['origin'][1]

def build(apply, only_pages=None,registry_only=False):
    audit=json.loads(AUDIT.read_text(encoding='utf8'));doc=fitz.open(PDF)
    # Indices address the source-reviewed atlas, not arbitrary new candidates.
    specs=[(23,'attack.melee','Melee attack','Ataque corpo a corpo'),(140,'dice.black','Black die','Dado preto'),
        (64,'dice.white','White die','Dado branco'),(198,'dice.teal','Teal die','Dado turquesa'),(261,'dice.green','Green die','Dado verde'),
        (223,'dice.blue','Blue die','Dado azul'),(158,'dice.purple','Purple die','Dado roxo'),(142,'dice.orange','Orange die','Dado laranja'),
        (221,'dice.red','Red die','Dado vermelho'),(138,'dice.grey','Grey die','Dado cinza'),(117,'combat.skull','Skull','Caveira'),
        (276,'combat.damage-star','Damage star','Estrela de dano'),(4,'combat.shield','Defense shield','Escudo de defesa'),
        (253,'weapon.hand','Hand requirement icon','Ícone de requisito de mão'),
        (237,'action.redirect','Redirect','Redirecionar')]
    entries=[];selected=[];baseline_cache={}
    for index,id,en,pt in specs:
        g=audit['inlineVectorCandidates'][index];occurrences=g['occurrences']
        occurrences=[complete_component(doc[o['page']-1],o) for o in occurrences]
        if id=='combat.shield':
            # Atlas omitted the lower-left white quarter of this shield.
            occurrences=[{**o,'drawingIndices':[159,160,161]} for o in occurrences]
        o=occurrences[0];selected.append((id,o,occurrences))
    selected.extend([
        ('attack.ranged',dict(page=22,drawingIndices=[98,99],bbox=[142.3177032470703,468.1383056640625,151.1356964111328,476.9822998046875]),[]),
        ('attack.melee-ranged',dict(page=43,drawingIndices=[153,154,155,156],bbox=[311.03167724609375,544.6389770507812,320.3006896972656,553.9069213867188]),[]),
        ('combat.shield.dark',dict(page=96,drawingIndices=[235,236],bbox=[414.5364990234375,206.969970703125,423.8869934082031,216.9736328125]),[]),
        ('story.pencil',dict(page=13,drawingIndices=[108],bbox=[91.977294921875,281.093017578125,103.8272933959961,289.00701904296875]),[]),
        ('story.flag',dict(page=13,drawingIndices=[109,110,111],bbox=[178.47230529785156,294.3783874511719,186.71031188964844,303.7703857421875]),[]),
    ])
    # Page 38: source-reviewed complete paths, including zero-width cube edges.
    # These are explicit recipes, not expansion to unreviewed similar candidates.
    def p38_component(indices):
        drawings=source_drawings(doc[37]);rect=fitz.Rect(drawings[indices[0]]['rect'])
        for index in indices[1:]:rect |= drawings[index]['rect']
        return dict(page=38,drawingIndices=indices,bbox=list(rect))
    additional={
        'dice.black':[p38_component(ids) for ids in [[159,160,161,162],[168,169,170,171],[176,177,178,179]]],
        'combat.skull':[p38_component(ids) for ids in [[166,167],[172,173]]],
    }
    selected=[(id,prototype,occurrences+additional.get(id,[])) for id,prototype,occurrences in selected]
    selected.extend([
        ('combat.shield.solid',p38_component([163,164,165]),[]),
        ('combat.page',p38_component([174,175]),[p38_component([180,181])]),
        ('terrain.red-border',dict(page=39,drawingIndices=[188],bbox=[220.102294921875,183.83380126953125,240.6772918701172,185.83380126953125]),[]),
    ])
    labels={id:(en,pt) for _,id,en,pt in specs};labels.update({'attack.ranged':('Ranged attack','Ataque à distância'),'attack.melee-ranged':('Melee or ranged attack','Ataque corpo a corpo ou à distância'),'combat.shield.dark':('Defense shield, dark','Escudo de defesa, escuro'),'story.pencil':('Story entry','Anotação de história'),'story.flag':('Story flag','Bandeira de história')})
    labels.update({'combat.shield.solid':('Solid defense shield','Escudo de defesa cheio'),
                   'combat.page':('Page combat symbol','Símbolo de combate em forma de folha'),
                   'terrain.red-border':('Red terrain border','Borda vermelha de terreno')})
    # The circle candidate group contains different foreground symbols.
    # Distribute only complete geometry matches to their reviewed recipes.
    circles=[complete_component(doc[o['page']-1],o) for o in audit['inlineVectorCandidates'][23]['occurrences']]
    selected=[(id,o,circles if id.startswith('attack.') else occurrences) for id,o,occurrences in selected]
    placements=defaultdict(list)
    for id,o,occurrences in selected:
        page=doc[o['page']-1];drawings=source_drawings(page);rect=fitz.Rect(o['bbox']);paths=[]
        for di in o['drawingIndices']:
            drawing=drawings[di]
            if not (rect+(-.02,-.02,.02,.02)).contains(drawing['rect']):raise ValueError(f'Stale source bbox/index {id}')
            paths.append(dict(d=vector_path(drawing),transform=f'translate({-rect.x0} {-rect.y0})',fill=color(drawing.get('fill')),stroke=color(drawing.get('color')),strokeWidth=drawing.get('width') or 0,fillRule='evenodd' if drawing.get('even_odd') else 'nonzero',
                strokeLinecap=['butt','round','square'][max(drawing.get('lineCap') or (0,0,0))],strokeLinejoin=['miter','round','bevel'][round(drawing.get('lineJoin') or 0)]))
        paths=native_paint_colors(page,rect,paths)
        # Red is the rule's meaning, so a newly inserted border keeps its paint.
        monochrome=id!='terrain.red-border' and len({p['fill'] for p in paths if p['fill']!='none'} | {p['stroke'] for p in paths if p['stroke']!='none'})==1
        source_ink=next((p['fill'] for p in paths if p['fill']!='none'),None) or next((p['stroke'] for p in paths if p['stroke']!='none'),None)
        if monochrome:
            for p in paths:
                if p['fill']!='none':p['fill']='currentColor'
                if p['stroke']!='none':p['stroke']='currentColor'
        en,pt=labels[id];size=10
        entry=definition(id,en,pt,o['page'],list(rect),dict(viewBox=[0,0,rect.width,rect.height],paths=paths,widthEm=rect.width/size,heightEm=rect.height/size,verticalAlignEm=.18),'Dados' if id.startswith('dice.') else 'Regras e combate')
        entries.append(entry)
        if id=='combat.page':
            entry['searchTerms']['en']+=['book','sheet']
            entry['searchTerms']['pt-BR']+=['livro','página']
        for occurrence in [o]+occurrences:
            if not same_component(doc[occurrence['page']-1],occurrence,page,o):continue
            page_no=occurrence['page'];dompath=ROOT/f'apps/web/public/pages/page_{page_no:03d}/page_{page_no:03d}_dom.json';dom=json.loads(dompath.read_text(encoding='utf8'));r=fitz.Rect(occurrence['bbox']);anchor=anchor_for(dom,r)
            if id=='terrain.red-border':
                assert page_no==39 and occurrence['drawingIndices']==[188]
                bi=next(i for i,b in enumerate(dom['blocks']) if b['id']=='block_38')
                line=dom['blocks'][bi]['lines'][0];span=line['spans'][2]
                expected=' marked with a           cannot be moved into or through. '
                assert line['id']=='line_38_0' and span['text']==expected and span['font']=='OptimaLTStd' and span['size']==10
                trace=next(t for t in doc[38].get_texttrace() if t['font']==span['font'] and ''.join(chr(c[0]) for c in t['chars'])==expected)
                assert expected[15:24]==' '*9 and trace['chars'][15][3][0]<r.x0<r.x1<trace['chars'][23][3][2]
                assert abs(doc[38].get_drawings()[188]['width']-2)<.001 and r.height==2
                anchor=dict(blockId='block_38',blockIndex=bi,lineId=line['id'],spanIndex=2,side='replace-text',sizePt=10,textRange=[15,24])
            if anchor is None:continue
            size=anchor['sizePt'];baseline=source_baseline(doc[page_no-1],dom,anchor,baseline_cache)
            metrics=dict(widthEm=r.width/size,heightEm=r.height/size,verticalAlignEm=(r.y1-baseline)/size)
            # Source occurrences keep exact metrics. New insertions use the
            # first proven occurrence instead of a generic size/baseline guess.
            if not any(p['symbolId']==id for ps in placements.values() for p in ps):entry['render'].update(metrics)
            stamp=(id,tuple(occurrence['bbox']))
            if any(p['_stamp']==stamp for p in placements[page_no]):continue
            placements[page_no].append(dict(symbolId=id,bbox=list(r),drawingIndices=occurrence['drawingIndices'],anchor=anchor,metrics=metrics,_stamp=stamp,**({'color':source_ink} if monochrome and source_ink else {})))
    glyphs=[('tag.important.icon','Important icon','Ícone importante','Webdings','\uf07e',13),
        ('tag.discard.icon','Discard icon','Ícone descartar','ZapfDingbatsStd','✘',90),
        ('tag.status.icon','Status icon','Ícone status','ZapfDingbatsStd','✜',37),
        ('tag.passive.icon','Passive icon','Ícone passivo','ZapfDingbatsStd','✤',59),
        ('marker.star','Four-point star','Estrela de quatro pontas','ZapfDingbatsStd','✦',4),
        ('marker.arrow','Arrow marker','Marcador de seta','ZapfDingbatsStd','➤',37),
        ('marker.checkbox','Checklist square','Quadrado de checklist','ZapfDingbatsStd','❏',7)]
    entries.extend(glyph_definition(doc,s) for s in glyphs)
    entries.extend(compound_definitions(doc, vector_path, native_paint_colors, definition))
    # The p13 bounty difficulty skull is a tiny RGBA image (not a path or font
    # glyph). Keep it as a source-measured appearance variant of combat.skull.
    skull_entry=next(entry for entry in entries if entry['id']=='combat.skull')
    skull_bbox=[544.67,560.72,558.52,581.18]
    skull_size=10.0
    skull_entry['render'].setdefault('variants',{})['bounty-red-raster']={
        'assetUrl':'/pages/page_013/source-symbol-bounty-skull.png',
        'widthEm':(skull_bbox[2]-skull_bbox[0])/skull_size,
        'heightEm':(skull_bbox[3]-skull_bbox[1])/skull_size,
        'verticalAlignEm':.6997,
    }
    for g in audit['groups']:
        definition_match=next((entry for entry in entries if entry.get('legacy') and entry['legacy']['font'] in g['font'] and g['representation'].strip() in entry['legacy']['characters'] and entry['allowedBlockTypes']),None)
        if not definition_match:continue
        for o in g['occurrences']:
            if o['blockType'] in ('physical-artwork','hidden-source','page-furniture') or o['size']<4 or o['treatment'].get('renderOnlyStrokePass'):continue
            dom=json.loads((ROOT/f"apps/web/public/pages/page_{o['page']:03d}/page_{o['page']:03d}_dom.json").read_text(encoding='utf8'))
            b=dom['blocks'][o['blockIndex']]
            if b.get('staticEditorLineIndexes') and next(i for i,l in enumerate(b['lines']) if l['id']==o['line']) in b['staticEditorLineIndexes']:continue
            placements[o['page']].append(dict(symbolId=definition_match['id'],bbox=o['bbox'],drawingIndices=[],
                anchor=dict(blockId=o['block'],blockIndex=o['blockIndex'],lineId=o['line'],spanIndex=o['spanIndex'],side='replace',sizePt=o['size'])))
    # Page 90's three icon+label pairs are represented by whole semantic
    # capsules. Do not regenerate old icon-only adapters over those spans.
    compound_refs = {
        ('tag.passive.icon', 'block_15', 'line_15_1', 0),
        ('tag.status.icon', 'block_17', 'line_17_0', 0),
        ('tag.discard.icon', 'block_20', 'line_20_0', 0),
    }
    placements[90] = [item for item in placements[90] if (
        item['symbolId'], item['anchor']['blockId'], item['anchor']['lineId'], item['anchor']['spanIndex']
    ) not in compound_refs]
    # One reviewed occurrence: the image xref 54306 is unique to the p13
    # phrase "listed as a [skull] symbol". The black vector skulls elsewhere
    # have different source geometry and keep the default rendering.
    p13_dom=json.loads((ROOT/'apps/web/public/pages/page_013/page_013_dom.json').read_text(encoding='utf8'))
    p13_block_index=next(i for i,b in enumerate(p13_dom['blocks']) if b['id']=='block_48')
    p13_line=next(line for line in p13_dom['blocks'][p13_block_index]['lines'] if line['id']=='line_48_0')
    p13_anchor=dict(blockId='block_48',blockIndex=p13_block_index,lineId='line_48_0',spanIndex=0,side='before',sizePt=skull_size)
    p13_metrics=dict(widthEm=(skull_bbox[2]-skull_bbox[0])/skull_size,
        heightEm=(skull_bbox[3]-skull_bbox[1])/skull_size,verticalAlignEm=.6997,
        renderVariant='bounty-red-raster')
    placements[13].append(dict(symbolId='combat.skull',bbox=skull_bbox,drawingIndices=[],anchor=p13_anchor,metrics=p13_metrics))
    if apply:
        dest=ROOT/'apps/web/src/symbols/sourceSymbols.json';dest.write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    # Masks are independent of language. Source rendering remains untouched;
    # patches are painted only while the owning text unit is replaced.
    for page_no,items in placements.items():
        if registry_only:continue
        if only_pages and page_no not in only_pages:continue
        page_dir=ROOT/f'apps/web/public/pages/page_{page_no:03d}'
        if apply:
            mask_doc=fitz.open(PDF);page=mask_doc[page_no-1]
            source_skull_pix=None
            for b in page.get_text('blocks'):
                if b[4].strip():page.add_redact_annot(fitz.Rect(b[:4]),fill=None)
            page.apply_redactions(images=0,graphics=0,text=0)
            if any(item['metrics'].get('renderVariant')=='bounty-red-raster' for item in items):
                if len([i for i in page.get_images(full=True) if i[0]==54306])!=1:
                    raise ValueError('Expected the unique p13 bounty skull image xref 54306')
                base=fitz.Pixmap(mask_doc,54306);alpha=fitz.Pixmap(mask_doc,54305)
                source_skull_pix=fitz.Pixmap(fitz.csRGB,fitz.Pixmap(base,alpha))
                page.delete_image(54306)
            drawings=source_drawings(doc[page_no-1])
            paint_bounds=doc[page_no-1].get_bboxlog()
            for item in items:
                if item['drawingIndices']:
                    # Use MuPDF's actual paint bounds, including transformed
                    # stroke/miter bounds. Width*10 guesses fail under a CTM.
                    removal=fitz.Rect(item['bbox'])
                    for index in item['drawingIndices']:
                        drawing=drawings[index];seq=drawing['seqno']
                        removal |= fitz.Rect(paint_bounds[seq][1])
                        if drawing['type']=='fs' and seq+1<len(paint_bounds) and paint_bounds[seq+1][0]=='stroke-path':
                            removal |= fitz.Rect(paint_bounds[seq+1][1])
                    page.add_redact_annot(removal+(-.3,-.3,.3,.3),fill=None)
                    # Adjacent dice can have overlapping stroke bounds.
                    # Apply each separately: a batch can split the containment
                    # regions and leave an fs path despite a larger rectangle.
                    page.apply_redactions(images=0,graphics=1,text=1)
            for item in items:
                if item['drawingIndices'] and any(tuple(round(v,2) for v in remaining['rect'])==tuple(round(v,2) for v in drawings[index]['rect'])
                    for remaining in page.get_drawings() for index in item['drawingIndices']):
                    raise ValueError(f"Source path remains in erasure patch p{page_no}: {item['symbolId']} indices={item['drawingIndices']} bbox={item['bbox']}")
            # One render per page, not one complete PDF traversal per icon.
            pix=page.get_pixmap(matrix=fitz.Matrix(4,4));full=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
            if source_skull_pix is not None:
                source_skull_pix.save(page_dir/'source-symbol-bounty-skull.png')
        for i,item in enumerate(items):
            crop_pad=max(.4,max(((drawings[index].get('width') or 0)/2+.3 for index in item['drawingIndices']),default=0)) if apply else .8
            r=fitz.Rect(item['bbox'])+(-crop_pad,-crop_pad,crop_pad,crop_pad)
            # Pixel-aligned 4x masks preserve placement on the source canvas.
            r=fitz.Rect(math.floor(r.x0*4)/4,math.floor(r.y0*4)/4,math.ceil(r.x1*4)/4,math.ceil(r.y1*4)/4)
            name=f'inline-element-mask-{i:03d}.png';item['mask']=dict(url=f'/pages/page_{page_no:03d}/{name}',bbox=list(r));item.pop('_stamp',None)
            if apply:full.crop(tuple(round(v*4) for v in r)).save(page_dir/name)
        if apply:
            (page_dir/'inline_elements.json').write_text(json.dumps(dict(schemaVersion=1,elements=items),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
            expected={item['mask']['url'].rsplit('/',1)[-1] for item in items}
            for stale in page_dir.glob('inline-element-mask-*.png'):
                if stale.name not in expected:stale.unlink()
        if apply:mask_doc.close()
        if apply:print(f'p{page_no}: {len(items)} source adapters written',flush=True)
    doc.close()
    print(json.dumps(dict(symbols=len(entries),placements=sum(map(len,placements.values())),pages=sorted(placements),apply=apply)))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');parser.add_argument('--pages',type=int,nargs='+');parser.add_argument('--registry-only',action='store_true');args=parser.parse_args();build(args.apply,args.pages,args.registry_only)
