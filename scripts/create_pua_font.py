"""
create_pua_font.py – Passo 4 do processo PUA
=============================================
Lê a lista de glifos alternativos únicos extraídos do PDF e
adiciona um codepoint PUA (começando de U+E000) para cada um 
no arquivo TTF original, salvando a fonte derivada e o manifesto JSON.
"""

import json
import os
from fontTools.ttLib import TTFont

# Paths
FONTS_DIR = r"C:\Users\bruno\Middara\Rulebook 1.2\_fonts\esmeralda-pro-true"
ORIGINAL_TTF = os.path.join(FONTS_DIR, "EsmeraldaPro.ttf")

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
GLYPHS_JSON = os.path.join(OUTPUT_DIR, "title_glyphs_v3.json")
OUTPUT_TTF = os.path.join(OUTPUT_DIR, "EsmeraldaPro-PUA.ttf")
MAPPING_JSON = os.path.join(OUTPUT_DIR, "pua_mapping.json")

PUA_START = 0xE000

def main():
    if not os.path.exists(GLYPHS_JSON):
        print(f"Error: {GLYPHS_JSON} not found. Run extraction step first.")
        return
        
    with open(GLYPHS_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    alt_glyphs = data.get("all_alternate_glyphs", [])
    if not alt_glyphs:
        print("No alternate glyphs found to process.")
        return
        
    print(f"Found {len(alt_glyphs)} alternate glyphs to map.")
    
    print(f"Opening original TTF: {ORIGINAL_TTF}")
    font = TTFont(ORIGINAL_TTF)
    
    # Get the unicode cmap table (format 4 or 12)
    cmap_table = font['cmap']
    unicode_cmap = None
    for table in cmap_table.tables:
        if table.isUnicode():
            unicode_cmap = table
            break
            
    if not unicode_cmap:
        print("Error: Could not find unicode cmap table in font.")
        return
        
    print(f"Loaded cmap format {unicode_cmap.format}")
    
    # Check which glyphs actually exist in the original font
    font_glyphs = font.getGlyphOrder()
    
    mapping = {}
    current_pua = PUA_START
    
    added_count = 0
    missing_count = 0
    
    for glyph_name in alt_glyphs:
        if glyph_name not in font_glyphs:
            print(f"  WARNING: Glyph '{glyph_name}' not found in original TTF!")
            missing_count += 1
            continue
            
        # Add to all Unicode cmaps
        mapped = False
        for table in cmap_table.tables:
            if table.isUnicode():
                # Don't overwrite existing codepoints just in case
                while current_pua in table.cmap:
                    current_pua += 1
                table.cmap[current_pua] = glyph_name
                mapped = True
                
        if mapped:
            hex_str = f"U+{current_pua:04X}"
            mapping[glyph_name] = chr(current_pua)  # Store actual char for JS/JSON usage
            print(f"  Mapped {glyph_name} -> {hex_str}")
            current_pua += 1
            added_count += 1
            
    if added_count > 0:
        print(f"\nSaving modified font to: {OUTPUT_TTF}")
        font.save(OUTPUT_TTF)
        
        print(f"Saving mapping manifesto to: {MAPPING_JSON}")
        with open(MAPPING_JSON, 'w', encoding='utf-8') as f:
            json.dump(mapping, f, indent=2, ensure_ascii=False)
            
        print("\nSUCCESS!")
        print(f"Added {added_count} PUA mappings.")
        if missing_count > 0:
            print(f"WARNING: {missing_count} glyphs were missing from the font file.")
    else:
        print("\nNo mappings added.")
        
    font.close()

if __name__ == "__main__":
    main()
