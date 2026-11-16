#!/usr/bin/env python3
"""Export and validate a small mixed-locale proof through the live viewer."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile
import uuid
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF_DEFAULT = Path(
    r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
)
SAMPLES = [
    {"page": 13, "locale": "pt-BR", "purpose": "rich text and semantic symbols"},
    {"page": 24, "locale": "pt-BR", "purpose": "heading/body, bold and italic"},
    {"page": 42, "locale": "pt-BR", "purpose": "rich Example and line reflow"},
    {"page": 78, "locale": "pt-BR", "purpose": "semantic inline symbols and component artwork"},
    {"page": 78, "locale": "en", "purpose": "source geometry and English comparison"},
]


def source_page_data(page_number: int) -> dict[str, object]:
    page_id = f"{page_number:03d}"
    path = ROOT / "apps" / "web" / "public" / "pages" / f"page_{page_id}" / f"page_{page_id}_dom.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    if not (float(data["width"]) > 0 and float(data["height"]) > 0):
        raise ValueError(f"Page {page_number} has invalid source dimensions.")
    return data


def font_evidence(document: pymupdf.Document, page: pymupdf.Page) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    seen: set[int] = set()
    for item in page.get_fonts(full=True):
        xref, _, subtype, basefont, resource_name, encoding, _ = item
        if not xref or xref in seen:
            continue
        seen.add(xref)
        root_object = document.xref_object(xref)
        related_objects: list[str] = []
        pending = [xref]
        visited: set[int] = set()
        while pending:
            current = pending.pop()
            if current in visited:
                continue
            visited.add(current)
            try:
                source = document.xref_object(current)
            except Exception:
                continue
            related_objects.append(source)
            pending.extend(int(value) for value in re.findall(r"(\d+)\s+\d+\s+R", source))
        has_font_program = any(
            re.search(r"/FontFile(?:2|3)?\s+\d+\s+\d+\s+R", source)
            for source in related_objects
        )
        rows.append({
            "resource": resource_name,
            "subtype": subtype,
            "baseFont": basefont,
            "encoding": encoding,
            "toUnicode": "/ToUnicode" in root_object,
            "embeddedFontProgram": bool(has_font_program),
            "embeddedType3Glyphs": subtype == "Type3" and "/CharProcs" in root_object,
        })
    return rows


def coincident_duplicate_words(page: pymupdf.Page) -> list[dict[str, object]]:
    locations: dict[tuple[object, ...], int] = {}
    for word in page.get_text("words"):
        x0, y0, x1, y1, text = word[:5]
        normalized = re.sub(r"\s+", " ", str(text)).strip().casefold()
        if len(normalized) < 3 or not any(char.isalnum() for char in normalized):
            continue
        key = (normalized, *(round(float(value) * 4) / 4 for value in (x0, y0, x1, y1)))
        locations[key] = locations.get(key, 0) + 1
    return [
        {"text": key[0], "bboxPt": list(key[1:]), "copies": count}
        for key, count in locations.items()
        if count > 1
    ]


def effective_image_ppi(page: pymupdf.Page) -> list[float]:
    values: list[float] = []
    for item in page.get_images(full=True):
        xref, _, pixel_width, pixel_height = item[:4]
        for rect in page.get_image_rects(xref):
            if rect.width > 0 and rect.height > 0:
                values.extend((pixel_width * 72 / rect.width, pixel_height * 72 / rect.height))
    return values


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "output" / "pdf" / "middara-representative-export-proof-2026-10-10.pdf",
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--api-url", default="http://localhost:3000")
    parser.add_argument("--source-pdf", type=Path, default=SOURCE_PDF_DEFAULT)
    parser.add_argument("--capture-only", action="store_true", help="Capture viewer/print states without creating PDFs.")
    parser.add_argument("--capture-dir", type=Path, help="Directory for before/after screenshots and DOM metrics.")
    parser.add_argument("--replace-existing", action="store_true", help="Atomically replace this proof output after validation.")
    args = parser.parse_args()
    args.output = args.output.resolve()
    args.source_pdf = args.source_pdf.resolve()
    if args.capture_dir is None:
        args.capture_dir = ROOT / "tmp" / "pdfs" / "visual-parity-captures-2026-10-11"
    args.capture_dir = args.capture_dir.resolve()
    if not args.capture_only and args.output.exists() and not args.replace_existing:
        parser.error(f"Refusing to overwrite existing output: {args.output}")
    if not args.source_pdf.is_file():
        parser.error(f"Source PDF not found: {args.source_pdf}")
    return args


def main() -> None:
    args = parse_args()
    page_output_dir = ROOT / "tmp" / "pdfs"
    page_output_dir.mkdir(parents=True, exist_ok=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.capture_dir.mkdir(parents=True, exist_ok=True)
    source_pdf = pymupdf.open(args.source_pdf)
    replacement_output = (
        args.output.with_name(f".{args.output.stem}-replacement-{uuid.uuid4().hex}.pdf")
        if args.replace_existing else None
    )
    assembly_output = replacement_output or args.output

    with tempfile.TemporaryDirectory(prefix="middara-export-proof-", dir=page_output_dir) as temporary:
        temporary_path = Path(temporary)
        page_pdfs: list[Path] = []
        for index, sample in enumerate(SAMPLES, start=1):
            page_number = int(sample["page"])
            locale = str(sample["locale"])
            partial = temporary_path / f"{index:02d}-p{page_number:03d}-{locale}.pdf"
            command = [
                "node", "scripts/export_page_pdf.mjs",
                "--page", str(page_number),
                "--language", locale,
                "--output", str(partial),
                "--base-url", args.base_url,
                "--api-url", args.api_url,
                "--source-pdf", str(args.source_pdf),
            ]
            if args.capture_only:
                stem = f"p{page_number:03d}-{locale.lower().replace('-', '')}"
                command.extend([
                    "--capture-only",
                    "--viewer-screenshot", str(args.capture_dir / f"{stem}-viewer.png"),
                    "--print-screenshot", str(args.capture_dir / f"{stem}-print.png"),
                    "--metrics-output", str(args.capture_dir / f"{stem}-metrics.json"),
                ])
            print(f"[representative-proof] {sample['purpose']} — p.{page_number} {locale}")
            subprocess.run(command, cwd=ROOT, check=True)
            page_pdfs.append(partial)

        if args.capture_only:
            print(json.dumps({
                "captureOnly": True,
                "sourcePdfModified": False,
                "payloadWrites": 0,
                "captureDirectory": str(args.capture_dir),
                "samples": [
                    {"rulebookPage": sample["page"], "locale": sample["locale"], "purpose": sample["purpose"]}
                    for sample in SAMPLES
                ],
            }, ensure_ascii=False, indent=2))
            source_pdf.close()
            return

        assembled = pymupdf.open()
        toc: list[list[object]] = []
        for index, (sample, partial) in enumerate(zip(SAMPLES, page_pdfs, strict=True), start=1):
            source_page = int(sample["page"])
            fragment = pymupdf.open(partial)
            if fragment.page_count != 1:
                raise ValueError(f"p.{source_page} {sample['locale']}: partial PDF is not one page.")
            assembled.insert_pdf(fragment)
            toc.append([1, f"Rulebook p. {source_page} · {sample['locale']}", index])
            fragment.close()
        assembled.set_toc(toc)
        assembled.set_metadata({
            "title": "Middara Rulebook — representative editable PDF export proof",
            "subject": "Read-only mixed-locale viewer export proof; not a print-production PDF",
            "creator": "Middara Rulebook App export pipeline",
        })
        assembled.save(assembly_output, garbage=4, deflate=True)
        assembled.close()

    proof = pymupdf.open(assembly_output)
    source_page_boxes = []
    page_reports: list[dict[str, object]] = []
    try:
        if proof.page_count != len(SAMPLES):
            raise ValueError(f"Expected {len(SAMPLES)} proof pages, found {proof.page_count}.")
        for index, sample in enumerate(SAMPLES):
            page_number = int(sample["page"])
            page = proof[index]
            data = source_page_data(page_number)
            source_page = source_pdf[page_number - 1]
            expected_size = (float(data["width"]), float(data["height"]))
            if abs(page.rect.width - expected_size[0]) > 0.5 or abs(page.rect.height - expected_size[1]) > 0.5:
                raise ValueError(f"p.{page_number}: physical page size differs from source geometry.")
            for box_name in ("mediabox", "cropbox", "bleedbox", "trimbox", "artbox"):
                actual_box = getattr(page, box_name)
                source_box = getattr(source_page, box_name)
                if any(abs(actual_box[i] - source_box[i]) > 0.02 for i in range(4)):
                    raise ValueError(f"p.{page_number}: {box_name} differs from the source PDF.")

            text = page.get_text()
            if len(text.strip()) < 100:
                raise ValueError(f"p.{page_number} {sample['locale']}: selectable text is too short.")
            if "\ufffd" in text:
                raise ValueError(f"p.{page_number} {sample['locale']}: extracted text contains U+FFFD.")
            image_count = len(page.get_images(full=True))
            if image_count < 1:
                raise ValueError(f"p.{page_number}: expected the page artwork/background image.")
            fonts = font_evidence(proof, page)
            font_types = sorted({str(font["subtype"]) for font in fonts})
            duplicate_words = coincident_duplicate_words(page)
            ppi = effective_image_ppi(page)
            page_reports.append({
                "rulebookPage": page_number,
                "locale": sample["locale"],
                "purpose": sample["purpose"],
                "sizePt": [round(page.rect.width, 3), round(page.rect.height, 3)],
                "selectableCharacters": len(text),
                "selectableWords": len(page.get_text("words")),
                "textLines": sum(len(block.get("lines", [])) for block in page.get_text("dict")["blocks"]),
                "replacementCharacters": 0,
                "images": image_count,
                "effectiveImagePpiRange": [round(min(ppi), 1), round(max(ppi), 1)] if ppi else None,
                "fontTypes": font_types,
                "fontsWithToUnicode": sum(bool(font["toUnicode"]) for font in fonts),
                "fontResources": len(fonts),
                "embeddedFontPrograms": sum(bool(font["embeddedFontProgram"]) for font in fonts),
                "embeddedType3GlyphPrograms": sum(bool(font["embeddedType3Glyphs"]) for font in fonts),
                "coincidentDuplicateWords": duplicate_words,
            })
    finally:
        proof.close()
        source_pdf.close()

    if replacement_output is not None:
        os.replace(replacement_output, args.output)

    print(json.dumps({
        "output": str(args.output),
        "pageCount": len(page_reports),
        "sourcePdfModified": False,
        "payloadWrites": 0,
        "samples": page_reports,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
