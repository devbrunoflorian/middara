"""Read-only p.37 metadata/crops checks and native source/SVG comparisons.

Writes evidence only. It renders PDF/SVG through MuPDF; it does not capture,
drive, proxy or export the web viewer and cannot certify browser composition.
"""
from pathlib import Path
import argparse, copy, json, subprocess
import numpy as np
import pymupdf as fitz
from PIL import Image, ImageDraw
from repair_page037_source_fields_and_glyphs import ROOT, PDF, FOLDER, TARGETS

OUT = ROOT/'docs/project-progress/evidence/2026-10-04-page37'
OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline-ref',default='f3b21ac',help='Git source snapshot before this repair')
args=parser.parse_args()
snapshot=subprocess.run(['git','show',args.baseline_ref+':apps/web/public/pages/page_037/page_037_dom.json'],
                        cwd=ROOT,check=True,capture_output=True,encoding='utf8').stdout
before=json.loads(snapshot)
after=json.loads((FOLDER/'page_037_dom.json').read_text('utf8'))
normalized=copy.deepcopy(after)
for block in normalized['blocks']:
    if block['id'] in ('block_18','block_20'):
        block.pop('typographicUnits');block.pop('preserveLegacySpanOverrides')
    for line in block['lines']:
        if line['id'] in ('line_16_2','line_224_0','line_234_3'):
            line.pop('renderSourceSpanGeometry')
        for span in line['spans']:
            if line['id']=='line_237_0' or line['id']=='line_237_1':
                for key in ('renderOnlyStrokePass','sourcePaintRole','sourcePaintAuditId','renderTextStrokeWidthPt','renderTextStrokeColor'):
                    span.pop(key,None)
            elif span.get('sourcePaintAuditId')=='2026-10-04-p037-source-glyphs-v1':
                for key in ('renderAsSourceOverlayDuplicate','renderSourceOverlayLanguage','sourcePaintAuditId'):
                    span.pop(key)
assert normalized==before, 'Unexpected source text/geometry/flags/old keys change'

source=fitz.open(PDF);page=source[36]
side=json.loads((FOLDER/'fidelity_overlays.json').read_text('utf8'))
samples=[];crops=[]
for overlay in side['overlays']:
    if overlay.get('category')!='item-cards':continue
    pix=page.get_pixmap(matrix=fitz.Matrix(4,4),clip=fitz.Rect(overlay['bbox']))
    reference=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
    with Image.open(FOLDER/overlay['url'].rsplit('/',1)[-1]) as im:saved=im.convert('RGB')
    assert reference.size==saved.size
    diff=np.abs(np.array(reference,dtype=float)-np.array(saved,dtype=float))
    assert not diff.any()
    crops.append(dict(region=overlay['region'],bbox=overlay['bbox'],sourceMAE=float(diff.mean())))
    samples.append((overlay['region']+' (PDF / shipped crop)',reference,saved))

# Repaint the copied native glyph paths over source paper without prose.
paper=fitz.open(PDF);p=paper[36]
for b in p.get_text('blocks'):
    if b[4].strip():p.add_redact_annot(fitz.Rect(b[:4]),fill=None)
p.apply_redactions(images=0,graphics=0,text=0)
svg_doc=fitz.open(stream=(FOLDER/'fidelity-overlay-component-source-zapf-glyphs.svg').read_bytes(),filetype='svg')
glyph_doc=fitz.open('pdf',svg_doc.convert_to_pdf())
p.show_pdf_page(p.rect,glyph_doc,0)
glyphs=[]
blocks={b['id']:b for b in after['blocks']}
for block_id,line_id,index,text,symbol_id in TARGETS:
    line=next(l for l in blocks[block_id]['lines'] if l['id']==line_id)
    rect=fitz.Rect(line['spans'][index]['bbox'])
    pictures=[]
    for pg in [page,p]:
        pix=pg.get_pixmap(matrix=fitz.Matrix(12,12),clip=rect)
        pictures.append(Image.frombytes('RGB',(pix.width,pix.height),pix.samples))
    diff=np.abs(np.array(pictures[0],dtype=float)-np.array(pictures[1],dtype=float))
    mae=float(diff.mean())
    # Native PDF fonts and converted outlines can have subpixel AA differences.
    assert mae<2, (line_id,mae)
    glyphs.append(dict(line=line_id,symbolId=symbol_id,sourceMAE=mae))
    samples.append((symbol_id+' '+line_id+' (PDF / paper + source SVG)',*pictures))

live=[l for b in after['blocks'] for l in b['lines'] if not l.get('rasterizedDuplicate')]
intersections=[]
for crop in crops:
    r=fitz.Rect(crop['bbox'])
    intersections += [(crop['region'],l['id']) for l in live if r.intersects(fitz.Rect(l['bbox']))]
assert not intersections, intersections
report=dict(page=37,blocks=len(after['blocks']),lines=sum(len(b['lines']) for b in after['blocks']),
            sourceIDsTextGeometryPreserved=True,paragraphFieldsAdded=4,oldSpanUnitsPreserved=True,
            sourceCrops=crops,sourceGlyphs=glyphs,liveCropIntersections=intersections,
            sourceFolioPaintPairs=1,browserQA='pending; saved origin preference',databaseWrites=0)
(OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
width=1200;resized=[]
for title,a,b in samples:
    w=(width-30)//2
    # Enlarge small glyphs; fit full-card crops without browser rendering.
    factor=min(w/a.width,3)
    size=(round(a.width*factor),round(a.height*factor))
    resized.append((title,a.resize(size),b.resize(size)))
height=sum(max(a.height,b.height)+34 for _,a,b in resized)
sheet=Image.new('RGB',(width,height),'#eeeeee');draw=ImageDraw.Draw(sheet);y=0
for title,a,b in resized:
    draw.text((8,y+5),title,fill='black');y+=25
    sheet.paste(a,(8,y));sheet.paste(b,(width//2+8,y));y+=max(a.height,b.height)+9
sheet.save(OUT/'source-crops-and-glyphs.png')
print(json.dumps(report,ensure_ascii=False))
