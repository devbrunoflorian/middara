"""Readable source crops and diagnostic sheets for the full audit (no writes to canonical data)."""
import json
from pathlib import Path
import textwrap
import pymupdf as fitz
from PIL import Image,ImageDraw,ImageFont
from audit_inline_symbol_integrity import ROOT,DEFAULT_PDF

OUT=ROOT/'output/proofs/full-symbol-integrity-2026-10-13'
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
report=json.loads((OUT/'audit.json').read_text(encoding='utf8'))
missing=[c for c in report['candidates'] if c['classification']=='PLACEMENT AUSENTE']
sheets=OUT/'contact-sheets';sheets.mkdir(exist_ok=True)
with fitz.open(DEFAULT_PDF) as pdf:
    for start in range(0,len(missing),24):
        group=missing[start:start+24];canvas=Image.new('RGB',(1500,6*250+45),'#f5f5f5');draw=ImageDraw.Draw(canvas)
        draw.text((15,10),f'Placements ausentes · fonte e contexto · {start+1}–{start+len(group)} / {len(missing)}',fill='#111',font=font)
        for j,c in enumerate(group):
            x=(j%4)*375;y=(j//4)*250+45;p=pdf[c['page']-1];r=fitz.Rect(c['bbox']);area=(r+(-40,-12,55,12))&p.rect
            pix=p.get_pixmap(matrix=fitz.Matrix(4,4),clip=area,alpha=False);im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples);im.thumbnail((363,140))
            canvas.paste(im,(x+(375-im.width)//2,y));draw.text((x+7,y+145),c['id']+' · '+c['symbolId'],fill='#111',font=small)
            context=' '.join(c.get('sourceContext') or [s['text'] for s in c.get('nearby',[]) if s['text'].strip()])
            for k,line in enumerate(textwrap.wrap(context,48)[:4]):draw.text((x+7,y+167+k*16),line,fill='#222',font=small)
        canvas.save(sheets/f'missing-{start//24+1:02}.png')
    pairs=[(52,[277,300,411,445]),(83,[110,100,385,187]),(84,[433,109,699,195]),(85,[84,140,419,230]),(92,[287,231,559,291])]
    canvas=Image.new('RGB',(1300,5*235+50),'#edf0f4');draw=ImageDraw.Draw(canvas)
    draw.text((20,12),'PDF original | operadores de texto ocultos (vetores e imagens preservados)',fill='#111',font=font)
    for j,(n,box) in enumerate(pairs):
        for k,name in enumerate(['source.webp','text-hidden.webp']):
            im=Image.open(OUT/f'pages/p{n:03d}'/name);crop=im.crop(tuple(round(v*2) for v in box));crop.thumbnail((620,188))
            x=k*650+15;y=j*235+50;canvas.paste(crop,(x,y));draw.text((x,y+193),f'p.{n} · {name}',fill='#111',font=font)
    canvas.save(sheets/'diagnostic-five-pages.png')
print(json.dumps({'missingCandidates':len(missing),'sheets':str(sheets)},ensure_ascii=False))
