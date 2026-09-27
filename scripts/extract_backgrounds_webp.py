import fitz
import re
import os
from PIL import Image

def extract_single_background(pdf_path, output_dir, page_num):
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1] # 0-indexed
    
    # Read the raw PDF commands
    contents = page.read_contents()
    
    # Remove all text drawing blocks (BT ... ET)
    clean_contents = re.sub(b'BT.*?ET', b'', contents, flags=re.DOTALL | re.MULTILINE)
    
    # Update the page's stream with the text removed
    page.clean_contents() # Merges streams into one
    xref = page.get_contents()[0]
    doc.update_stream(xref, clean_contents)
    
    # Clean XObject streams (Cards, embedded layouts, etc.)
    for obj in page.get_images(True):
        obj_xref = obj[0]
        try:
            if doc.xref_is_form(obj_xref) or doc.xref_is_stream(obj_xref):
                stream = doc.xref_stream(obj_xref)
                if stream and b'BT' in stream:
                    new_stream = re.sub(b'BT.*?ET', b'', stream, flags=re.DOTALL)
                    doc.update_stream(obj_xref, new_stream)
        except Exception:
            pass
    
    # Render the page to a pixmap at 150 DPI (good balance of quality and size)
    pix = page.get_pixmap(dpi=150)
    
    # Convert to Pillow Image
    mode = "RGBA" if pix.alpha else "RGB"
    img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    
    page_str = str(page_num).zfill(3)
    out_path = os.path.join(output_dir, f"page_{page_str}", "background.webp")
    
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, "WEBP", quality=85)
    print(f"Generated {out_path} (Size: {os.path.getsize(out_path) // 1024} KB)")

if __name__ == "__main__":
    pdf_path = r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
    output_dir = r"C:\Users\bruno\Middara\Rulebook App\apps\web\public\pages"
    
    doc = fitz.open(pdf_path)
    total_pages = doc.page_count
    doc.close()
    
    for i in range(21, total_pages + 1):
        print(f"Processing Page {i} of {total_pages}...")
        try:
            extract_single_background(pdf_path, output_dir, i)
        except Exception as e:
            print(f"Error processing page {i}: {e}")
