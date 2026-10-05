"""Compare page-47 DISCARD/EXHAUST semantic tags with the official PDF."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from xml.sax.saxutils import quoteattr

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from build_inline_symbol_registry import PDF  # noqa: E402

PAGE_DIR = ROOT / 'apps/web/public/pages/page_047'
OUT_DIR = ROOT / 'docs/project-progress/evidence/2026-10-05-inline-elements-followup'
REGISTRY = {item['id']: item for item in json.loads(
    (ROOT / 'apps/web/src/symbols/sourceSymbols.json').read_text(encoding='utf8'))}
SIDECAR = json.loads((PAGE_DIR / 'compound_elements.json').read_text(encoding='utf8'))
SCALE = 4


def render_paths(paths: list[dict], width: float, height: float, size: tuple[int,int]) -> Image.Image:
    source = ''.join('<path ' + ' '.join(f'{key}={quoteattr(str(value))}' for key,value in path.items()) + '/>'
        for path in paths)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size[0]}" height="{size[1]}" '
        f'viewBox="0 0 {width} {height}">{source}</svg>').encode()
    doc = fitz.open('svg', svg)
    pix = doc[0].get_pixmap(alpha=True)
    return Image.frombytes('RGBA', (pix.width,pix.height), pix.samples)


def main() -> None:
    report=[]; rows=[]
    with fitz.open(PDF) as document:
        source_page=document[46]
        background=Image.open(PAGE_DIR/'background.webp').convert('RGB')
        for element in SIDECAR['elements']:
            definition=REGISTRY[element['symbolId']]
            rect=fitz.Rect(element['bbox']); width,height=rect.width,rect.height
            pix=source_page.get_pixmap(matrix=fitz.Matrix(SCALE,SCALE),clip=rect,alpha=False)
            native=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
            variant=element['metrics'].get('renderVariant')
            visual=definition['render']['variants'][variant] if variant else definition['render']
            rendered=render_paths(visual['paths'],*visual['viewBox'][2:],native.size)
            sx,sy=background.width/source_page.rect.width,background.height/source_page.rect.height
            bg=background.transform(native.size,Image.Transform.EXTENT,
                (rect.x0*sx,rect.y0*sy,rect.x1*sx,rect.y1*sy),resample=Image.Resampling.BICUBIC)
            composed=Image.alpha_composite(bg.convert('RGBA'),rendered).convert('RGB')
            delta=np.abs(np.asarray(native,dtype=np.int16)-np.asarray(composed,dtype=np.int16))
            report.append({'page':47,'symbolId':element['symbolId'],'sourceBBoxPt':list(rect),
                'range':dict(block=element['anchor']['blockId'],line=element['anchor']['lineId'],
                    spanStartIndex=element['anchor']['spanStartIndex'],spanEndIndex=element['anchor']['spanEndIndex']),
                'nativeVsSemanticMeanAbsoluteChannelError':round(float(delta.mean()),4),
                'maxChannelError':int(delta.max()),'pixels':list(native.size)})
            zoom=3
            panels=[native.resize((native.width*zoom,native.height*zoom),Image.Resampling.NEAREST),
                composed.resize((composed.width*zoom,composed.height*zoom),Image.Resampling.NEAREST),
                Image.fromarray(np.uint8(np.clip(delta*4,0,255))).resize(
                    (native.width*zoom,native.height*zoom),Image.Resampling.NEAREST)]
            rows.append((element['symbolId'],panels))

    cell_w=max(panel.width for _,panels in rows for panel in panels)+16
    row_heights=[max(panel.height for panel in panels)+32 for _,panels in rows]
    sheet=Image.new('RGB',(cell_w*3,sum(row_heights)),'#dddddd');draw=ImageDraw.Draw(sheet);y=0
    for (symbol_id,panels),row_h in zip(rows,row_heights):
        draw.text((4,y+3),symbol_id,fill='black')
        for column,(label,panel) in enumerate(zip(['PDF','Semantic EN','4x diff'],panels)):
            x=column*cell_w+8;draw.text((x,y+16),label,fill='black');sheet.paste(panel,(x,y+31))
        y+=row_h
    OUT_DIR.mkdir(parents=True,exist_ok=True)
    (OUT_DIR/'page47-condition-capsules-source-comparison.json').write_text(
        json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    sheet.save(OUT_DIR/'page47-condition-capsules-source-comparison.png')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
