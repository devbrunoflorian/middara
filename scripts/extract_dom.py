import fitz  # PyMuPDF
import json
import os
import sys

def extract_page_dom(pdf_path, output_dir, page_num):
    print(f"Extracting page {page_num}...")
    doc = fitz.open(pdf_path)
    
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

    # Third pass: Semantic merging of paragraphs
    merged_blocks = []
    current_merged = None
    
    for b in valid_text_blocks:
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
        same_paragraph = overlap_x and (-10 <= gap <= 2.0) and not current_merged["suspectedGhost"] and not b["suspectedGhost"]
        
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
            "id": f"block_{b['z_index']}", # Keep original starting z-index as ID
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
                "id": f"line_{b['z_index']}_{j}",
                "bbox": l["bbox"],
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
                    "bbox": span["bbox"]
                })
                
            block_data["lines"].append(line_data)
            
        dom_data["blocks"].append(block_data)

    os.makedirs(output_dir, exist_ok=True)
    out_file = os.path.join(output_dir, f"page_{page_num:03d}_dom.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(dom_data, f, indent=2, ensure_ascii=False)
        
    print(f"Saved exact DOM extraction to {out_file}")

if __name__ == "__main__":
    pdf_path = r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
    
    doc = fitz.open(pdf_path)
    total_pages = doc.page_count
    doc.close()
    
    for page_num in range(1, total_pages + 1):
        output_dir = os.path.join(r"C:\Users\bruno\Middara\Rulebook App\apps\web\public\pages", f"page_{page_num:03d}")
        
        if not os.path.exists(pdf_path):
            print(f"ERROR: Cannot find PDF at {pdf_path}")
            sys.exit(1)
            
        extract_page_dom(pdf_path, output_dir, page_num)
