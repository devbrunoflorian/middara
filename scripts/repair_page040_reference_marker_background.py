"""Move the ten fixed page-40 A-D reference tiles out of the page raster."""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
PAGE_DIR = ROOT / 'apps/web/public/pages/page_040'
BACKGROUND = PAGE_DIR / 'background.webp'
PATCH_ASSET = PAGE_DIR / 'fidelity-overlay-reference-markers-paper.png'
PREVIEW = ROOT / 'tmp/pdfs/page40-reference-markers-background-preview.png'
EVIDENCE = ROOT / 'docs/project-progress/evidence/2026-10-05-inline-elements-followup/page40-reference-markers-background.json'
TARGETS = {
    97: (390.7929992675781, 328.08001708984375, 400.78900146484375, 338.0760192871094),
    98: (620.2186889648438, 328.08001708984375, 630.2146606445312, 338.0760192871094),
    99: (236.8531036376953, 344.7492980957031, 246.84910583496094, 354.74530029296875),
    100: (556.1791381835938, 344.7492980957031, 566.1751098632812, 354.74530029296875),
    101: (234.45350646972656, 355.7492980957031, 244.4495086669922, 365.74530029296875),
    102: (160.7633056640625, 372.4186096191406, 170.75930786132812, 382.41461181640625),
    103: (442.38348388671875, 394.4186096191406, 452.3794860839844, 404.41461181640625),
    104: (185.45339965820312, 405.4186096191406, 195.44940185546875, 415.41461181640625),
    135: (586.1011962890625, 725.3963012695312, 596.09716796875, 735.3922729492188),
    136: (502.54779052734375, 759.3963012695312, 512.5438232421875, 769.3922729492188),
}
LETTER_BBOXES = {
    97: (393.2030029296875, 328.6419982910156, 398.09100341796875, 338.1780090332031),
    98: (621.960693359375, 328.6419982910156, 628.1846923828125, 338.1780090332031),
    99: (239.26319885253906, 345.3113098144531, 244.1511993408203, 354.8473205566406),
    100: (558.3651123046875, 345.3113098144531, 563.7011108398438, 354.8473205566406),
    101: (236.19549560546875, 356.3113098144531, 242.41949462890625, 365.8473205566406),
    102: (163.1732940673828, 372.9805908203125, 168.06129455566406, 382.5166015625),
    103: (444.5694885253906, 394.9805908203125, 449.9054870605469, 404.5166015625),
    104: (187.63949584960938, 405.9805908203125, 192.97549438476562, 415.5166015625),
    135: (588.2872924804688, 725.9583129882812, 593.623291015625, 735.4943237304688),
    136: (504.9578857421875, 759.9583129882812, 509.84588623046875, 769.4943237304688),
}


def repair(*, apply: bool) -> dict:
    with fitz.open(PDF) as document:
        page = document[39]
        drawings = page.get_drawings()
        boxes = []
        for index, expected in TARGETS.items():
            drawing = drawings[index]
            rect = fitz.Rect(drawing['rect'])
            if drawing['type'] != 'f' or tuple(round(value, 3) for value in drawing['fill']) != (1.0, 1.0, 1.0):
                raise ValueError(f'Refusing unexpected page-40 marker tile drawing {index}: {drawing}')
            if max(abs(a-b) for a,b in zip(rect, expected)) > .002:
                raise ValueError(f'Refusing unexpected page-40 marker geometry {index}: {rect}')
            boxes.append(rect)
            glyph = fitz.Rect(LETTER_BBOXES[index])
            if not rect.intersects(glyph):
                raise ValueError(f'Letter and tile no longer overlap for drawing {index}: {rect} / {glyph}')

        for block in page.get_text('blocks'):
            if len(block) >= 5 and block[4].strip():
                page.add_redact_annot(fitz.Rect(block[:4]), fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)
        for rect in boxes:
            page.add_redact_annot(rect+(-.02,-.02,.02,.02), fill=None)
        page.apply_redactions(images=0, graphics=1, text=0)
        remaining = page.get_drawings()
        for rect in boxes:
            if any(max(abs(a-b) for a,b in zip(drawing['rect'],rect)) < .003 for drawing in remaining):
                raise ValueError(f'Source marker tile remains after localized removal: {rect}')

        with Image.open(BACKGROUND) as background_file:
            old = background_file.convert('RGB')
        sx, sy = old.width/page.rect.width, old.height/page.rect.height
        pix = page.get_pixmap(matrix=fitz.Matrix(sx,sy), alpha=False)
        source_clean = Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        if source_clean.size != old.size:
            raise ValueError(f'Unexpected page background size {old.size} vs cleaned source {source_clean.size}')

        composite = old.copy()
        patch_full = Image.new('RGBA',old.size,(0,0,0,0))
        patch_boxes=[]
        for tile,letter in zip(boxes,LETTER_BBOXES.values()):
            union=tile | fitz.Rect(letter)
            # Leave enough paper around each marker to erase antialiasing and,
            # on the last two, the red raster rectangles hidden under the tile.
            patch_pad=4.0
            box=(max(0,round((union.x0-patch_pad)*sx)),max(0,round((union.y0-patch_pad)*sy)),
                min(old.width,round((union.x1+patch_pad)*sx)),min(old.height,round((union.y1+patch_pad)*sy)))
            crop=source_clean.crop(box)
            if len(patch_boxes) >= 8:
                # The two lower tiles conceal red rectangles baked into the
                # raster artwork. Removing the PDF vector reveals those ghosts,
                # so reconstruct only this tiny paper region from its boundary.
                halo=8
                mask_box=(max(0,math.floor(tile.x0*sx)-halo),max(0,math.floor(tile.y0*sy)-halo),
                    min(old.width,math.ceil(tile.x1*sx)+halo),min(old.height,math.ceil(tile.y1*sy)+halo))
                local=old.crop(mask_box).convert('RGB')
                pixels=np.asarray(local,dtype=np.float64).copy()
                fill=np.zeros(pixels.shape[:2],dtype=bool)
                fill[:]=True
                fill[0,:]=fill[-1,:]=False;fill[:,0]=fill[:,-1]=False
                for _ in range(1800):
                    prior=pixels.copy()
                    pixels[1:-1,1:-1]=(prior[:-2,1:-1]+prior[2:,1:-1]+
                        prior[1:-1,:-2]+prior[1:-1,2:])/4
                    pixels[~fill]=prior[~fill]
                    if float(np.max(np.abs(pixels-prior))) < .015:
                        break
                inpaint=Image.fromarray(np.uint8(np.clip(np.rint(pixels),0,255)))
                composite.paste(inpaint,mask_box[:2])
                patch_full.paste(inpaint.convert('RGBA'),mask_box[:2])
                # Preserve the clean PDF-rendered paper outside the red-box mask.
                composite.paste(crop,box[:2])
                patch_full.paste(crop.convert('RGBA'),box[:2])
                # Reapply the inpainted rectangle over the red/white raster tile.
                composite.paste(inpaint,mask_box[:2])
                patch_full.paste(inpaint.convert('RGBA'),mask_box[:2])
            else:
                composite.paste(crop,box[:2])
                patch_full.paste(crop.convert('RGBA'),box[:2])
            patch_boxes.append(box)

        bounds=(min(box[0] for box in patch_boxes),min(box[1] for box in patch_boxes),
            max(box[2] for box in patch_boxes),max(box[3] for box in patch_boxes))
        mask=Image.new('L',old.size,255);draw=ImageDraw.Draw(mask)
        for box in patch_boxes:draw.rectangle(box,fill=0)
        diff=np.abs(np.asarray(old,dtype=np.int16)-np.asarray(composite,dtype=np.int16))
        outside=np.asarray(mask)>0
        outside_mae=float(diff[outside].mean());inside_mae=float(diff[~outside].mean())
        if apply and outside_mae != 0:
            raise ValueError(f'Refusing patch: pixels outside the ten references changed ({outside_mae})')

        patch_crop=patch_full.crop(bounds)
        output=PREVIEW
        PREVIEW.parent.mkdir(parents=True,exist_ok=True)
        if apply:
            patch_crop.save(PATCH_ASSET,'PNG',optimize=True)
            overlay_path=PAGE_DIR/'fidelity_overlays.json'
            if overlay_path.exists():
                overlay_data=json.loads(overlay_path.read_text(encoding='utf8'))
            else:
                overlay_data={'overlays':[]}
            url='/pages/page_040/fidelity-overlay-reference-markers-paper.png'
            overlay_data['overlays']=[overlay for overlay in overlay_data.get('overlays',[]) if overlay.get('url')!=url]
            overlay_data['overlays'].append({
                'url':url,
                'bbox':[bounds[0]/sx,bounds[1]/sy,bounds[2]/sx,bounds[3]/sy],
                'widthPx':patch_crop.width,'heightPx':patch_crop.height,
                'languageInvariant':True,'zIndex':2,
                'category':'component-reference-marker-background-repair',
                'sourcePdfPage':40,
                'region':'Paper patches beneath ten semantic A-D reference markers',
            })
            overlay_path.write_text(json.dumps(overlay_data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
            output=PATCH_ASSET
        else:
            composite.save(PREVIEW)

        report={
            'page':40,'pdfPageIndex':39,
            'removedDrawingIndices':list(TARGETS),
            'sourceTileBboxesPt':[list(rect) for rect in boxes],
            'patchPixelBoxes':[list(box) for box in patch_boxes],
            'transparentPatchPixelBounds':list(bounds),
            'outsideMarkerMeanAbsoluteChannelChange':round(outside_mae,4),
            'markerRegionsMeanAbsoluteChannelChange':round(inside_mae,4),
            'baseBackgroundAssetUnchanged':True,
            'transparentPatchAsset':str(PATCH_ASSET),
            'output':str(output),'applied':apply,
        }
        EVIDENCE.parent.mkdir(parents=True,exist_ok=True)
        EVIDENCE.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    print(json.dumps(repair(apply=args.apply),ensure_ascii=False,indent=2))
