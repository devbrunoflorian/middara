#!/usr/bin/env python3
"""Create fixed-scale source / old-proof / corrected-proof visual comparisons."""
from __future__ import annotations
import json
from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf'
SCALE = 3.5
GROUPS = {
 'native-vector-mask-v10': ('native-vector-mask-v9', ['p045-v134-137-n4','p054-v185-188-n4','p084-v185']),
 'native-vector-mask-p055-proof-v3': ('native-vector-mask-p055-proof-v1', ['p055-v94-96-n3','p055-v97']),
 'native-vector-mask-p055-proof-v4': ('native-vector-mask-p055-proof-v2', ['p055-v89-91-n3','p055-v92-93-n2']),
 'native-vector-mask-p065-proof-v6': ('native-vector-mask-p065-proof-v5', ['p065-v110-112-n3','p065-v115']),
 'native-vector-mask-p068-proof-v5': ('native-vector-mask-p068-proof-v4', ['p068-v113-114-n2']),
 'native-vector-mask-p045-v142-proof-v3': ('native-vector-mask-p045-v142-proof-v2', ['p045-v142-145-n4']),
}
BASE = ROOT / 'output/proofs/translation-readiness-2026-10-14'

def render(doc, page_index, clip):
 page=doc[page_index]
 pix=page.get_pixmap(matrix=pymupdf.Matrix(SCALE,SCALE),clip=clip,alpha=False)
 return Image.frombytes('RGB',(pix.width,pix.height),pix.samples)

def font(size):
 try: return ImageFont.truetype('arial.ttf',size)
 except OSError: return ImageFont.load_default()

source_doc=pymupdf.open(SOURCE)
for new_group,(old_group,candidates) in GROUPS.items():
 new_root=BASE/new_group; old_root=BASE/old_group
 for cid in candidates:
  new_dir=new_root/cid; old_dir=old_root/cid
  inp=json.loads((new_dir/'candidate-input.json').read_text(encoding='utf-8'))
  pg=int(inp['page']); index=pg-1
  dom=json.loads((ROOT/f'apps/web/public/pages/page_{pg:03d}/page_{pg:03d}_dom.json').read_text(encoding='utf-8'))
  block=next(b for b in dom['blocks'] if b['id']==inp['anchor']['blockId'])
  x0,y0,x1,y1=block['bbox']
  clip=pymupdf.Rect(max(0,x0-4),max(0,y0-5),min(dom['width'],x1+4),min(dom['height'],y1+5))
  old_report=json.loads((old_root/'proof-report.json').read_text(encoding='utf-8'))
  old_entry=next(c for c in old_report['candidates'] if c['candidateId']==cid)
  new_report=json.loads((new_root/'proof-report.json').read_text(encoding='utf-8'))
  new_entry=next(c for c in new_report['candidates'] if c['candidateId']==cid)
  old_pdf=Path(old_entry['pdfPath']); new_pdf=Path(new_entry['pdfPath'])
  if not old_pdf.is_absolute(): old_pdf=ROOT/old_pdf
  if not new_pdf.is_absolute(): new_pdf=ROOT/new_pdf
  old_doc=pymupdf.open(old_pdf); new_doc=pymupdf.open(new_pdf)
  assert len(old_doc)==len(new_doc)==1, cid
  assert tuple(round(v,3) for v in source_doc[index].rect)==tuple(round(v,3) for v in new_doc[0].rect), cid
  images=[render(source_doc,index,clip),render(old_doc,0,clip),render(new_doc,0,clip)]
  maxw=max(i.width for i in images); maxh=max(i.height for i in images)
  label_h=38; gap=8; margin=12
  canvas=Image.new('RGB',(maxw+margin*2,(maxh+label_h+gap)*3+margin*2),'#faf9f6')
  draw=ImageDraw.Draw(canvas); f=font(20)
  labels=['PDF-FONTE OFICIAL','EXPORTAÇÃO ANTIGA · lineHeight 1','EXPORTAÇÃO CORRIGIDA · derivada do PDF']
  yy=margin
  for label,img in zip(labels,images):
   draw.text((margin,yy+5),label,fill='#202124',font=f)
   yy+=label_h
   panel=Image.new('RGB',(maxw,maxh),'white')
   panel.paste(img,((maxw-img.width)//2,(maxh-img.height)//2))
   canvas.paste(panel,(margin,yy)); yy+=maxh+gap
  out_dir=new_root/'line-height-review'; out_dir.mkdir(parents=True,exist_ok=True)
  path=out_dir/f'{cid}-source-old-corrected.png'; canvas.save(path,optimize=True)
  def text(doc,page): return ' '.join(doc[page].get_text(clip=clip).split())
  source_text=text(source_doc,index); old_text=text(old_doc,0); new_text=text(new_doc,0)
  slot=json.loads((new_dir/'source-slot.json').read_text(encoding='utf-8'))
  left=slot.get('expectedLeftContext','').strip(); right=slot.get('expectedRightContext','').strip()
  result={
   'candidateId':cid,'page':pg,'sourceBlockId':block['id'],'clipPt':[clip.x0,clip.y0,clip.x1,clip.y1],
   'oldPdf':str(old_pdf.relative_to(ROOT)).replace('\\','/'),'newPdf':str(new_pdf.relative_to(ROOT)).replace('\\','/'),
   'newLineHeight':json.loads((new_dir/'source-line-height.json').read_text(encoding='utf-8')),
   'sourcePageCount':len(source_doc),'oldPdfPages':len(old_doc),'newPdfPages':len(new_doc),
   'sourcePageBoxMatchesNewPdf':source_doc[index].rect==new_doc[0].rect,
   'expectedLeftContextInSource':left in source_text,'expectedRightContextInSource':right in source_text,
   'expectedLeftContextInNewExport':left in new_text,'expectedRightContextInNewExport':right in new_text,
   'sourceText':source_text,'oldExportText':old_text,'newExportText':new_text,
   'comparisonImage':str(path.relative_to(ROOT)).replace('\\','/'),
  }
  (out_dir/f'{cid}-source-old-corrected.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  old_doc.close(); new_doc.close()
source_doc.close()
print(json.dumps({'groups':len(GROUPS),'candidates':sum(len(x[1]) for x in GROUPS.values()),'comparisons':'line-height-review/<candidate>-source-old-corrected.png'},indent=2))
