from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('output/proofs/translation-readiness-2026-10-14/native-vector-mask-p065-proof-v5')
OUT = ROOT / 'p065-target-state-comparison.png'
items = [
    ('Shield · empty', 'p065-v110-112-n3/capture/viewer-empty-clean-mask.png'),
    ('Shield · moved', 'p065-v110-112-n3/capture/viewer-moved-clean-mask.png'),
    ('Damage star · empty', 'p065-v115/capture/viewer-empty-clean-mask.png'),
    ('Damage star · moved', 'p065-v115/capture/viewer-moved-clean-mask.png'),
]
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 28)
panels = []
for label, relative in items:
    image = Image.open(ROOT / relative).convert('RGB')
    crop = image.crop((150, 1270, 950, 1480))
    crop = crop.resize((1200, 315), Image.Resampling.LANCZOS)
    panel = Image.new('RGB', (1200, 360), 'white')
    panel.paste(crop, (0, 45))
    ImageDraw.Draw(panel).text((12, 8), label, fill='black', font=font)
    panels.append(panel)
sheet = Image.new('RGB', (2400, 720), '#e5e5e5')
for index, panel in enumerate(panels):
    x = (index % 2) * 1200
    y = (index // 2) * 360
    sheet.paste(panel, (x, y))
sheet.save(OUT)
print(OUT.resolve())
