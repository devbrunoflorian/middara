"""Read-only source metadata, card crops, marker centers and red-border SVG."""
from pathlib import Path
import base64,copy,json,subprocess
from xml.sax.saxutils import quoteattr
import numpy as np
import pymupdf as fitz
from PIL import Image,ImageDraw
from repair_page039_fields import ROOT,PATH,PDF

out=ROOT/'docs/project-progress/evidence/2026-10-04-page39';out.mkdir(parents=True,exist_ok=True)
before=json.loads(subprocess.run(['git','show','46bde44:apps/web/public/pages/page_039/page_039_dom.json'],cwd=ROOT,check=True,capture_output=True,encoding='utf8').stdout)
after=json.loads(PATH.read_text('utf8'));normalized=copy.deepcopy(after)
for b in normalized['blocks']:
    if b['id'] in ['block_37','block_38','block_49']:b.pop('typographicUnits')
    if b['id'] in ['block_13','block_14','block_43','block_37','block_38','block_49']:b.pop('preserveLegacySpanOverrides')
    if b['id']=='block_71':
        for l in b['lines']:
            for s in l['spans']:
                for key in ['renderOnlyStrokePass','sourcePaintRole','sourcePaintAuditId','renderTextStrokeWidthPt','renderTextStrokeColor']:s.pop(key,None)
assert normalized==before,'Unexpected text/style/geometry/key/suppression change'
doc=fitz.open(PDF);page=doc[38];samples=[];cards=[]
with Image.open(PATH.parent/'background.webp') as bg:background=bg.convert('RGB')
scale=background.width/page.rect.width
pix=page.get_pixmap(matrix=fitz.Matrix(scale,scale));source=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
assert source.size==background.size
for name,box in [('Avian Flight',[92,260,405.5,325.5]),('Like the Shadows',[147,590,344,725])]:
    r=tuple(round(v*scale) for v in box);a,b=source.crop(r),background.crop(r)
    mae=float(np.abs(np.array(a,dtype=float)-np.array(b,dtype=float)).mean())
    cards.append(dict(name=name,bbox=box,sourceBackgroundMAE=mae,matchesExactSource=mae==0,comparison='Existing background, not browser'))
    samples.append((name,a,b))
source_crops=[]
# MuPDF may retain interpolated image cache from the preceding full-page
# render. Match the crop generator's fresh document and fixed 4x sequence.
crop_doc=fitz.open(PDF);crop_page=crop_doc[38]
for overlay in json.loads((PATH.parent/'fidelity_overlays.json').read_text('utf8'))['overlays']:
    r=fitz.Rect(overlay['bbox']);pix=crop_page.get_pixmap(matrix=fitz.Matrix(4,4),clip=r)
    native=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
    with Image.open(PATH.parent/overlay['url'].rsplit('/',1)[-1]) as image:asset=image.convert('RGB')
    assert native.size==asset.size and not np.abs(np.array(native,dtype=float)-np.array(asset,dtype=float)).any()
    assert overlay['languageInvariant'] and overlay['language']=='en'
    live=[(b['id'],l['id']) for b in after['blocks'] for l in b['lines'] if not l.get('rasterizedDuplicate') and ''.join(s['text'] for s in l['spans']).strip() and r.intersects(fitz.Rect(l['bbox']))]
    assert not live
    source_crops.append(dict(region=overlay['region'],sourceMAE=0,bbox=list(r),liveIntersections=live))
    # A smaller comparison sheet does not change the 4x verified assets.
    a,b=native.resize((native.width//2,native.height//2)),asset.resize((asset.width//2,asset.height//2))
    samples.append(('Restored exact crop: '+overlay['region'],a,b))
markers=[]
for b in after['blocks']:
    if b['id'] not in ['block_50','block_51','block_52','block_53','block_62','block_63','block_64','block_66']:continue
    r=fitz.Rect(b['bbox']);cx=(r.x0+r.x1)/2;cy=(r.y0+r.y1)/2
    boxes=[d['rect'] for d in page.get_drawings() if d['fill'] and all(abs(v-1)<.001 for v in d['fill']) and d['rect'].contains(fitz.Point(cx,cy)) and 15<d['rect'].width<30 and 15<d['rect'].height<30]
    assert len(boxes)==1
    box=boxes[0];dx=cx-(box.x0+box.x1)/2;dy=cy-(box.y0+box.y1)/2
    assert abs(dx)<.3 and abs(dy)<.7
    markers.append(dict(blockId=b['id'],sourceBox=list(box),inkCenterDx=dx,inkCenterDy=dy))
elements=json.loads((PATH.parent/'inline_elements.json').read_text('utf8'))['elements']
e=next(e for e in elements if e['symbolId']=='terrain.red-border')
entry=next(s for s in json.loads((ROOT/'apps/web/src/symbols/sourceSymbols.json').read_text('utf8')) if s['id']==e['symbolId'])
r=fitz.Rect(e['bbox']);box=fitz.Rect(e['mask']['bbox']);patchpath=PATH.parent/e['mask']['url'].rsplit('/',1)[-1]
with Image.open(patchpath) as patch:w,h=patch.size
paths=[];aliases={'strokeWidth':'stroke-width','fillRule':'fill-rule','strokeLinecap':'stroke-linecap','strokeLinejoin':'stroke-linejoin'}
for path in entry['render']['paths']:
    p={**path};p['transform']=f'translate({r.x0-box.x0} {r.y0-box.y0}) '+p['transform']
    assert p['stroke']!='currentColor' and p['fill']=='none'
    paths.append('<path '+' '.join(f'{aliases.get(k,k)}={quoteattr(str(v))}' for k,v in p.items())+'/>')
svg=f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {box.width} {box.height}"><image width="{box.width}" height="{box.height}" xlink:href="data:image/png;base64,{base64.b64encode(patchpath.read_bytes()).decode()}"/>'+''.join(paths)+'</svg>'
svgdoc=fitz.open('svg',svg.encode());pdfdoc=fitz.open('pdf',svgdoc.convert_to_pdf())
pix=pdfdoc[0].get_pixmap(matrix=fitz.Matrix(w/pdfdoc[0].rect.width,h/pdfdoc[0].rect.height));actual=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
pix=page.get_pixmap(matrix=fitz.Matrix(4,4),clip=box);expected=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
assert actual.size==expected.size
mae=float(np.abs(np.array(actual,dtype=float)-np.array(expected,dtype=float)).mean());assert mae<5
samples.append(('Red border: native source / SVG over paper',expected.resize((expected.width*4,expected.height*4)),actual.resize((actual.width*4,actual.height*4))))
width=max(a.width+b.width for _,a,b in samples)+30;height=sum(max(a.height,b.height)+30 for _,a,b in samples)
sheet=Image.new('RGB',(width,height),'#eee');draw=ImageDraw.Draw(sheet);y=0
for name,a,b in samples:
    draw.text((8,y+5),name,fill='black');y+=25;sheet.paste(a,(8,y));sheet.paste(b,(a.width+18,y));y+=max(a.height,b.height)+5
sheet.save(out/'source-background-and-red-border.png')
report=dict(page=39,blocks=len(after['blocks']),lines=sum(len(b['lines']) for b in after['blocks']),sourceIDsStylesGeometryAndOldKeysPreserved=True,
    cardSuppressionsPreserved=sum(bool(l.get('rasterizedDuplicate')) for b in after['blocks'] for l in b['lines']),oldBackgroundCards=cards,sourceCrops=source_crops,markers=markers,
    newParagraphFields=3,existingHeadingBodyFields=6,redBorder=dict(sourceMAE=mae,anchor=e['anchor'],literalStroke=entry['render']['paths'][0]['stroke']),
    databaseWrites=0,browserQA='pending; saved origin preference')
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
print(json.dumps(report,ensure_ascii=False))
