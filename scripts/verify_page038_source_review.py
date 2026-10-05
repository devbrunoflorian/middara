"""Read-only p.38 source metadata/crops/registry comparisons; no browser access."""
from pathlib import Path
import base64, copy, json, subprocess
from xml.sax.saxutils import quoteattr
import numpy as np
import pymupdf as fitz
from PIL import Image, ImageDraw
from repair_page038_table_fields import ROOT,PDF,PATH

folder=PATH.parent;out=ROOT/'docs/project-progress/evidence/2026-10-04-page38';out.mkdir(parents=True,exist_ok=True)
before=json.loads(subprocess.run(['git','show','324391e:apps/web/public/pages/page_038/page_038_dom.json'],
    cwd=ROOT,check=True,capture_output=True,encoding='utf8').stdout)
after=json.loads(PATH.read_text('utf8'));normalized=copy.deepcopy(after)
for block in normalized['blocks']:
    if block['id'] in ['block_10','block_27','block_13','block_16','block_38','block_30','block_33','block_34','block_35']:
        block.pop('typographicUnits');block.pop('preserveLegacySpanOverrides',None)
    if block['id']=='block_58':
        for line in block['lines']:
            for span in line['spans']:
                for key in ['renderOnlyStrokePass','sourcePaintRole','sourcePaintAuditId','renderTextStrokeWidthPt','renderTextStrokeColor']:
                    span.pop(key,None)
assert normalized==before, 'Unexpected source IDs/text/geometry/flags/old keys changed'
doc=fitz.open(PDF);page=doc[37]
side=json.loads((folder/'fidelity_overlays.json').read_text('utf8'))
crop_checks=[]
for overlay in side['overlays']:
    pix=page.get_pixmap(matrix=fitz.Matrix(4,4),clip=fitz.Rect(overlay['bbox']))
    native=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
    with Image.open(folder/overlay['url'].rsplit('/',1)[-1]) as image:asset=image.convert('RGB')
    assert native.size==asset.size
    assert not np.abs(np.array(native,dtype=float)-np.array(asset,dtype=float)).any()
    crop_checks.append(dict(region=overlay['region'],sourceMAE=0))

entries={e['id']:e for e in json.loads((ROOT/'apps/web/src/symbols/sourceSymbols.json').read_text('utf8'))}
elements=json.loads((folder/'inline_elements.json').read_text('utf8'))['elements']
aliases={'strokeWidth':'stroke-width','fillRule':'fill-rule','strokeLinecap':'stroke-linecap','strokeLinejoin':'stroke-linejoin'}
samples=[];vector_checks=[]
for element in elements:
    if element['symbolId']=='tag.important.icon':continue
    entry=entries[element['symbolId']];r=fitz.Rect(element['bbox']);box=fitz.Rect(element['mask']['bbox'])
    paper_path=folder/element['mask']['url'].rsplit('/',1)[-1]
    with Image.open(paper_path) as paper:w,h=paper.size
    encoded=base64.b64encode(paper_path.read_bytes()).decode()
    shapes=[]
    for p in entry['render']['paths']:
        values={**p}
        values['transform']=f'translate({r.x0-box.x0} {r.y0-box.y0}) scale({r.width/entry["render"]["viewBox"][2]} {r.height/entry["render"]["viewBox"][3]}) '+p.get('transform','')
        for paint in ['fill','stroke']:
            if values.get(paint)=='currentColor':values[paint]=element.get('color','#231f20')
        shapes.append('<path '+' '.join(f'{aliases.get(k,k)}={quoteattr(str(v))}' for k,v in values.items())+'/>')
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {box.width} {box.height}"><image x="0" y="0" width="{box.width}" height="{box.height}" xlink:href="data:image/png;base64,{encoded}"/>'+''.join(shapes)+'</svg>'
    svgdoc=fitz.open('svg',svg.encode());pdfdoc=fitz.open('pdf',svgdoc.convert_to_pdf())
    pix=pdfdoc[0].get_pixmap(matrix=fitz.Matrix(w/pdfdoc[0].rect.width,h/pdfdoc[0].rect.height))
    actual=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
    expected_pix=page.get_pixmap(matrix=fitz.Matrix(4,4),clip=box)
    expected=Image.frombytes('RGB',(expected_pix.width,expected_pix.height),expected_pix.samples)
    # Crop only the proven symbol bounds; prose just outside the mask is not
    # part of this native vector comparison and is checked separately in UI QA.
    clip=(round((r.x0-box.x0)*4),round((r.y0-box.y0)*4),round((r.x1-box.x0)*4),round((r.y1-box.y0)*4))
    a,b=expected.crop(clip),actual.crop(clip)
    assert a.size==b.size
    mae=float(np.abs(np.array(a,dtype=float)-np.array(b,dtype=float)).mean())
    vector_checks.append(dict(symbolId=element['symbolId'],anchor=element['anchor'],sourceMAE=mae))
    assert mae<5, (element['symbolId'],mae)
    samples.append((element['symbolId']+' '+element['anchor']['lineId'],a,b))

report=dict(page=38,blocks=len(after['blocks']),lines=sum(len(b['lines']) for b in after['blocks']),
    sourceIDsTextGeometryAndOldSpanUnitsPreserved=True,tableFieldsAdded=16,sourceCrops=crop_checks,
    sourceVectors=vector_checks,inlineAdapters=len(elements),newDefinitions=['combat.shield.solid','combat.page'],
    browserQA='pending; saved origin preference',databaseWrites=0)
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
width=800;height=sum(max(a.height,b.height)*4+30 for _,a,b in samples)
sheet=Image.new('RGB',(width,height),'#eee');draw=ImageDraw.Draw(sheet);y=0
for title,a,b in samples:
    draw.text((8,y+5),title,fill='black');y+=25
    sheet.paste(a.resize((a.width*4,a.height*4)),(8,y));sheet.paste(b.resize((b.width*4,b.height*4)),(width//2+8,y))
    y+=max(a.height,b.height)*4+5
sheet.save(out/'native-symbol-registry-comparison.png')
print(json.dumps(report,ensure_ascii=False))
