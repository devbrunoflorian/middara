"""Remove only page 47's two fixed condition-tag capsules from background.webp.

Preview is the default. `--apply` writes source-PDF texture patches only after
proving that decoded pixels outside the measured capsule regions stay exact.
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
PAGE_DIR = ROOT / 'apps/web/public/pages/page_047'
BACKGROUND = PAGE_DIR / 'background.webp'
PREVIEW = ROOT / 'tmp/pdfs/page47-condition-capsules-background-preview.png'
EVIDENCE = ROOT / 'docs/project-progress/evidence/2026-10-05-inline-elements-followup/page47-condition-capsules-background.json'
TARGETS = {
    101: (228.91329956054688, 157.76373291015625, 288.13531494140625, 173.8267364501953),
    102: (302.5857849121094, 157.76373291015625, 365.0557861328125, 173.8267364501953),
}


def repair(*, apply: bool) -> dict:
    with fitz.open(PDF) as document:
        page = document[46]
        drawings = page.get_drawings()
        rects = []
        for index, expected in TARGETS.items():
            drawing = drawings[index]
            rect = fitz.Rect(drawing['rect'])
            if drawing['type'] != 'f' or max(abs(a-b) for a,b in zip(rect, expected)) > .002:
                raise ValueError(f'Refusing unexpected page-47 drawing {index}: {rect}')
            rects.append(rect)

        # Remove all text from the temporary source patch so only the original
        # paper texture is pasted into the app background.
        for block in page.get_text('blocks'):
            if len(block) >= 5 and block[4].strip():
                page.add_redact_annot(fitz.Rect(block[:4]), fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)

        # 101 is the DISCARD pill. The EXHAUST pill at 102 also owns its
        # separately drawn white arrow (drawing 103), which must leave too.
        for index in TARGETS:
            page.add_redact_annot(drawings[index]['rect'] + (-.02,-.02,.02,.02), fill=None)
            page.apply_redactions(images=0, graphics=1, text=0)
        remaining = page.get_drawings()
        for index in TARGETS:
            target = fitz.Rect(drawings[index]['rect'])
            if any(tuple(round(v,3) for v in item['rect']) == tuple(round(v,3) for v in target)
                for item in remaining):
                raise ValueError(f'Source capsule path remains after removing drawing {index}')
        exhaust_arrow = fitz.Rect(drawings[103]['rect'])
        if any(tuple(round(v,3) for v in item['rect']) == tuple(round(v,3) for v in exhaust_arrow)
            for item in remaining):
            raise ValueError('The EXHAUST foreground vector remains after localized removal')

        with Image.open(BACKGROUND) as image:
            old = image.convert('RGB')
        sx, sy = old.width/page.rect.width, old.height/page.rect.height
        pix = page.get_pixmap(matrix=fitz.Matrix(sx,sy), alpha=False)
        source_clean = Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        if source_clean.size != old.size:
            raise ValueError(f'Unexpected page asset dimensions: {source_clean.size} vs {old.size}')
        clean = old.copy()
        boxes = []
        for rect in rects:
            pad = .5
            box = (max(0,round((rect.x0-pad)*sx)),max(0,round((rect.y0-pad)*sy)),
                min(old.width,round((rect.x1+pad)*sx)),min(old.height,round((rect.y1+pad)*sy)))
            clean.paste(source_clean.crop(box),box[:2])
            boxes.append(list(box))

        mask=Image.new('L',old.size,255); draw=ImageDraw.Draw(mask)
        for box in boxes: draw.rectangle(box,fill=0)
        diff=np.abs(np.asarray(old,dtype=np.int16)-np.asarray(clean,dtype=np.int16))
        outside=np.asarray(mask)>0
        outside_mae=float(diff[outside].mean())
        inside_mae=float(diff[~outside].mean())
        if apply and outside_mae != 0:
            raise ValueError(f'Refusing write: changed pixels outside measured capsule crops ({outside_mae})')

        output=PREVIEW
        PREVIEW.parent.mkdir(parents=True,exist_ok=True)
        if apply:
            clean.save(BACKGROUND,'WEBP',lossless=True,method=4)
            output=BACKGROUND
        else:
            clean.save(PREVIEW)
        report={
            'page':47,
            'removedPdfDrawingIndices':[101,102,103],
            'removedCapsuleBboxesPt':[list(rect) for rect in rects],
            'patchPixelBoxes':boxes,
            'outsideCapsulesMeanAbsoluteChannelChange':round(outside_mae,4),
            'capsuleCropsMeanAbsoluteChannelChange':round(inside_mae,4),
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
