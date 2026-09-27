import fitz
import os
import json
import sys

def extract_images_with_transparency(pdf_path, output_dir, page_num):
    print(f"Extracting images for page {page_num}...")
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]
    
    os.makedirs(output_dir, exist_ok=True)
    
    images_info = page.get_image_info(xrefs=True)
    
    images_data = []
    
    # To find smask, we use doc.get_page_images() which returns a list of tuples:
    # (xref, smask, width, height, bpc, colorspace, alt.colorspace, name, filter, referencer)
    page_images = doc.get_page_images(page_num - 1)
    smask_map = {img[0]: img[1] for img in page_images}
    
    # Track saved xrefs to avoid duplicates
    saved_xrefs = set()
    
    for i, info in enumerate(images_info):
        xref = info["xref"]
        if xref in saved_xrefs:
            continue
            
        bbox = info["bbox"]
        smask = smask_map.get(xref, 0)
        
        try:
            pix = fitz.Pixmap(doc, xref)
            
            # If it's CMYK, we MUST convert to RGB first before applying mask or saving
            if pix.colorspace and pix.colorspace.name in (fitz.csCMYK.name, "DeviceCMYK"):
                pix = fitz.Pixmap(fitz.csRGB, pix)
                
            if smask > 0:
                mask = fitz.Pixmap(doc, smask)
                try:
                    pix_with_alpha = fitz.Pixmap(pix, mask)
                    out_path = os.path.join(output_dir, f"img_{xref}.png")
                    pix_with_alpha.save(out_path)
                    pix_with_alpha = None
                except Exception as ex:
                    if "size" in str(ex):
                        from PIL import Image
                        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                        mask_img = Image.frombytes("L", [mask.width, mask.height], mask.samples)
                        mask_img = mask_img.resize((pix.width, pix.height), Image.Resampling.LANCZOS)
                        img.putalpha(mask_img)
                        out_path = os.path.join(output_dir, f"img_{xref}.png")
                        img.save(out_path)
                    else:
                        raise ex
                mask = None
            else:
                out_path = os.path.join(output_dir, f"img_{xref}.png")
                pix.save(out_path)
                
            pix = None
            
            images_data.append({
                "filename": f"img_{xref}.png",
                "bbox": bbox,
                "xref": xref
            })
            saved_xrefs.add(xref)
            print(f"  -> Saved {out_path} (smask: {smask})")
        except Exception as e:
            print(f"  -> Error extracting xref {xref}: {e}")
            
    # Save the structure JSON mapping
    struct_file = os.path.join(output_dir, f"page_{page_num:03d}_structure.json")
    with open(struct_file, "w", encoding="utf-8") as f:
        json.dump({"page_number": page_num, "images": images_data}, f, indent=2)

if __name__ == "__main__":
    pdf_path = r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
    
    for page_num in range(1, 11):
        output_dir = os.path.join(r"C:\Users\bruno\Middara\Rulebook App\apps\web\public\pages", f"page_{page_num:03d}")
        
        if not os.path.exists(pdf_path):
            print(f"ERROR: Cannot find PDF at {pdf_path}")
            sys.exit(1)
            
        extract_images_with_transparency(pdf_path, output_dir, page_num)
