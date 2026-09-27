"""
apply_pua_overrides.py – Passo 5 do processo PUA
=================================================
Lê os títulos decorativos extraídos (title_glyphs_v3.json) e o 
manifesto PUA (pua_mapping.json). Localiza o bloco correspondente
no DOM JSON e injeta o `displayOverride` com os caracteres PUA.
"""

import json
import os
import glob
import re

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
GLYPHS_JSON = os.path.join(OUTPUT_DIR, "title_glyphs_v3.json")
MAPPING_JSON = r"C:\Users\bruno\Middara\Rulebook App\apps\web\src\assets\pua_mapping.json"

DOM_PAGES_DIR = r"C:\Users\bruno\Middara\Rulebook App\apps\web\public\pages"

def normalize_text(t: str) -> str:
    """Normalize text for matching by removing extra whitespace."""
    return re.sub(r'\s+', ' ', t).strip()

def reconstruct_display_override(glyph_sequence: list, mapping: dict) -> str:
    """
    Reconstruct the string. The new mapping format is:
    {"base": [{"name": "base.alt", "pua_char": "\uE000", ...}]}
    We need a flat dict of glyph_name -> pua_char.
    """
    flat_mapping = {}
    for base, alts in mapping.items():
        for alt in alts:
            flat_mapping[alt["name"]] = alt["pua_char"]
            
    result = ""
    for g in glyph_sequence:
        if g in flat_mapping:
            result += flat_mapping[g]
        elif g == 'space':
            result += ' '
        else:
            # Try to get the base char
            base = g.split('.')[0] if '.' in g and g not in ['.', '..'] else g
            # Some names might be things like 'A', 'b', etc
            # or 'ampersand'
            if len(base) == 1:
                result += base
            else:
                # Handle special names
                names = {'ampersand':'&', 'period':'.', 'comma':',', 'colon':':', 'semicolon':';', 'exclam':'!', 'question':'?', 'quoteright':"'", 'quoteleft':"'", 'hyphen':'-'}
                result += names.get(base, base)
    return result

def process_page(page_num: int, titles: list, mapping: dict):
    page_dir_name = f"page_{page_num:03d}"
    dom_json_path = os.path.join(DOM_PAGES_DIR, page_dir_name, f"{page_dir_name}_dom.json")
    
    if not os.path.exists(dom_json_path):
        print(f"  WARNING: DOM JSON not found for page {page_num}: {dom_json_path}")
        return 0
        
    with open(dom_json_path, 'r', encoding='utf-8') as f:
        dom_data = json.load(f)
        
    applied_count = 0
    
    # We will search through all blocks -> lines -> spans
    for title in titles:
        # We only care about titles with alternates
        if not title.get("alternates_used"):
            continue
            
        target_text = normalize_text(title["text"])
        target_font = title["font_basename"]
        
        # Build the override string
        display_override = reconstruct_display_override(title["glyph_sequence"], mapping)
        
        found = False
        # Search the DOM
        for block in dom_data.get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    span_text = normalize_text(span.get("text", ""))
                    
                    # It's possible the text was split into multiple spans.
                    # For simplicity, we check if the target_text is in the span_text
                    # OR if span_text is in target_text and they are close enough in length.
                    # Given the extraction logic, the DOM text might match exactly.
                    if span_text == target_text or (span_text and target_text.startswith(span_text)):
                        # Double check font to be safe
                        if 'Esmeralda' in span.get("font", "") or 'CinzelDeco' in span.get("font", ""):
                            # If it's a partial match, we might need to apply to just that part.
                            # But if it's an exact match:
                            if span_text == target_text:
                                span["displayOverride"] = display_override
                                found = True
                                applied_count += 1
                                break
                if found: break
            if found: break
            
        if not found:
            print(f"  WARNING: Could not find matching span for '{target_text}' on page {page_num}")
            
    if applied_count > 0:
        # Save the updated JSON
        with open(dom_json_path, 'w', encoding='utf-8') as f:
            json.dump(dom_data, f, indent=2, ensure_ascii=False)
        print(f"  Page {page_num}: Applied {applied_count} overrides and saved.")
        
    return applied_count

def main():
    if not os.path.exists(GLYPHS_JSON) or not os.path.exists(MAPPING_JSON):
        print("Error: Missing JSON files. Run steps 1-4 first.")
        return
        
    with open(GLYPHS_JSON, 'r', encoding='utf-8') as f:
        glyphs_data = json.load(f)
        
    with open(MAPPING_JSON, 'r', encoding='utf-8') as f:
        mapping = json.load(f)
        
    titles = glyphs_data.get("titles", [])
    
    # Group titles by page
    pages = {}
    for t in titles:
        p = t["page"]
        if p not in pages:
            pages[p] = []
        pages[p].append(t)
        
    total_applied = 0
    for page_num in sorted(pages.keys()):
        count = process_page(page_num, pages[page_num], mapping)
        total_applied += count
        
    print(f"\nSUCCESS: Applied {total_applied} PUA overrides to DOM JSON files.")

if __name__ == "__main__":
    main()
