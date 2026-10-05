"""Read-only inventory of special inline content, artwork and legacy code paths.

Candidates are evidence, not automatic permission to turn furniture/art into text.
No source page, translation record or PDF is modified.
"""
from __future__ import annotations
import argparse
import collections
import csv
import hashlib
import json
import re
import sqlite3
import unicodedata
from pathlib import Path
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
TAGS = re.compile(r'\b(?:IMPORTANT|PASSIVE|EXHAUST|DISCARD|FLIP|STATUS|COMMAND|INTELLIGENT|PER ENCOUNTER|PER ADVENTURE|USED|CONTINUE DOWN)\b')
SPECIAL_FONTS = ('Wingdings', 'Webdings', 'ZapfDingbats')
CODE_PATTERN = re.compile(r'symbolId|pictogram|ZapfDingbats|Wingdings|Webdings|displayOverride|renderTextOverride|placeholder|PUA|semanticSymbols|textStroke|sourceSegments|regex|\.replace\(')

def block_kind(block, line):
    if block.get('hiddenFromPage'): return 'hidden-source'
    if line.get('rasterizedDuplicate'): return 'physical-artwork'
    if block.get('adminReadOnly'): return 'page-furniture'
    if block.get('staticEditorLineIndexes') and block['lines'].index(line) in block['staticEditorLineIndexes']: return 'page-furniture'
    if block.get('creditUnits') or block.get('creditUnit'): return 'credit-field'
    if block.get('typographicUnits'): return 'typographic-field'
    if block.get('typographicSpanUnits'): return 'span-unit/paragraph'
    return 'paragraph'

def inventory(pdf_path, out):
    out.mkdir(parents=True, exist_ok=True)
    groups = collections.defaultdict(list)
    image_groups = collections.defaultdict(list)
    vector_groups = collections.defaultdict(list)
    fonts, kinds, flags = collections.Counter(), collections.Counter(), collections.Counter()
    overlays, page_counts = [], []
    doc = fitz.open(pdf_path)
    for path in sorted((ROOT/'apps/web/public/pages').glob('page_*/page_*_dom.json')):
        data = json.loads(path.read_text(encoding='utf8'))
        page_no = data['page_number']; page = doc[page_no-1]
        live_lines = []
        for bi, block in enumerate(data['blocks']):
            for line in block.get('lines', []):
                kind = block_kind(block, line); kinds[kind] += 1
                context = ''.join(s.get('text', '') for s in line['spans'])
                if kind not in ('physical-artwork', 'hidden-source', 'page-furniture'):
                    live_lines.append((block, line, context, kind))
                for si, span in enumerate(line['spans']):
                    font = span.get('font', ''); text = span.get('text', '')
                    fonts[font] += 1
                    for key in span:
                        if key.startswith(('render', 'pictogram', 'display')): flags[key] += 1
                    reasons = []
                    if any(f in font for f in SPECIAL_FONTS): reasons.append('symbol-font')
                    if any(unicodedata.category(c) in ('So','Sm','Sk','Co','Cc') for c in text if c not in '\n\r'): reasons.append('unicode/control')
                    if any(k.startswith(('pictogram','display','renderTextStroke','renderOnlyStroke')) for k in span): reasons.append('render-metadata')
                    if TAGS.search(text): reasons.append('semantic-label')
                    if font == 'OptimaLTStd-ExtraBlack' and re.fullmatch('[A-Z]', text.strip()): reasons.append('alphabet-callout')
                    if not reasons: continue
                    row = dict(page=page_no, block=block['id'], blockIndex=bi, line=line['id'], spanIndex=si,
                        font=font, text=text, codepoints=' '.join(f'U+{ord(c):04X}' for c in text), bbox=span['bbox'],
                        size=span.get('size'), color=span.get('color'), blockType=kind, context=context,
                        reasons=reasons, treatment={k:v for k,v in span.items() if k.startswith(('render','pictogram','display'))})
                    # Keep styled prose at the occurrence level, not a misleading one-symbol-per-sentence.
                    signature = (font, text if 'symbol-font' in reasons else ('|'.join(reasons)+':'+','.join(sorted(set(TAGS.findall(text))))+':'+''.join(sorted(set(c for c in text if unicodedata.category(c) in ('So','Sm','Sk','Co','Cc'))))))
                    groups[signature].append(row)
        for image in page.get_image_info(hashes=True, xrefs=True):
            rect = fitz.Rect(image['bbox'])
            if not (1 <= rect.width <= 40 and 1 <= rect.height <= 40): continue
            matches = [(b,l,ctx,k) for b,l,ctx,k in live_lines if
                fitz.Rect(l['bbox']).intersects(rect) and
                rect.height <= max(s.get('size',0) for s in l['spans']) * 2.5]
            if not matches: continue
            digest = image['digest'].hex()
            image_groups[digest].append(dict(page=page_no, bbox=list(rect), xref=image['xref'], pixelSize=[image['width'],image['height']],
                matches=[dict(block=b['id'],line=l['id'],blockType=k,context=ctx) for b,l,ctx,k in matches],
                classification='candidate-needs-source-review'))
        # The sword/arrow, dice, flag and pencil are vector paths, absent from
        # text spans and from get_image_info(). Group touching small paths;
        # record nearby prose as evidence, never classify by size alone.
        drawings = page.get_drawings()
        components = []
        for di, drawing in enumerate(drawings):
            rect = drawing['rect']
            if not (0 < rect.width <= 36 and 0 < rect.height <= 36): continue
            if not any(fitz.Rect(l['bbox']).intersects(rect) for _,l,_,_ in live_lines): continue
            neighbors = [c for c in components if (c['rect']+(-.15,-.15,.15,.15)).intersects(rect)]
            if neighbors:
                component = neighbors[0];component['rect'] |= rect;component['indices'].append(di)
                for other in neighbors[1:]:
                    component['rect'] |= other['rect'];component['indices'].extend(other['indices']);components.remove(other)
            else: components.append(dict(rect=fitz.Rect(rect),indices=[di]))
        for component in components:
            rect = component['rect']
            if not (1 <= rect.width <= 36 and 1 <= rect.height <= 36): continue
            matches = [(b,l,ctx,k) for b,l,ctx,k in live_lines if fitz.Rect(l['bbox']).intersects(rect)]
            if not matches: continue
            # Compare normalized path topology and paint, so reuse at a new
            # source coordinate/size is visible. Quantization is only a
            # candidate grouping heuristic, not a fidelity equivalence proof.
            shapes=[]
            for di in component['indices']:
                drawing=drawings[di];parts=[]
                for item in drawing['items']:
                    coordinates=[]
                    for part in item[1:]:
                        if isinstance(part,fitz.Point):coordinates.extend([round((part.x-rect.x0)/rect.width,3),round((part.y-rect.y0)/rect.height,3)])
                        elif isinstance(part,fitz.Rect):coordinates.extend([round((part.x0-rect.x0)/rect.width,3),round((part.y0-rect.y0)/rect.height,3),round((part.x1-rect.x0)/rect.width,3),round((part.y1-rect.y0)/rect.height,3)])
                        else:coordinates.append(str(part))
                    parts.append([item[0],coordinates])
                shapes.append([drawing['type'],drawing.get('fill'),drawing.get('color'),parts])
            signature=hashlib.sha256(json.dumps(shapes,sort_keys=True).encode()).hexdigest()[:16]
            vector_groups[signature].append(dict(page=page_no,bbox=list(rect),drawingIndices=component['indices'],
                matches=[dict(block=b['id'],line=l['id'],blockType=k,context=ctx) for b,l,ctx,k in matches],classification='candidate-needs-source-review'))
        overlay_path = path.parent/'fidelity_overlays.json'
        if overlay_path.exists():
            value = json.loads(overlay_path.read_text(encoding='utf8'))
            entries = value if isinstance(value,list) else value.get('overlays',[])
            overlays.extend(dict(page=page_no,**entry) for entry in entries)
        page_counts.append(dict(page=page_no,blocks=len(data['blocks']),lines=sum(len(b.get('lines',[])) for b in data['blocks'])))
    code = []
    for base in ['apps/web/src','apps/admin/src/collections','packages','scripts']:
        for path in sorted((ROOT/base).rglob('*')):
            if path.suffix not in ('.ts','.tsx','.py','.css') or any(x in path.parts for x in ('node_modules','dist','output')): continue
            lines = path.read_text(encoding='utf8',errors='replace').splitlines()
            hits = [dict(line=i+1,text=line.strip()[:280]) for i,line in enumerate(lines) if CODE_PATTERN.search(line)]
            if hits: code.append(dict(path=path.relative_to(ROOT).as_posix(),hits=hits))
    db = sqlite3.connect(f'file:{(ROOT/"apps/admin/apps-admin.db").as_posix()}?mode=ro',uri=True)
    records=db.execute('select language,data from translations').fetchall(); stored=collections.Counter()
    for lang,data in records:
        parsed=json.loads(data); segs=parsed if isinstance(parsed,list) else parsed.get('segments',[])
        for seg in segs:
            if seg.get('symbolId'): stored['symbolId:'+seg['symbolId']]+=1
            if any(0xE000<=ord(c)<=0xF8FF for c in seg.get('text','')): stored['PUA']+=1
            if seg.get('textStrokeWidthPt'): stored['outline']+=1
    db.close();doc.close()
    report=dict(schemaVersion=1,sourcePdf=pdf_path.name,pages=page_counts,fonts=dict(fonts),blockTypes=dict(kinds),renderFlags=dict(flags),
        groups=[dict(font=k[0],representation=k[1],occurrences=v) for k,v in sorted(groups.items())],
        inlineImageCandidates=[dict(digest=k,occurrences=v) for k,v in sorted(image_groups.items())],
        inlineVectorCandidates=[dict(signature=k,occurrences=v) for k,v in sorted(vector_groups.items())],
        fidelityOverlays=overlays,codeReferences=code,
        persistence=dict(records=len(records),languages=dict(collections.Counter(l for l,_ in records)),specialSegments=dict(stored),mode='read-only'))
    (out/'inventory.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    with (out/'occurrences.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['page','block','blockIndex','line','spanIndex','font','text','codepoints','bbox','size','color','blockType','context','reasons','treatment']);writer.writeheader()
        for rows in groups.values():writer.writerows(rows)
    print(json.dumps(dict(pages=len(page_counts),groups=len(groups),candidateSpans=sum(map(len,groups.values())),imageTypes=len(image_groups),imageOccurrences=sum(map(len,image_groups.values())),vectorTypes=len(vector_groups),vectorOccurrences=sum(map(len,vector_groups.values())),fonts=dict(fonts),blockTypes=dict(kinds),persistence=report['persistence']),ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--pdf',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    args=p.parse_args();inventory(args.pdf,args.out)
