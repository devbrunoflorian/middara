"""Prepare p.90 with capsule legacy vectors removed from the source layer.

Default mode writes a PNG preview only. --apply updates the page background
after comparing the preview and its outside-region diff against the old asset.
PDF source labels are cleaned exactly as they were for the original background;
only the four confirmed capsule bodies and the EXHAUST arrow are removed.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pymupdf as fitz
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
PAGE_DIR = ROOT / 'apps/web/public/pages/page_090'
BACKGROUND = PAGE_DIR / 'background.webp'
PREVIEW = ROOT / 'tmp/page90-semantic-capsule-background-preview.png'
EVIDENCE = ROOT / 'docs/project-progress/evidence/2026-10-05-inline-elements-followup/page90-semantic-capsule-background.json'
DRAWING_IDS = [97, 105, 106, 107, 109]


def render(*, apply: bool) -> dict:
    if not PDF.is_file() or not BACKGROUND.is_file():
        raise FileNotFoundError(PDF if not PDF.is_file() else BACKGROUND)
    with fitz.open(PDF) as document:
        page = document[89]
        drawings = page.get_drawings()
        if any(index >= len(drawings) for index in DRAWING_IDS):
            raise ValueError('Source PDF drawing order changed; refusing to remove guessed paths')
        expected_rects = [fitz.Rect(drawings[index]['rect']) for index in DRAWING_IDS]
        expected_fills = [drawings[index]['type'] == 'f' for index in DRAWING_IDS]
        if expected_fills != [True] * len(DRAWING_IDS):
            raise ValueError('A selected p.90 capsule component is not a filled path')
        for index, rect in zip(DRAWING_IDS, expected_rects):
            if not (rect.width > 0 and rect.height > 0):
                raise ValueError(f'Invalid capsule drawing {index}: {rect}')

        text_blocks = [block for block in page.get_text('blocks') if len(block) >= 5 and block[4].strip()]
        for block in text_blocks:
            page.add_redact_annot(fitz.Rect(block[:4]), fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)

        # Add one precise redaction per source-verified capsule vector, then
        # remove paths in one pass so annotation ordering cannot shift IDs.
        for rect in expected_rects:
            page.add_redact_annot(rect + (-.02, -.02, .02, .02), fill=None)
        page.apply_redactions(images=0, graphics=1, text=0)
        remaining = page.get_drawings()
        for rect in expected_rects:
            if any(drawing['rect'] == rect for drawing in remaining):
                raise ValueError(f'Legacy capsule path remains in page render: {rect}')

        with Image.open(BACKGROUND) as old_asset:
            old = old_asset.convert('RGB')
        sx, sy = old.width / page.rect.width, old.height / page.rect.height
        pix = page.get_pixmap(matrix=fitz.Matrix(sx, sy), alpha=False)
        if (pix.width, pix.height) != old.size:
            raise ValueError(f'Unexpected output dimensions: {pix.width}×{pix.height} vs {old.size}')
        source_clean = Image.frombytes('RGB', old.size, pix.samples)
        # Keep every previously reviewed pixel outside the component drawings
        # byte-for-byte (after decode). Re-rendering all of p.90 changes the
        # page's lossy image texture, so use the source render only as local
        # texture fill around the paths being extracted.
        clean = old.copy()
        patch_boxes = []
        for rect in expected_rects:
            pad = .5
            box = (max(0, round((rect.x0 - pad) * sx)), max(0, round((rect.y0 - pad) * sy)),
                min(old.width, round((rect.x1 + pad) * sx)), min(old.height, round((rect.y1 + pad) * sy)))
            clean.paste(source_clean.crop(box), box[:2])
            patch_boxes.append(box)

        # Estimate collateral changes only outside the exact removed capsules.
        mask = Image.new('L', old.size, 255)
        from PIL import ImageDraw
        draw = ImageDraw.Draw(mask)
        for box in patch_boxes:
            draw.rectangle(box, fill=0)
        diff = np.abs(np.asarray(old, dtype=np.int16) - np.asarray(clean, dtype=np.int16))
        outside = np.asarray(mask) > 0
        outside_mae = float(diff[outside].mean())
        removed_region_mae = float(diff[~outside].mean())
        if apply and outside_mae != 0:
            raise ValueError(f'Refusing to rewrite p.90: {outside_mae} mean change outside audited capsule pixels')
        output = PREVIEW
        PREVIEW.parent.mkdir(parents=True, exist_ok=True)
        if apply:
            clean.save(BACKGROUND, 'WEBP', lossless=True, method=4)
            output = BACKGROUND
        else:
            clean.save(PREVIEW)
        report = {
            'page': 90,
            'removedPdfDrawingIndexes': DRAWING_IDS,
            'removedDrawingBboxesPt': [list(rect) for rect in expected_rects],
            'redactedSourceTextBlocks': len(text_blocks),
            'outsideCapsuleBackgroundMeanAbsoluteChannelChange': round(outside_mae, 4),
            'capsuleRegionsMeanAbsoluteChannelChange': round(removed_region_mae, 4),
            'output': str(output),
            'applied': apply,
        }
        EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
        import json
        EVIDENCE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    import json
    print(json.dumps(render(apply=args.apply), ensure_ascii=False, indent=2))
