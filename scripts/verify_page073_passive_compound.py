"""Compare page 73's semantic PASSIVE capsule against the official PDF crop."""
from __future__ import annotations

import json
from pathlib import Path
from xml.sax.saxutils import quoteattr

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
PAGE_DIR = ROOT / 'apps/web/public/pages/page_073'
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
    if len(SIDECAR['elements']) != 1:
        raise ValueError('Expected exactly one page-73 compound capsule')
    element = SIDECAR['elements'][0]
    if element['symbolId'] != 'tag.passive' or element['metrics'].get('renderVariant') != 'prose-8pt':
        raise ValueError(f"Unexpected page-73 semantic element: {element}")
    definition = REGISTRY[element['symbolId']]
    variant = definition['render']['variants'][element['metrics']['renderVariant']]
    rect = fitz.Rect(element['bbox'])

    with fitz.open(PDF) as document, Image.open(PAGE_DIR / 'background.webp') as background_file:
        source_page = document[72]
        pix = source_page.get_pixmap(matrix=fitz.Matrix(SCALE,SCALE),clip=rect,alpha=False)
        native = Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        background = background_file.convert('RGB')
        sx,sy=background.width/source_page.rect.width,background.height/source_page.rect.height
        bg=background.transform(native.size,Image.Transform.EXTENT,
            (rect.x0*sx,rect.y0*sy,rect.x1*sx,rect.y1*sy),resample=Image.Resampling.BICUBIC)
        rendered=render_paths(variant['paths'],*variant['viewBox'][2:],native.size)
        composed=Image.alpha_composite(bg.convert('RGBA'),rendered).convert('RGB')
        delta=np.abs(np.asarray(native,dtype=np.int16)-np.asarray(composed,dtype=np.int16))

    zoom=5
    panels=[native.resize((native.width*zoom,native.height*zoom),Image.Resampling.NEAREST),
        composed.resize((composed.width*zoom,composed.height*zoom),Image.Resampling.NEAREST),
        Image.fromarray(np.uint8(np.clip(delta*4,0,255))).resize(
            (native.width*zoom,native.height*zoom),Image.Resampling.NEAREST)]
    sheet=Image.new('RGB',(max(p.width for p in panels),sum(p.height for p in panels)+60),'#ddd')
    draw=ImageDraw.Draw(sheet); y=0
    for label,panel in zip(['PDF original','Semantic EN composed over patched page background','4x channel difference'],panels):
        draw.text((4,y+2),label,fill='black');y+=22
        sheet.paste(panel,(0,y));y+=panel.height
    out_png=OUT_DIR/'page73-passive-source-comparison.png'
    out_json=OUT_DIR/'page73-passive-source-comparison.json'
    OUT_DIR.mkdir(parents=True,exist_ok=True)
    sheet.save(out_png)
    report={
        'page':73,'symbolId':'tag.passive','variant':'prose-8pt','sizePt':element['sizePt'],
        'sourceBBoxPt':list(rect),'pdfDrawingIndex':218,
        'sourceGlyph':'ZapfDingbatsStd U+2724','sourceLabel':'OptimaLTStd-DemiBold 8 pt',
        'anchor':element['anchor'],
        'nativeVsSemanticMeanAbsoluteChannelError':round(float(delta.mean()),4),
        'maxChannelError':int(delta.max()),'nativeCropPx':list(native.size),
        'comparisonPng':str(out_png),
    }
    out_json.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
