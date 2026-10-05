"""Remove only page 37's fixed compact STATUS capsule from its page artwork.

Preview is the default. `--apply` updates the page background after proving
that decoded pixels outside the source capsule crop remain byte-identical.
The capsule is then rendered as the semantic `tag.status` source composition.
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
PAGE_DIR = ROOT / 'apps/web/public/pages/page_037'
BACKGROUND = PAGE_DIR / 'background.webp'
PREVIEW = ROOT / 'tmp/page37-compact-status-background-preview.png'
EVIDENCE = ROOT / 'docs/project-progress/evidence/2026-10-05-inline-elements-followup/page37-compact-status-background.json'
DRAWING_ID = 109
EXPECTED_RECT = (243.9921112060547, 136.19219970703125, 288.6430969238281, 145.377197265625)


def repair(*, apply: bool) -> dict:
    with fitz.open(PDF) as document:
        page = document[36]
        drawings = page.get_drawings()
        drawing = drawings[DRAWING_ID]
        rect = fitz.Rect(drawing['rect'])
        if drawing['type'] != 'f' or max(abs(a-b) for a,b in zip(rect, EXPECTED_RECT)) > .002:
            raise ValueError(f'Refusing unexpected page-37 drawing {DRAWING_ID}: {rect}')

        # Keep the source image/layout intact while removing text and the exact
        # capsule path from the local texture sample.
        for block in page.get_text('blocks'):
            if len(block) >= 5 and block[4].strip():
                page.add_redact_annot(fitz.Rect(block[:4]), fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)
        page.add_redact_annot(rect + (-.02,-.02,.02,.02), fill=None)
        page.apply_redactions(images=0, graphics=1, text=0)
        if any(tuple(round(v,3) for v in item['rect']) == tuple(round(v,3) for v in rect)
            for item in page.get_drawings()):
            raise ValueError('Source capsule path remains after localized path removal')

        with Image.open(BACKGROUND) as image:
            old = image.convert('RGB')
        sx, sy = old.width/page.rect.width, old.height/page.rect.height
        pix = page.get_pixmap(matrix=fitz.Matrix(sx,sy), alpha=False)
        source_clean = Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        if source_clean.size != old.size:
            raise ValueError(f'Unexpected page asset dimensions: {source_clean.size} vs {old.size}')
        clean = old.copy()
        pad = .5
        box = (max(0,round((rect.x0-pad)*sx)),max(0,round((rect.y0-pad)*sy)),
            min(old.width,round((rect.x1+pad)*sx)),min(old.height,round((rect.y1+pad)*sy)))
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
            'page':37,
            'removedPdfDrawingIndex':DRAWING_ID,
            'removedDrawingBboxPt':list(rect),
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
