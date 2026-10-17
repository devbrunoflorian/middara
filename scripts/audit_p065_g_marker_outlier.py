from hashlib import sha256
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path.cwd()
PROOF = ROOT / 'output/proofs/translation-readiness-2026-10-14/native-vector-mask-p065-proof-v5'
SOURCE = ROOT.parent / 'Rulebook 1.2' / 'Rulebook 1p2 Final Version 05-19-23 Optimized.pdf'
PDFS = [
    ('official-source', SOURCE, 64),
    ('isolated-p065-v110', PROOF / 'p065-v110-112-n3/p065-en-mask-v1.pdf', 0),
    ('isolated-p065-v115', PROOF / 'p065-v115/p065-en-mask-v1.pdf', 0),
]
REGION = pymupdf.Rect(210, 765, 245, 795)
records = []
panels = []
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
for label, pdf_path, page_index in PDFS:
    doc = pymupdf.open(pdf_path)
    page = doc[page_index]
    words = [w for w in page.get_text('words') if 'G' in w[4] and w[1] > 760]
    spans = [
        {'text': span['text'], 'bbox': [round(v, 4) for v in span['bbox']], 'font': span['font'], 'size': span['size']}
        for block in page.get_text('dict')['blocks'] if 'lines' in block
        for line in block['lines'] for span in line['spans']
        if 'G' in span['text'] and span['bbox'][1] > 760
    ]
    drawings = [
        {'rect': [round(v, 4) for v in draw['rect']], 'fill': draw['fill'], 'color': draw['color'], 'width': draw['width'], 'type': draw['type']}
        for draw in page.get_drawings()
        if draw['rect'].intersects(REGION)
    ]
    bboxlog = []
    for entry in page.get_bboxlog(layers=True):
        kind, rect = entry[:2]
        layer = entry[2] if len(entry) > 2 else None
        if rect and pymupdf.Rect(rect).intersects(REGION):
            bboxlog.append({'type': kind, 'rect': [round(v, 4) for v in rect], 'layer': layer})
    pix = page.get_pixmap(matrix=pymupdf.Matrix(12, 12), clip=REGION, alpha=False)
    crop = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    panel = Image.new('RGB', (crop.width, crop.height + 40), 'white')
    panel.paste(crop, (0, 40))
    ImageDraw.Draw(panel).text((8, 8), label, fill='black', font=font)
    panels.append(panel)
    records.append({
        'label': label,
        'pdf': str(pdf_path),
        'pageIndex': page_index,
        'pageRect': [page.rect.x0, page.rect.y0, page.rect.x1, page.rect.y1],
        'pdfSha256': sha256(pdf_path.read_bytes()).hexdigest(),
        'textSpansContainingG': spans,
        'wordsContainingG': words,
        'drawingsIntersectingSourceGRegion': drawings,
        'bboxLogIntersectingSourceGRegion': bboxlog,
        'imageCount': len(page.get_image_info(xrefs=True)),
        'renderClipPt': list(REGION),
    })
    doc.close()

sheet = Image.new('RGB', (sum(p.width for p in panels), max(p.height for p in panels)), '#ddd')
x = 0
for panel in panels:
    sheet.paste(panel, (x, 0))
    x += panel.width
image_path = PROOF / 'p065-g-marker-source-vs-export-zoom.png'
sheet.save(image_path)
report = {
    'status': 'outlier confirmed; no remediation attempted',
    'scope': 'Only the visible boxed G marker at the end of the p.65 damage paragraph; this is separate from the two proved vector placements.',
    'sourcePdfSha256': sha256(SOURCE.read_bytes()).hexdigest(),
    'sourceExpectedVectorBoxPt': [223.0206, 776.7782, 233.0167, 786.7782],
    'sourceExpectedGlyphPt': [224.7628, 777.3441, 230.9868, 786.8801],
    'comparison': records,
    'interpretation': 'In the official PDF, the filled vector box encloses the G glyph. The isolated exports reflow the G text upward while the box remains at the source-paint location, visibly separating the two. This outlier is not in the frozen 111 placement IDs and must not be silently included or corrected by guesswork.',
    'evidenceImage': str(image_path),
    'canonicalWrites': 0,
    'payloadWrites': 0,
    'translationWrites': 0,
}
report_path = PROOF / 'p065-g-marker-outlier.json'
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'report': str(report_path), 'image': str(image_path), 'source': records[0], 'exports': records[1:]}, ensure_ascii=False, indent=2))
