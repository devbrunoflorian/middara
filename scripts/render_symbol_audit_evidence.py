"""Source, empty-editor and exported-PDF comparisons in legible crops."""
from pathlib import Path
import json
import pymupdf as fitz
from PIL import Image,ImageDraw,ImageFont
from audit_inline_symbol_integrity import ROOT,DEFAULT_PDF
OUT=ROOT/'output/proofs/full-symbol-integrity-2026-10-13'
proof=OUT/'viewer-editor';dest=OUT/'contact-sheets';dest.mkdir(exist_ok=True)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',17)
small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
cases=[(52,[283,367,414,442],'BOOK · dois paths por ícone'),(83,[114,107,387,176],'A composto + imagem do Totem'),
 (84,[502,132,603,172],'B · caixa e letra'),(85,[285,148,370,184],'WHITE e ORANGE · quatro paths cada'),(92,[286,241,426,284],'Escudo + BOOK + estrela · pintura branca')]

def paste_cell(canvas,img,x,y,w=430,h=210):
    img.thumbnail((w-14,h-34));canvas.paste(img,(x+7,y+(h-34-img.height)//2))

def edited_region(n,box,raw,metrics):
    sx=metrics['viewer']['scaleX'];sy=metrics['viewer']['scaleY']
    owner=fitz.Rect(raw['blocks'][{52:6,83:1,84:30,85:1,92:5}[n]]['bbox'])+(-5,-5,5,15)
    region=fitz.Rect(box)
    for item in metrics['viewer']['images']:
        if 'audit-source' not in item.get('src',''):continue
        rect=item['rect']
        rr=fitz.Rect(rect['x']/sx,rect['y']/sy,(rect['x']+rect['width'])/sx,(rect['y']+rect['height'])/sy)
        if rr.intersects(owner):region|=rr+(-10,-10,10,10)
    return region

with fitz.open(DEFAULT_PDF) as source:
    canvas=Image.new('RGB',(1720,5*245+55),'#eef1f5');draw=ImageDraw.Draw(canvas)
    titles=['PDF fonte','Rascunho vazio · antes','Rascunho vazio · patch','PDF da edição experimental']
    for k,title in enumerate(titles):draw.text((k*430+10,12),title,fill='#111',font=font)
    for j,(n,box,title) in enumerate(cases):
        y=55+j*245;id=f'{n:03d}';page=source[n-1];r=fitz.Rect(box);pix=page.get_pixmap(matrix=fitz.Matrix(4,4),clip=r,alpha=False)
        paste_cell(canvas,Image.frombytes('RGB',(pix.width,pix.height),pix.samples),0,y)
        raw=json.loads((ROOT/f'apps/web/public/pages/page_{id}/page_{id}_dom.json').read_text(encoding='utf8'))
        for k,file in [(1,'before-empty-en.png'),(2,'patched-empty-en.png')]:
            im=Image.open(proof/f'p{id}'/file);scale=im.width/raw['width'];crop=im.crop(tuple(round(v*scale) for v in box));paste_cell(canvas,crop,k*430,y)
        with fitz.open(proof/f'p{id}/moved-en.pdf') as pdf:
            metrics=json.loads((proof/f'p{id}/export-en-metrics.json').read_text(encoding='utf8'))
            pp=pdf[0];pix=pp.get_pixmap(matrix=fitz.Matrix(4,4),clip=edited_region(n,box,raw,metrics),alpha=False);paste_cell(canvas,Image.frombytes('RGB',(pix.width,pix.height),pix.samples),3*430,y)
        for k in range(4):draw.text((k*430+10,y+210),f'p.{n} · {title}',fill='#111',font=small)
    canvas.save(dest/'five-pages-before-after-pdf.png')
    canvas=Image.new('RGB',(1500,5*220+50),'#edf0f4');draw=ImageDraw.Draw(canvas)
    for k,title in enumerate(['Viewer · EN editado','PDF · EN editado','PDF · modo PT-BR']):draw.text((k*500+10,10),title,fill='#111',font=font)
    for j,(n,box,title) in enumerate(cases):
        id=f'{n:03d}';y=50+j*220;raw=json.loads((ROOT/f'apps/web/public/pages/page_{id}/page_{id}_dom.json').read_text(encoding='utf8'))
        metrics=json.loads((proof/f'p{id}/export-en-metrics.json').read_text(encoding='utf8'));sx=metrics['viewer']['scaleX'];sy=metrics['viewer']['scaleY']
        region=edited_region(n,box,raw,metrics)
        view=Image.open(proof/f'p{id}/export-en-viewer.png');crop=view.crop((round(region.x0*sx),round(region.y0*sy),round(region.x1*sx),round(region.y1*sy)));paste_cell(canvas,crop,0,y,500,185)
        for k,lang in [(1,'en'),(2,'pt-BR')]:
            with fitz.open(proof/f'p{id}/moved-{lang}.pdf') as pdf:
                pix=pdf[0].get_pixmap(matrix=fitz.Matrix(4,4),clip=region,alpha=False);paste_cell(canvas,Image.frombytes('RGB',(pix.width,pix.height),pix.samples),k*500,y,500,185)
        for k in range(3):draw.text((k*500+10,y+190),f'p.{n} · {title}',fill='#111',font=small)
    canvas.save(dest/'viewer-pdf-en-pt-five-pages.png')
print(json.dumps({'evidenceDirectory':str(dest)},ensure_ascii=False))
