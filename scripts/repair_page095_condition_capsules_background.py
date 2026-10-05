"""Remove the fourteen page-95 condition capsules from the static raster.

Preview is the default. `--apply` patches only the fourteen measured capsule
regions from a source-PDF render with extracted text and their body paths
removed. Decoded pixels outside those crops must remain exactly unchanged.
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
PAGE_DIR = ROOT / 'apps/web/public/pages/page_095'
BACKGROUND = PAGE_DIR / 'background.webp'
PATCH_ASSET = PAGE_DIR / 'fidelity-overlay-condition-capsule-paper.png'
PREVIEW = ROOT / 'tmp/pdfs/page95-condition-capsules-background-preview.png'
EVIDENCE = ROOT / 'docs/project-progress/evidence/2026-10-05-inline-elements-followup/page95-condition-capsules-background.json'
TARGETS = {
    154: (155.0869140625, 85.0252685546875, 193.44090270996094, 94.21026611328125),
    162: (155.0869140625, 116.8455810546875, 197.7779083251953, 126.03057861328125),
    164: (155.0869140625, 147.7752685546875, 197.7779083251953, 156.96026611328125),
    166: (155.0869140625, 184.95989990234375, 197.7779083251953, 194.1448974609375),
    169: (155.0869140625, 285.7438659667969, 193.44090270996094, 294.9288635253906),
    175: (155.0869140625, 315.8192138671875, 197.7779083251953, 325.00421142578125),
    177: (155.0869140625, 397.61279296875, 197.7779083251953, 406.79779052734375),
    183: (155.0869140625, 427.5423583984375, 197.7779083251953, 436.72735595703125),
    194: (155.0869140625, 475.2506103515625, 193.44090270996094, 484.43560791015625),
    280: (519.9058837890625, 76.23919677734375, 558.2598876953125, 85.4241943359375),
    281: (519.9058837890625, 131.35159301757812, 558.2598876953125, 140.53659057617188),
    282: (519.9058837890625, 161.71420288085938, 558.2598876953125, 170.89920043945312),
    283: (519.9058837890625, 190.84201049804688, 558.2598876953125, 200.02700805664062),
    284: (519.9058837890625, 229.05029296875, 558.2598876953125, 238.23529052734375),
}


def repair(*, apply: bool) -> dict:
    with fitz.open(PDF) as document:
        page = document[94]
        drawings = page.get_drawings()
        rects = []
        for index, expected in TARGETS.items():
            drawing = drawings[index]
            rect = fitz.Rect(drawing['rect'])
            if drawing['type'] != 'f' or max(abs(a-b) for a,b in zip(rect, expected)) > .002:
                raise ValueError(f'Refusing unexpected page-95 drawing {index}: {rect}')
            rects.append(rect)

        for block in page.get_text('blocks'):
            if len(block) >= 5 and block[4].strip():
                page.add_redact_annot(fitz.Rect(block[:4]), fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)
        for rect in rects:
            page.add_redact_annot(rect + (-.02, -.02, .02, .02), fill=None)
        page.apply_redactions(images=0, graphics=1, text=0)

        remaining = page.get_drawings()
        for rect in rects:
            if any(max(abs(a-b) for a,b in zip(item['rect'], rect)) < .003 for item in remaining):
                raise ValueError(f'Source capsule path remains after localized removal: {rect}')

        with Image.open(BACKGROUND) as image:
            old = image.convert('RGB')
        sx, sy = old.width/page.rect.width, old.height/page.rect.height
        pix = page.get_pixmap(matrix=fitz.Matrix(sx, sy), alpha=False)
        source_clean = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        if source_clean.size != old.size:
            raise ValueError(f'Unexpected page asset dimensions: {source_clean.size} vs {old.size}')

        clean = old.copy()
        patch_image = Image.new('RGBA', old.size, (0, 0, 0, 0))
        boxes = []
        pad = .5
        for rect in rects:
            box = (max(0, round((rect.x0-pad)*sx)), max(0, round((rect.y0-pad)*sy)),
                min(old.width, round((rect.x1+pad)*sx)), min(old.height, round((rect.y1+pad)*sy)))
            crop = source_clean.crop(box)
            clean.paste(crop, box[:2])
            patch_image.paste(crop.convert('RGBA'), box[:2])
            boxes.append(box)

        mask = Image.new('L', old.size, 255)
        draw = ImageDraw.Draw(mask)
        for box in boxes:
            draw.rectangle(box, fill=0)
        patch_bounds = (
            min(box[0] for box in boxes), min(box[1] for box in boxes),
            max(box[2] for box in boxes), max(box[3] for box in boxes),
        )
        patch_crop = patch_image.crop(patch_bounds)
        diff = np.abs(np.asarray(old, dtype=np.int16)-np.asarray(clean, dtype=np.int16))
        outside = np.asarray(mask) > 0
        outside_mae = float(diff[outside].mean())
        inside_mae = float(diff[~outside].mean())
        if apply and outside_mae != 0:
            raise ValueError(f'Refusing write: changed pixels outside capsule crops ({outside_mae})')

        output = PREVIEW
        PREVIEW.parent.mkdir(parents=True, exist_ok=True)
        if apply:
            patch_crop.save(PATCH_ASSET, 'PNG', optimize=True)
            overlays_path = PAGE_DIR / 'fidelity_overlays.json'
            overlay_data = json.loads(overlays_path.read_text(encoding='utf8'))
            overlay_url = '/pages/page_095/fidelity-overlay-condition-capsule-paper.png'
            overlay_data['overlays'] = [overlay for overlay in overlay_data.get('overlays', [])
                if overlay.get('url') != overlay_url]
            overlay_data.setdefault('overlays', []).append({
                'url': overlay_url,
                'bbox': [patch_bounds[0]/sx, patch_bounds[1]/sy,
                    patch_bounds[2]/sx, patch_bounds[3]/sy],
                'widthPx': patch_crop.width,
                'heightPx': patch_crop.height,
                'languageInvariant': True,
                'zIndex': 2,
                'category': 'component-tag-background-repair',
                'sourcePdfPage': 95,
                'region': 'Paper patches under the fourteen semantic condition capsules',
            })
            overlays_path.write_text(json.dumps(overlay_data, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
            output = PATCH_ASSET
        else:
            clean.save(PREVIEW)
        report = {
            'page': 95,
            'removedPdfDrawingIndices': list(TARGETS),
            'removedDrawingBboxesPt': [list(rect) for rect in rects],
            'patchPixelBoxes': [list(box) for box in boxes],
            'outsideCapsulesMeanAbsoluteChannelChange': round(outside_mae, 4),
            'capsuleCropsMeanAbsoluteChannelChange': round(inside_mae, 4),
            'baseBackgroundAssetUnchanged': True,
            'transparentPatchAsset': str(PATCH_ASSET),
            'transparentPatchPixelBounds': list(patch_bounds),
            'output': str(output),
            'applied': apply,
        }
        EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
        EVIDENCE.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(repair(apply=args.apply), ensure_ascii=False, indent=2))
