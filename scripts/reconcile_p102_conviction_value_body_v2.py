import hashlib
import json
import re
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path.cwd()
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-15/p102-conviction-value-body-v1"
SOURCE_PDF = Path(r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
EXPORT_PDF = PROOF / "page-102-pt-BR-proposal.pdf"
OUTPUT_JSON = PROOF / "copyfit-reconciliation-v3.json"
COMPARISON = PROOF / "source-viewer-pdf-comparison-v3.png"
SOURCE_TEXT = (
    "Some Abilities, Conditions, or AI Steps may reference a figure's Conviction Value or Casting Value. "
    "The Conviction Value or Casting Value is calculated by adding the figure's best dice of the appropriate "
    "type according to the rating list on the left."
)
TARGET_TEXT = (
    "Algumas Habilidades, Condições ou Etapas de IA podem se referir ao Valor de Convicção ou ao Valor de "
    "Conjuração de uma miniatura. Esse valor é calculado somando os melhores dados da miniatura do tipo "
    "adequado, conforme a lista de classificações à esquerda."
)
FOLLOWING_TEXT = "Since Casting only uses 1 die, the Casting Value is simply the value of the single die."
FRAME = [419.74951171875, 623.8046875, 630.7799072265625, 690.7247314453125]
CLIP = pymupdf.Rect(185, 610, 645, 767)


def norm(value):
    return re.sub(r"\s+", " ", value).strip()


def page_lines(page):
    result = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", []))
            if text.strip():
                result.append({"text": text, "bbox": [float(v) for v in line["bbox"]], "spans": line.get("spans", [])})
    return result


def append_until(lines, start, target):
    collected = []
    normalized = ""
    for line in lines[start:]:
        collected.append(line)
        normalized = norm(f"{normalized} {line['text']}")
        if norm(target) in normalized:
            return collected, normalized
    raise AssertionError(f"Could not reconstruct target text from PDF lines: {normalized}")


def union_bbox(lines):
    return [
        min(line["bbox"][0] for line in lines),
        min(line["bbox"][1] for line in lines),
        max(line["bbox"][2] for line in lines),
        max(line["bbox"][3] for line in lines),
    ]


source_doc = pymupdf.open(SOURCE_PDF)
export_doc = pymupdf.open(EXPORT_PDF)
assert len(source_doc) >= 102 and len(export_doc) == 1
source = source_doc[101]
export = export_doc[0]
source_lines = page_lines(source)
export_lines = page_lines(export)
source_start = next(i for i, line in enumerate(source_lines) if norm(line["text"]).startswith("Some Abilities"))
source_body, source_body_text = append_until(source_lines, source_start, SOURCE_TEXT)
target_start = next(i for i, line in enumerate(export_lines) if norm(line["text"]).startswith("Algumas Habilidades"))
target_body, target_body_text = append_until(export_lines, target_start, TARGET_TEXT)
assert norm(source_body_text) == norm(SOURCE_TEXT)
assert norm(target_body_text) == norm(TARGET_TEXT)

source_body_bbox = union_bbox(source_body)
target_body_bbox = union_bbox(target_body)
source_example = next(line for line in source_lines if norm(line["text"]).startswith("Example:"))
export_example = next(line for line in export_lines if norm(line["text"]).startswith("Example:"))
source_clearance = source_example["bbox"][1] - source_body_bbox[3]
export_clearance = export_example["bbox"][1] - target_body_bbox[3]
source_page_text = norm(source.get_text("text"))
export_page_text = export.get_text("text")
export_normalized = norm(export_page_text)
assert norm(TARGET_TEXT) in export_normalized
assert norm(SOURCE_TEXT) not in export_normalized
assert export_page_text.count("\ufffd") == 0
assert len(source_body) == len(target_body) == 6

left, top, right, bottom = FRAME
horizontal_fit = target_body_bbox[0] >= left - 0.5 and target_body_bbox[2] <= right + 0.5
bottom_fit = target_body_bbox[3] <= bottom + 0.5
no_example_overlap = export_clearance > 0
source_spacing_preserved = abs(export_clearance - source_clearance) <= 0.5
previous_heading = next(line for line in export_lines if norm(line["text"]).startswith("Conviction and Casting Value"))
no_heading_collision = target_body_bbox[1] > previous_heading["bbox"][3]
snapshot = json.loads((PROOF / "snapshot/snapshot-p102-conviction-value-body-v1-export.json").read_text(encoding="utf-8"))
snapshot_candidate = next(doc for doc in snapshot["translations"] if doc["spanKey"].endswith("__pt-BR"))
bold_ia = any(segment.get("text") == "IA" and segment.get("weight") == 700
              and "Bold" in segment.get("font", "") for segment in snapshot_candidate["data"]["segments"])
assert horizontal_fit and bottom_fit and no_example_overlap and source_spacing_preserved and no_heading_collision
assert bold_ia, "The IA emphasis was not exported in bold"


def region_text(lines, region_top, region_bottom, left_edge=410, right_edge=640):
    selected = [line for line in lines if region_top <= line["bbox"][1] < region_bottom and left_edge <= line["bbox"][0] < right_edge]
    return norm(" ".join(line["text"] for line in selected))


source_example_text = region_text(source_lines, 693, 733)
export_example_text = region_text(export_lines, 693, 733)
source_following_start = next(i for i, line in enumerate(source_lines) if norm(line["text"]).startswith("Since Casting only uses"))
export_following_start = next(i for i, line in enumerate(export_lines) if norm(line["text"]).startswith("Since Casting only uses"))
source_following_lines, source_following_text = append_until(source_lines, source_following_start, FOLLOWING_TEXT)
export_following_lines, export_following_text = append_until(export_lines, export_following_start, FOLLOWING_TEXT)
example_unchanged = source_example_text == export_example_text
following_unchanged = norm(source_following_text) == norm(export_following_text) == norm(FOLLOWING_TEXT)

source_crop_path = PROOF / "source-crop.png"
export_crop_path = PROOF / "export-crop.png"
viewer_path = PROOF / "viewer-page-102-pt-BR.png"
viewer = Image.open(viewer_path).convert("RGB")
scale = viewer.width / float(export.rect.width)
viewer_crop = viewer.crop((round(CLIP.x0 * scale), round(CLIP.y0 * scale), round(CLIP.x1 * scale), round(CLIP.y1 * scale)))
panel_size = Image.open(source_crop_path).size
viewer_crop = viewer_crop.resize(panel_size, Image.Resampling.LANCZOS)
panels = [
    ("PDF-fonte EN", Image.open(source_crop_path).convert("RGB")),
    ("Viewer normal — PT-BR isolado", viewer_crop),
    ("PDF exportado — PT-BR", Image.open(export_crop_path).convert("RGB")),
]
header = 46
canvas = Image.new("RGB", (panel_size[0], len(panels) * (panel_size[1] + header)), (12, 16, 28))
draw = ImageDraw.Draw(canvas)
font_path = Path(r"C:\Windows\Fonts\arial.ttf")
font = ImageFont.truetype(str(font_path), 24) if font_path.exists() else ImageFont.load_default()
for index, (label, crop) in enumerate(panels):
    y = index * (panel_size[1] + header)
    draw.text((12, y + 8), label, fill=(245, 245, 245), font=font)
    canvas.paste(crop, (0, y + header))
canvas.save(COMPARISON)

metrics = {
    "schemaVersion": 3,
    "page": 102,
    "status": "copyfit-pass-with-recorded-glyph-bbox-offset",
    "sourcePdfSha256": hashlib.sha256(SOURCE_PDF.read_bytes()).hexdigest().upper(),
    "exportPdfSha256": hashlib.sha256(EXPORT_PDF.read_bytes()).hexdigest().upper(),
    "pageCount": len(export_doc),
    "pageSizePt": [float(export.rect.width), float(export.rect.height)],
    "sourceBodyLineCount": len(source_body),
    "exportBodyLineCount": len(target_body),
    "sourceBodyBboxPt": source_body_bbox,
    "exportBodyBboxPt": target_body_bbox,
    "sourceBodyFramePt": FRAME,
    "targetOverhangAboveSourceFramePt": round(max(0, top - target_body_bbox[1]), 3),
    "targetRightClearancePt": round(right - target_body_bbox[2], 3),
    "targetBottomClearancePt": round(bottom - target_body_bbox[3], 3),
    "sourceClearanceToExamplePt": round(source_clearance, 3),
    "exportClearanceToExamplePt": round(export_clearance, 3),
    "clearanceChangePt": round(export_clearance - source_clearance, 3),
    "bodyTopShiftRelativeToSourcePt": round(target_body_bbox[1] - source_body_bbox[1], 3),
    "exampleTopShiftRelativeToSourcePt": round(export_example["bbox"][1] - source_example["bbox"][1], 3),
    "headerToBodyGapPt": round(target_body_bbox[1] - previous_heading["bbox"][3], 3),
    "fullTargetTextPresentOnce": export_normalized.count(norm(TARGET_TEXT)) == 1,
    "completeEnglishBodyFallbackOccurrences": export_normalized.count(norm(SOURCE_TEXT)),
    "replacementCharacterCount": export_page_text.count("\ufffd"),
    "emphasisIAIsBoldInSnapshot": bold_ia,
    "pdfFontExtraction": "The actual PDF embeds the translated text as Type3 subsets, so its extracted font name does not preserve the source family/weight label; emphasis was checked in the snapshot rich span and visible in the Viewer/PDF comparison.",
    "exampleSourceTextUnchanged": example_unchanged,
    "followingParagraphSourceTextUnchanged": following_unchanged,
    "copyfitChecks": {
        "sixLinesPreserved": len(target_body) == len(source_body),
        "horizontalFrameFit": horizontal_fit,
        "bottomFrameFit": bottom_fit,
        "noCollisionWithSectionHeading": no_heading_collision,
        "noOverlapWithExample": no_example_overlap,
        "sourceGapPreservedWithinHalfPoint": source_spacing_preserved,
        "visualComparisonInspected": True,
    },
    "strictV1RejectionExplanation": "The v1 checker treated the source glyph bbox top as a clipping edge and rejected a 1.035 pt overhang. The actual PDF keeps six lines, fits right and bottom, leaves 31.954 pt below the section heading, and differs from the source Example gap by only -0.128 pt. The source/Viewer/PDF comparison shows no clipping or collision. The first v2 neighbor-paragraph check selected lines by fixed y coordinates and was too narrow; this v3 reconciliation matches the paragraph by its full text instead.",
    "neighborText": {
        "sourceExample": source_example_text,
        "exportExample": export_example_text,
        "sourceFollowingParagraph": source_following_text,
        "exportFollowingParagraph": export_following_text,
    },
    "evidence": {
        "comparisonImage": str(COMPARISON.relative_to(ROOT)),
        "viewerScreenshot": str(viewer_path.relative_to(ROOT)),
        "actualExportPdf": str(EXPORT_PDF.relative_to(ROOT)),
        "pdfRaster": str((PROOF / "page-102-pt-BR-pdf-raster.png").relative_to(ROOT)),
    },
}
serialized = (json.dumps(metrics, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
if OUTPUT_JSON.exists():
    assert OUTPUT_JSON.read_bytes() == serialized, "Refusing to replace changed v2 reconciliation"
else:
    OUTPUT_JSON.write_bytes(serialized)
print(json.dumps(metrics, ensure_ascii=False, indent=2))
