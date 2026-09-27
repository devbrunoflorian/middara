import fitz
import re
import os

def extract_background_svg(pdf_path, output_dir, page_num):
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1] # 0-indexed
    
    # Extract SVG without converting text to paths
    svg = page.get_svg_image(matrix=fitz.Matrix(2, 2), text_as_path=False)
    
    # Remove all <text> elements
    svg_clean = re.sub(r'<text.*?</text>', '', svg, flags=re.DOTALL)
    
    # Remove all <image> elements to get pure vectors
    svg_clean = re.sub(r'<image[^>]*>', '', svg_clean, flags=re.DOTALL)
    
    page_str = str(page_num).zfill(3)
    out_path = os.path.join(output_dir, f"page_{page_str}", "background.svg")
    
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(svg_clean)
        
    print(f"Generated {out_path}")

if __name__ == "__main__":
    pdf_path = r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
    output_dir = r"C:\Users\bruno\Middara\Rulebook App\apps\web\public\pages"
    
    for i in range(1, 6):
        print(f"Processing Page {i}...")
        extract_background_svg(pdf_path, output_dir, i)
