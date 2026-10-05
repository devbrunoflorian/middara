"""Remove page 70's visible compact EXHAUST capsule from background.webp.

Preview is the default. `--apply` replaces only the measured body/arrow crop
with the original paper texture, after proving decoded pixels outside it stay
exactly unchanged. Invisible source extractions are left alone.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
PAGE_DIR = ROOT / 'apps/web/public/pages/page_070'
BACKGROUND = PAGE_DIR / 'background.webp'
PREVIEW = ROOT / 'tmp/pdfs/page70-exhaust-background-preview.png'
EVIDENCE = ROOT / 'docs/project-progress/evidence/2026-10-05-inline-elements-followup/page70-exhaust-background.json'
TARGETS = {
    188: (272.79730224609375, 570.8878784179688, 319.2807312011719, 579.8575439453125),
    189: (276.47784423828125, 572.6134643554688, 282.9222412109375, 578.2120361328125),
}


def repair(*, apply: bool) -> dict:
    with fitz.open(PDF) as document:
        page = document[69]
        drawings = page.get_drawings()
        rects = []
        for index, expected in TARGETS.items():
            drawing = drawings[index]
            rect = fitz.Rect(drawing['rect'])
            if drawing['type'] != 'f' or max(abs(a-b) for a,b in zip(rect, expected)) > .002:
                raise ValueError(f'Refusing unexpected page-70 drawing {index}: {rect}')
            rects.append(rect)

        for block in page.get_text('blocks'):
            if len(block) >= 5 and block[4].strip():
                page.add_redact_annot(fitz.Rect(block[:4]), fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)
        for index in TARGETS:
            page.add_redact_annot(drawings[index]['rect'] + (-.02,-.02,.02,.02), fill=None)
            page.apply_redactions(images=0, graphics=1, text=0)
        remaining = page.get_drawings()
        for rect in rects:
            if any(tuple(round(v,3) for v in item['rect']) == tuple(round(v,3) for v in rect)
                for item in remaining):
                raise ValueError(f'Source component remains after localized removal: {rect}')

        with Image.open(BACKGROUND) as image:
            old = image.convert('RGB')
        sx, sy = old.width/page.rect.width, old.height/page.rect.height
        pix = page.get_pixmap(matrix=fitz.Matrix(sx,sy), alpha=False)
        source_clean = Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        if source_clean.size != old.size:
            raise ValueError(f'Unexpected page asset dimensions: {source_clean.size} vs {old.size}')
        clean = old.copy()
        union = rects[0] | rects[1]
        pad = .5
        box = (max(0,round((union.x0-pad)*sx)),max(0,round((union.y0-pad)*sy)),
            min(old.width,round((union.x1+pad)*sx)),min(old.height,round((union.y1+pad)*sy)))
        clean.paste(source_clean.crop(box),box[:2])

        mask=Image.new('L',old.size,255); draw=ImageDraw.Draw(mask); draw.rectangle(box,fill=0)
        diff=np.abs(np.asarray(old,dtype=np.int16)-np.asarray(clean,dtype=np.int16))
        outside=np.asarray(mask)>0
        outside_mae=float(diff[outside].mean())
        inside_mae=float(diff[~outside].mean())
        if apply and outside_mae != 0:
            raise ValueError(f'Refusing write: changed pixels outside measured capsule crop ({outside_mae})')

        output=PREVIEW
        PREVIEW.parent.mkdir(parents=True,exist_ok=True)
        if apply:
            clean.save(BACKGROUND,'WEBP',lossless=True,method=4)
            output=BACKGROUND
        else:
            clean.save(PREVIEW)
        report={
            'page':70,
            'removedPdfDrawingIndices':list(TARGETS),
            'removedDrawingBboxesPt':[list(rect) for rect in rects],
            'patchPixelBox':list(box),
            'outsideCapsuleMeanAbsoluteChannelChange':round(outside_mae,4),
            'capsuleCropMeanAbsoluteChannelChange':round(inside_mae,4),
            'output':str(output),
            'applied':apply,
        }
        EVIDENCE.parent.mkdir(parents=True,exist_ok=True)
        EVIDENCE.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        return report


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    print(json.dumps(repair(apply=args.apply),ensure_ascii=False,indent=2))
