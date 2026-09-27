"""
create_pua_font_all.py – Mapeia TODOS os alternates para PUA
============================================================
"""

import json
import os
from fontTools.ttLib import TTFont

FONTS_DIR = r"C:\Users\bruno\Middara\Rulebook 1.2\_fonts\esmeralda-pro-true"
ORIGINAL_TTF = os.path.join(FONTS_DIR, "EsmeraldaPro.ttf")

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
OUTPUT_TTF = os.path.join(OUTPUT_DIR, "EsmeraldaPro-PUA.ttf")
MAPPING_JSON = os.path.join(OUTPUT_DIR, "all_pua_mapping.json")

PUA_START = 0xE000

def main():
    print(f"Opening original TTF: {ORIGINAL_TTF}")
    font = TTFont(ORIGINAL_TTF)
    
    cmap_table = font['cmap']
    
    font_glyphs = font.getGlyphOrder()
    
    # Encontra todos os alternates
    alts = [g for g in font_glyphs if '.' in g and not g.startswith('.')]
    print(f"Found {len(alts)} alternate glyphs to map.")
    
    mapping = {}
    current_pua = PUA_START
    added_count = 0
    
    for glyph_name in alts:
        mapped = False
        for table in cmap_table.tables:
            if table.isUnicode():
                while current_pua in table.cmap:
                    current_pua += 1
                table.cmap[current_pua] = glyph_name
                mapped = True
                
        if mapped:
            base = glyph_name.split('.')[0]
            if len(base) == 1:
                if base not in mapping:
                    mapping[base] = []
                mapping[base].append({
                    "name": glyph_name,
                    "pua_char": chr(current_pua),
                    "hex": f"U+{current_pua:04X}"
                })
            
            current_pua += 1
            added_count += 1
            
    if added_count > 0:
        print(f"\nSaving modified font to: {OUTPUT_TTF}")
        font.save(OUTPUT_TTF)
        
        # O React precisa desse JSON como um módulo TypeScript ou JSON asset
        # Vamos salvar também direto na pasta web/src para facilitar o import
        web_json = r"C:\Users\bruno\Middara\Rulebook App\apps\web\src\assets\pua_mapping.json"
        os.makedirs(os.path.dirname(web_json), exist_ok=True)
        
        print(f"Saving mapping manifesto to: {web_json}")
        with open(web_json, 'w', encoding='utf-8') as f:
            json.dump(mapping, f, indent=2, ensure_ascii=False)
            
        print("\nSUCCESS!")
        print(f"Added {added_count} PUA mappings.")
    else:
        print("\nNo mappings added.")
        
    font.close()

if __name__ == "__main__":
    main()
