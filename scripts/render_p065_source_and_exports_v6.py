from pathlib import Path
import fitz
from PIL import Image, ImageDraw, ImageFont

WORKSPACE = Path.cwd()
PROOF_ROOT = WORKSPACE / 'output/proofs/translation-readiness-2026-10-14/native-vector-mask-p065-proof-v6'
SOURCE_PDF = WORKSPACE.parent / 'Rulebook 1.2' / 'Rulebook 1p2 Final Version 05-19-23 Optimized.pdf'
OUT = PROOF_ROOT / 'p065-original-and-isolated-pdf-lower-left.png'
CLIP = fitz.Rect(75, 700, 430, 810)
PANELS = [
    ('Official source PDF · p.65', SOURCE_PDF, 64),
    ('Isolated export · p065-v110-112-n3', PROOF_ROOT / 'p065-v110-112-n3/p065-en-mask-v1.pdf', 0),
    ('Isolated export · p065-v115', PROOF_ROOT / 'p065-v115/p065-en-mask-v1.pdf', 0),
]
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 24)
panels = []
for label, path, page_index in PANELS:
    doc = fitz.open(path)
    page = doc[page_index]
    pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), clip=CLIP, alpha=False)
    crop = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    panel = Image.new('RGB', (crop.width, crop.height + 44), 'white')
    panel.paste(crop, (0, 44))
    ImageDraw.Draw(panel).text((10, 8), label, fill='black', font=font)
    panels.append(panel)
    doc.close()
height = max(panel.height for panel in panels)
sheet = Image.new('RGB', (sum(panel.width for panel in panels), height), '#ddd')
x = 0
for panel in panels:
    sheet.paste(panel, (x, 0))
    x += panel.width
sheet.save(OUT)
print(OUT.resolve())
