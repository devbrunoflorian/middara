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
        "blocks": []
    }
    
    for i, b in enumerate(text_dict.get("blocks", [])):
        if "lines" not in b:
            continue # ignore image blocks here if we handle them separately
            
        block_data = {
            "id": f"block_{i}",
            "bbox": b["bbox"],
            "lines": []
        }
        
        for j, l in enumerate(b["lines"]):
            line_data = {
                "id": f"line_{i}_{j}",
                "bbox": l["bbox"],
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
