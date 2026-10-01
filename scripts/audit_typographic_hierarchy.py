"""Read-only inventory of typographic signals and mixed-size edit blocks."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def pua_codepoints(text: str) -> str:
    return " ".join(
        f"U+{ord(char):04X}"
        for char in text
        if 0xE000 <= ord(char) <= 0xF8FF
        or 0xF0000 <= ord(char) <= 0xFFFFD
        or 0x100000 <= ord(char) <= 0x10FFFD
    )


def mapped_renderer_weight(font: str) -> int:
    """Mirror PageRenderer.mapPdfFont for auditing metadata/render disagreement."""
    if "OptimaLTStd" in font:
        if "ExtraBlack" in font:
            return 950
        if "Black" in font:
            return 900
        if "DemiBold" in font or "Demi" in font:
            return 600
        if "Medium" in font:
            return 500
        if "Bold" in font:
            return 700
    elif "AGaramondPro" in font:
        return 700 if "Bold" in font else 400
    elif "CinzelDecorative" in font or "Cinzel" in font:
        if "Black" in font:
            return 900
        if "Bold" in font:
            return 700
    return 400


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-dir", type=Path, default=PAGE_DIR)
    parser.add_argument("--out-dir", type=Path, default=ROOT / "tmp/typography-audit")
    parser.add_argument("--pages", type=int, nargs="+", help="Page numbers; default audits all 102 JSON files")
    args = parser.parse_args()

    spans_out, mixed_out, pages_out, weight_review = [], [], [], []
    all_fonts, all_sizes = Counter(), Counter()
    weight_signals = Counter()
    total_blocks = total_lines = total_spans = mixed_blocks = 0

    for page_number in (args.pages or range(1, 103)):
        path = args.json_dir / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        if not path.is_file():
            continue
        page = json.loads(path.read_text(encoding="utf-8"))
        page_spans = page_lines = page_mixed = 0
        page_bold_flags = page_italic_flags = 0
        page_weight_overrides = page_display_overrides = 0
        page_optical_candidates = page_optical_overrides = page_unresolved_optical = 0
        page_pua_spans = 0
        for block_index, block in enumerate(page.get("blocks", [])):
            total_blocks += 1
            sizes = set()
            block_text = []
            for line_index, line in enumerate(block.get("lines", [])):
                page_lines += 1
                total_lines += 1
                for span_index, span in enumerate(line.get("spans", [])):
                    text = span.get("text", "")
                    if not text:
                        continue
                    size = round(float(span.get("size", 0)), 2)
                    sizes.add(size)
                    font = span.get("font", "")
                    flags = int(span.get("flags", 0))
                    renderer_weight = mapped_renderer_weight(font)
                    override_weight = span.get("renderWeightOverride", "")
                    effective_weight = int(override_weight) if override_weight != "" else renderer_weight
                    bold_flag = bool(flags & 16)
                    italic_flag = bool(flags & 2)
                    font_name_bold = bool(re.search(r"bold|black|heavy|extrabold", font, re.I))
                    has_letters = any(char.isalpha() for char in text)
                    optical_scan_candidate = (
                        "Cinzel" in font
                        and "Decorative" not in font
                        and has_letters
                        and not bold_flag
                        and not font_name_bold
                        and not line.get("rasterizedDuplicate", False)
                        and not line.get("suspectedGhost", block.get("suspectedGhost", False))
                        and size >= 11
                    )
                    optical_heading_candidate = optical_scan_candidate and not override_weight
                    flag_mapping_conflict = bold_flag and renderer_weight < 600
                    name_mapping_conflict = font_name_bold and renderer_weight < 600
                    all_fonts[font] += 1
                    all_sizes[size] += 1
                    weight_signals["flagBold"] += bold_flag
                    weight_signals["fontNameBold"] += font_name_bold
                    weight_signals["mappedWeightConflictWithBoldFlag"] += flag_mapping_conflict
                    weight_signals["mappedWeightConflictWithBoldName"] += name_mapping_conflict
                    weight_signals["opticalCinzelHeadingCandidates"] += optical_heading_candidate
                    weight_signals["cinzelOpticalScanCandidates"] += optical_scan_candidate
                    weight_signals["confirmedCinzelOpticalOverrides"] += optical_scan_candidate and bool(override_weight)
                    page_spans += 1
                    total_spans += 1
                    page_bold_flags += bold_flag
                    page_italic_flags += italic_flag
                    page_weight_overrides += bool(override_weight)
                    page_display_overrides += bool(span.get("displayOverride"))
                    page_optical_candidates += optical_scan_candidate
                    page_optical_overrides += optical_scan_candidate and bool(override_weight)
                    page_unresolved_optical += optical_heading_candidate
                    page_pua_spans += bool(pua_codepoints(text))
                    block_text.append(text)
                    bbox = span.get("bbox", line.get("bbox", block.get("bbox", [])))
                    spans_out.append({
                        "page": page_number,
                        "blockIndex": block_index,
                        "blockId": block.get("id", ""),
                        "lineIndex": line_index,
                        "lineId": line.get("id", ""),
                        "spanIndex": span_index,
                        "text": text,
                        "font": font,
                        "sizePt": size,
                        "flags": flags,
                        "flagBold": bold_flag,
                        "flagItalic": italic_flag,
                        "fontNameSuggestsBold": font_name_bold,
                        "rendererWeight": renderer_weight,
                        "effectiveWeight": effective_weight,
                        "flagMappingConflict": flag_mapping_conflict,
                        "fontNameMappingConflict": name_mapping_conflict,
                        "opticalCinzelHeadingCandidate": optical_heading_candidate,
                        "cinzelOpticalScanCandidate": optical_scan_candidate,
                        "fontNameSuggestsItalic": bool(re.search(r"italic|oblique", font, re.I)),
                        "renderWeightOverride": span.get("renderWeightOverride", ""),
                        "renderStyleOverride": span.get("renderStyleOverride", ""),
                        "allCaps": text.isupper() and any(char.isalpha() for char in text),
                        "smallCapsNameSignal": bool(re.search(r"small.?caps|sc$", font, re.I)),
                        "PUA": pua_codepoints(text),
                        "color": span.get("color", ""),
                        "bbox": ",".join(f"{v:.2f}" for v in bbox),
                        "suspectedGhost": line.get("suspectedGhost", block.get("suspectedGhost", False)),
                        "rasterizedDuplicate": line.get("rasterizedDuplicate", False),
                    })
                    if flag_mapping_conflict or name_mapping_conflict or optical_heading_candidate or override_weight != "":
                        weight_review.append({
                            "page": page_number,
                            "blockIndex": block_index,
                            "blockId": block.get("id", ""),
                            "lineIndex": line_index,
                            "lineId": line.get("id", ""),
                            "spanIndex": span_index,
                            "text": text,
                            "font": font,
                            "sizePt": size,
                            "flags": flags,
                            "flagBold": bold_flag,
                            "fontNameSuggestsBold": font_name_bold,
                            "rendererWeight": renderer_weight,
                            "renderWeightOverride": override_weight,
                            "flagMappingConflict": flag_mapping_conflict,
                            "fontNameMappingConflict": name_mapping_conflict,
                            "opticalCinzelHeadingCandidate": optical_heading_candidate,
                            "bbox": ",".join(f"{v:.2f}" for v in bbox),
                        })
            if len(sizes) > 1:
                mixed_blocks += 1
                page_mixed += 1
                mixed_out.append({
                    "page": page_number,
                    "blockIndex": block_index,
                    "blockId": block.get("id", ""),
                    "sizesPt": ",".join(f"{value:.2f}" for value in sorted(sizes)),
                    "sizeCount": len(sizes),
                    "lineCount": len(block.get("lines", [])),
                    "bbox": ",".join(f"{v:.2f}" for v in block.get("bbox", [])),
                    "text": " ".join(" ".join("".join(s.get("text", "") for s in l.get("spans", [])) for l in block.get("lines", [])).split())[:500],
                    "caution": "review candidate; do not split without preserving geometry and editable-key compatibility",
                })
        pages_out.append({
            "page": page_number,
            "blocks": len(page.get("blocks", [])),
            "lines": page_lines,
            "spans": page_spans,
            "boldFlagSpans": page_bold_flags,
            "italicFlagSpans": page_italic_flags,
            "renderWeightOverrides": page_weight_overrides,
            "displayOverrides": page_display_overrides,
            "puaSpans": page_pua_spans,
            "cinzelOpticalScanCandidates": page_optical_candidates,
            "confirmedCinzelOpticalOverrides": page_optical_overrides,
            "unresolvedCinzelOpticalCandidates": page_unresolved_optical,
            "mixedSizeBlocks": page_mixed,
            "images": len(page.get("images", [])),
        })

    write_csv(args.out_dir / "spans.csv", spans_out, list(spans_out[0].keys()) if spans_out else ["page"])
    write_csv(args.out_dir / "mixed-size-blocks.csv", mixed_out, list(mixed_out[0].keys()) if mixed_out else ["page"])
    write_csv(args.out_dir / "pages.csv", pages_out, list(pages_out[0].keys()) if pages_out else ["page"])
    write_csv(args.out_dir / "weight-review.csv", weight_review, list(weight_review[0].keys()) if weight_review else ["page"])
    summary = {
        "pages": len(pages_out),
        "blocks": total_blocks,
        "lines": total_lines,
        "spans": total_spans,
        "mixedSizeBlocks": mixed_blocks,
        "mixedSizeBlockPages": sum(1 for row in pages_out if row["mixedSizeBlocks"]),
        "fontFamilies": all_fonts.most_common(),
        "fontSizesPt": all_sizes.most_common(),
        "fontWeightSignals": dict(weight_signals),
        "outputs": ["spans.csv", "mixed-size-blocks.csv", "pages.csv", "weight-review.csv"],
        "note": "metadata inventory only; mirrored font mapping must be kept in sync with PageRenderer; optical candidates require PDF review",
    }
    (args.out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Pages: {len(pages_out)}; blocks: {total_blocks}; lines: {total_lines}; spans: {total_spans}")
    print(f"Mixed-size blocks: {mixed_blocks} across {summary['mixedSizeBlockPages']} pages")
    print(f"Outputs: {args.out_dir.resolve()}")


if __name__ == "__main__":
    main()
