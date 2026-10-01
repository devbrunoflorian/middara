import fitz  # PyMuPDF
import argparse
import copy
import json
import os
import re
from pathlib import Path


def split_text_block_by_font_size(block):
    """Propose edit units using size boundaries, PDF baselines and x geometry.

    Different point sizes always create different units. Equal-sized lines join
    only when their baseline spacing and horizontal geometry suggest paragraph
    flow; this is still a layout candidate, not semantic proof.
    """
    source_lines = block.get("lines", [])
    source_spans = [span for line in source_lines for span in line.get("spans", []) if span.get("text", "")]
    tab_only_spans = sum(
        1 for span in source_spans
        if "\t" in span.get("text", "") and not span.get("text", "").strip()
    )
    numeric_reference_lines = sum(
        1 for line in source_lines
        if re.fullmatch(r"\d{1,3}(?:\s*[,/-]\s*\d{1,3})*", "".join(span.get("text", "") for span in line.get("spans", [])).strip())
    )
    tabbed_index_candidate = (
        len(source_lines) >= 20
        and tab_only_spans / max(1, len(source_spans)) >= 0.15
        and numeric_reference_lines >= 20
    )

    fragments = []
    for line_index, line in enumerate(block.get("lines", [])):
        spans_by_size = {}
        for span_index, span in enumerate(line.get("spans", [])):
            if not span.get("text", "").strip():
                continue
            size = round(float(span.get("size", 0)), 2)
            spans_by_size.setdefault(size, []).append((span_index, copy.deepcopy(span)))
        for size, spans in spans_by_size.items():
            group_line = copy.deepcopy(line)
            group_line["spans"] = [span for _, span in spans]
            boxes = [span["bbox"] for span in group_line["spans"] if "bbox" in span]
            group_line["bbox"] = (
                min(box[0] for box in boxes), min(box[1] for box in boxes),
                max(box[2] for box in boxes), max(box[3] for box in boxes),
            ) if boxes else line.get("bbox", block["bbox"])
            origins = [span.get("origin") for _, span in spans if span.get("origin")]
            baseline_y = (
                sum(origin[1] for origin in origins) / len(origins)
                if origins else (group_line["bbox"][1] + group_line["bbox"][3]) / 2
            )
            fragments.append({
                "position": (line_index, spans[0][0]),
                "line_index": line_index,
                "size": size,
                "line": group_line,
                "bbox": group_line["bbox"],
                "baseline_y": baseline_y,
            })

    if not fragments:
        return [block]

    if tabbed_index_candidate:
        # InDesign's three-column index stores a label and its page reference
        # as separate lines on one baseline, with empty tab spans between.
        # Reconstruct one edit candidate per baseline and size, within this
        # source block/column. Different font sizes remain hard boundaries.
        rows = []
        for fragment in sorted(fragments, key=lambda item: item["position"]):
            eligible = [
                row for row in rows
                if row["size"] == fragment["size"]
                and abs(row["baseline_y"] - fragment["baseline_y"]) <= 0.75
            ]
            if eligible:
                row = eligible[0]
                row["fragments"].append(fragment)
            else:
                rows.append({
                    "size": fragment["size"],
                    "baseline_y": fragment["baseline_y"],
                    "fragments": [fragment],
                })

        rows.sort(key=lambda row: (row["baseline_y"], min(item["bbox"][0] for item in row["fragments"])))
        result = []
        for unit_index, row in enumerate(rows):
            split_block = copy.deepcopy(block)
            unit_lines = []
            for fragment in sorted(row["fragments"], key=lambda item: (item["bbox"][0], item["position"])):
                unit_line = copy.deepcopy(fragment["line"])
                visible_spans = []
                for span in unit_line.get("spans", []):
                    # Tabs and padding spaces position text in the PDF source;
                    # the span bbox carries that geometry, so these aren't
                    # editable/visible characters in the reconstructed row.
                    span["text"] = span.get("text", "").replace("\t", "").strip()
                    if span["text"]:
                        visible_spans.append(span)
                unit_line["spans"] = visible_spans
                if not visible_spans:
                    continue
                boxes = [span["bbox"] for span in visible_spans if "bbox" in span]
                if boxes:
                    unit_line["bbox"] = (
                        min(box[0] for box in boxes), min(box[1] for box in boxes),
                        max(box[2] for box in boxes), max(box[3] for box in boxes),
                    )
                unit_lines.append(unit_line)
            if not unit_lines:
                continue
            split_block["lines"] = unit_lines
            split_block["bbox"] = (
                min(line["bbox"][0] for line in unit_lines),
                min(line["bbox"][1] for line in unit_lines),
                max(line["bbox"][2] for line in unit_lines),
                max(line["bbox"][3] for line in unit_lines),
            )
            split_block["editor_id"] = f"block_{block['z_index']}_unit_{unit_index}"
            split_block["font_size_split"] = row["size"]
            split_block["baseline_grouped_index_row"] = True
            result.append(split_block)
        return result

    groups = []
    for fragment in sorted(fragments, key=lambda item: item["position"]):
        eligible = []
        for group in groups:
            previous = group["fragments"][-1]
            if group["size"] != fragment["size"] or fragment["line_index"] <= previous["line_index"]:
                continue
            baseline_gap = fragment["baseline_y"] - previous["baseline_y"]
            if baseline_gap < 0 or baseline_gap > max(2.0, group["size"] * 1.3):
                continue
            a, b = previous["bbox"], fragment["bbox"]
            overlap_x = max(a[0], b[0]) < min(a[2], b[2])
            similar_left = abs(a[0] - b[0]) <= max(2.0, group["size"] * 1.5)
            if overlap_x or similar_left:
                eligible.append(group)
        if eligible:
            nearest = min(
                eligible,
                key=lambda candidate: abs(candidate["fragments"][-1]["baseline_y"] - fragment["baseline_y"]),
            )
            nearest["fragments"].append(fragment)
        else:
            groups.append({"size": fragment["size"], "fragments": [fragment]})

    if len(groups) == 1:
        return [block]

    groups.sort(key=lambda group: group["fragments"][0]["position"])
    result = []
    for unit_index, group in enumerate(groups):
        split_block = copy.deepcopy(block)
        split_block["lines"] = [fragment["line"] for fragment in group["fragments"]]
        boxes = [span["bbox"] for line in split_block["lines"] for span in line.get("spans", []) if "bbox" in span]
        split_block["bbox"] = (
            min(box[0] for box in boxes), min(box[1] for box in boxes),
            max(box[2] for box in boxes), max(box[3] for box in boxes),
        ) if boxes else block["bbox"]
        split_block["editor_id"] = f"block_{block['z_index']}_unit_{unit_index}"
        split_block["font_size_split"] = group["size"]
        result.append(split_block)
    return result

def extract_page_dom(pdf_path, output_dir, page_num, doc):
    print(f"Extracting page {page_num}...")
    # 0-indexed page in fitz
    page = doc[page_num - 1]
    
    # get text as dictionary (this extracts precise bbox for each span/line/block)
    text_dict = page.get_text("dict")
    
    # We want to format it identically to page_008_dom.json so our React PageRenderer can consume it
    dom_data = {
        "page_number": page_num,
        "width": page.rect.width,
        "height": page.rect.height,
        "blocks": [],
        "images": []
    }
    
    page_area = page.rect.width * page.rect.height
    
    # First pass: collect images and text blocks with their drawing order (z-index)
    all_images = []
    raw_text_blocks = []
    
    for i, b in enumerate(text_dict.get("blocks", [])):
        b["z_index"] = i
        if b["type"] == 1:
            # It's an image block
            bbox = b["bbox"]
            area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
            
            # Determine role: if it covers > 90% of page, it's background
            role = "background" if (area / page_area) > 0.9 else "content"
            
            img_data = {
                "bbox": bbox,
                "z_index": i,
                "role": role,
                "area": area
            }
            all_images.append(img_data)
            
            # Optionally save to JSON as well
            dom_data["images"].append({
                "url": "", # We aren't extracting pixels yet
                "bbox": bbox,
                "role": role,
                "zIndex": i
            })
        elif b["type"] == 0:
            raw_text_blocks.append(b)
            
    # Second pass: Process text blocks and detect ghosts
    valid_text_blocks = []
    for b in raw_text_blocks:
        text_bbox = b["bbox"]
        text_area = (text_bbox[2] - text_bbox[0]) * (text_bbox[3] - text_bbox[1])
        suspected_ghost = False
        
        if text_area > 0:
            for img in all_images:
                if img["role"] == "background":
                    continue
                # Only images drawn OVER the text can create ghosts
                if img["z_index"] < b["z_index"]:
                    continue
                
                ix_min = max(text_bbox[0], img["bbox"][0])
                iy_min = max(text_bbox[1], img["bbox"][1])
                ix_max = min(text_bbox[2], img["bbox"][2])
                iy_max = min(text_bbox[3], img["bbox"][3])
                
                if ix_max > ix_min and iy_max > iy_min:
                    intersection_area = (ix_max - ix_min) * (iy_max - iy_min)
                    coverage = intersection_area / text_area
                    if coverage > 0.90:
                        suspected_ghost = True
                        break
        
        b["suspectedGhost"] = suspected_ghost
        valid_text_blocks.append(b)

    def font_size_signature(block):
        """Rounded set of source point sizes represented by this text block."""
        return tuple(sorted({
            round(float(span.get("size", 0)), 2)
            for line in block.get("lines", [])
            for span in line.get("spans", [])
            if span.get("text", "").strip()
        }))

    def block_baseline(block, first=False):
        lines = block.get("lines", [])
        if not lines:
            return None
        line = lines[0] if first else lines[-1]
        origins = [span.get("origin") for span in line.get("spans", []) if span.get("origin")]
        if origins:
            return sum(origin[1] for origin in origins) / len(origins)
        bbox = line.get("bbox", block.get("bbox", [0, 0, 0, 0]))
        return (bbox[1] + bbox[3]) / 2

    # Split mixed-size PDF text blocks first; a heading/version pair can be
    # represented by one source PDF block even though they are distinct units.
    font_size_blocks = [
        split_block
        for block in valid_text_blocks
        for split_block in split_text_block_by_font_size(block)
    ]

    # Third pass: Semantic merging of paragraphs
    merged_blocks = []
    current_merged = None
    
    for b in font_size_blocks:
        if current_merged is None:
            current_merged = b
            continue
            
        # Compare current_merged and b
        # gap = top of B - bottom of A
        gap = b["bbox"][1] - current_merged["bbox"][3]
        
        # Check horizontal overlap
        overlap_x = max(current_merged["bbox"][0], b["bbox"][0]) < min(current_merged["bbox"][2], b["bbox"][2])
        
        # PyMuPDF often yields slightly negative gaps (-1.5 to 0) for lines of the same paragraph due to ascender/descender overlap
        # New paragraphs usually have a gap > 2.0 (e.g. 4.1)
        # We also check that it's not a jump to a new column (gap < -10)
        # Font size is a hard editorial-unit boundary: a heading and its
        # subtitle/version may be close and aligned but must remain separate.
        same_font_sizes = font_size_signature(current_merged) == font_size_signature(b)
        previous_baseline = block_baseline(current_merged)
        next_baseline = block_baseline(b, first=True)
        max_size = max(font_size_signature(current_merged) or (0,))
        baseline_continuity = (
            previous_baseline is None
            or next_baseline is None
            or -2.0 <= next_baseline - previous_baseline <= max(2.0, max_size * 1.3)
        )
        same_paragraph = (
            overlap_x
            and (-10 <= gap <= 2.0)
            and same_font_sizes
            and baseline_continuity
            and not current_merged.get("baseline_grouped_index_row")
            and not b.get("baseline_grouped_index_row")
            and not current_merged["suspectedGhost"]
            and not b["suspectedGhost"]
        )
        
        if same_paragraph:
            # Merge b into current_merged
            current_merged["lines"].extend(b["lines"])
            current_merged["bbox"] = (
                min(current_merged["bbox"][0], b["bbox"][0]),
                min(current_merged["bbox"][1], b["bbox"][1]),
                max(current_merged["bbox"][2], b["bbox"][2]),
                max(current_merged["bbox"][3], b["bbox"][3])
            )
        else:
            merged_blocks.append(current_merged)
            current_merged = b
            
    if current_merged is not None:
        merged_blocks.append(current_merged)
                        
    for i_merged, b in enumerate(merged_blocks):
        block_data = {
            "id": b.get("editor_id", f"block_{b['z_index']}"), # Keep legacy ID unless the font-size split needs a unique one
            "bbox": b["bbox"],
            "zIndex": b["z_index"],
            "suspectedGhost": b["suspectedGhost"],
            "lines": []
        }
        
        block_min_x = min(l["bbox"][0] for l in b["lines"])
        block_max_x = max(l["bbox"][2] for l in b["lines"])
        block_width = block_max_x - block_min_x
        
        for j, l in enumerate(b["lines"]):
            line_data = {
                "id": f"line_{b['z_index']}_{j}_{b['editor_id']}" if b.get("editor_id") else f"line_{b['z_index']}_{j}",
                "bbox": l["bbox"],
                "dir": l.get("dir"),
                "availableWidth": block_width,
                "availableX": block_min_x,
                "suspectedGhost": b["suspectedGhost"],
                "spans": []
            }
            
            for span in l["spans"]:
                # Convert PyMuPDF color integer to hex
                color_int = span.get("color", 0)
                # PyMuPDF colors are sRGB integers: R*256^2 + G*256 + B
                # But some flags might be inverted. Typically:
                hex_color = "#{:06x}".format(color_int & 0xFFFFFF)
                
                line_data["spans"].append({
                    "text": span["text"],
                    "font": span["font"],
                    "size": span["size"],
                    "color": hex_color,
                    "flags": span["flags"],
                    "bbox": span["bbox"],
                    "origin": span.get("origin"),
                })
                
            block_data["lines"].append(line_data)
            
        dom_data["blocks"].append(block_data)

    os.makedirs(output_dir, exist_ok=True)
    out_file = os.path.join(output_dir, f"page_{page_num:03d}_dom.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(dom_data, f, indent=2, ensure_ascii=False)
        
    print(f"Saved exact DOM extraction to {out_file}")

if __name__ == "__main__":
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Extract page DOM JSON from the reference PDF.")
    page_selection = parser.add_mutually_exclusive_group(required=True)
    page_selection.add_argument("--pages", type=int, nargs="+", help="Explicit page numbers (use small batches first)")
    page_selection.add_argument("--all-pages", action="store_true", help="Explicitly extract all pages")
    parser.add_argument(
        "--pdf",
        type=Path,
        default=Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"),
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=project_root / "tmp/extraction-output",
        help="Defaults to a temporary directory; pass apps/web/public/pages only when production output is intended",
    )
    args = parser.parse_args()

    if not args.pdf.is_file():
        parser.error(f"Reference PDF not found: {args.pdf}")
    with fitz.open(args.pdf) as doc:
        page_numbers = list(range(1, doc.page_count + 1)) if args.all_pages else sorted(set(args.pages))
        invalid = [number for number in page_numbers if number < 1 or number > doc.page_count]
        if invalid:
            parser.error(f"Page numbers outside 1–{doc.page_count}: {invalid}")
        for page_num in page_numbers:
            output_dir = args.output_root / f"page_{page_num:03d}"
            extract_page_dom(str(args.pdf), str(output_dir), page_num, doc)
    print(f"Extracted {len(page_numbers)} pages to {args.output_root.resolve()}")
