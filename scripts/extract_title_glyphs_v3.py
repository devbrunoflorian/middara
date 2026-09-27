"""
extract_title_glyphs_v3.py – Passos 1-3 (FINAL)
=================================================
Extrai glifos exatos dos títulos decorativos lendo o content stream
cru e decodificando via /Encoding /Differences.

Funciona com Type1 (1-byte codes + /Differences) e Type0/CID 
(2-byte codes + embedded font glyph order).
"""

import fitz
import json
import os
import re

PDF_PATH = r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

DECORATIVE_FONT_PATTERNS = ["EsmeraldaPro", "CinzelDecorative"]


def parse_differences(diff_str: str) -> dict[int, str]:
    encoding = {}
    tokens = diff_str.split()
    current_code = 0
    for token in tokens:
        token = token.strip()
        if not token:
            continue
        if token.startswith('/'):
            encoding[current_code] = token[1:]
            current_code += 1
        else:
            try:
                current_code = int(token)
            except ValueError:
                pass
    return encoding


def get_font_info(doc, page) -> dict:
    """
    Build a map of font_ref_name → { basename, encoding, is_type0, xref }
    for ALL fonts on the page.
    """
    result = {}
    fonts = page.get_fonts(full=True)
    
    for font_info in fonts:
        xref = font_info[0]
        basename = font_info[3]
        ref_name = font_info[4]
        
        font_dict_str = doc.xref_object(xref)
        is_type0 = '/Type0' in font_dict_str or 'Identity-H' in font_dict_str
        is_decorative = any(pat in basename for pat in DECORATIVE_FONT_PATTERNS)
        
        encoding = {}
        
        if is_decorative:
            if is_type0:
                encoding = extract_type0_encoding(doc, xref, font_dict_str)
            else:
                encoding = extract_type1_encoding(doc, xref, font_dict_str)
        
        result[ref_name] = {
            'basename': basename,
            'xref': xref,
            'is_type0': is_type0,
            'is_decorative': is_decorative,
            'encoding': encoding,
        }
    
    return result


def extract_type1_encoding(doc, xref, font_dict_str):
    enc_ref_match = re.search(r'/Encoding\s+(\d+)\s+\d+\s+R', font_dict_str)
    if enc_ref_match:
        enc_xref = int(enc_ref_match.group(1))
        enc_str = doc.xref_object(enc_xref)
        diff_match = re.search(r'/Differences\s*\[([^\]]+)\]', enc_str, re.DOTALL)
        if diff_match:
            return parse_differences(diff_match.group(1).strip())
    
    diff_match = re.search(r'/Differences\s*\[([^\]]+)\]', font_dict_str, re.DOTALL)
    if diff_match:
        return parse_differences(diff_match.group(1).strip())
    
    return {}


def extract_type0_encoding(doc, xref, font_dict_str):
    desc_match = re.search(r'/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R', font_dict_str)
    if not desc_match:
        return {}
    
    desc_xref = int(desc_match.group(1))
    desc_str = doc.xref_object(desc_xref)
    
    fd_match = re.search(r'/FontDescriptor\s+(\d+)\s+\d+\s+R', desc_str)
    if not fd_match:
        return {}
    
    fd_xref = int(fd_match.group(1))
    fd_str = doc.xref_object(fd_xref)
    
    ff_match = re.search(r'/FontFile[23]?\s+(\d+)\s+\d+\s+R', fd_str)
    if not ff_match:
        return {}
    
    ff_xref = int(ff_match.group(1))
    font_bytes = doc.xref_stream(ff_xref)
    if not font_bytes:
        return {}
    
    try:
        from fontTools.ttLib import TTFont
        import io
        font = TTFont(io.BytesIO(font_bytes))
        glyph_order = font.getGlyphOrder()
        enc = {gid: name for gid, name in enumerate(glyph_order)}
        font.close()
        return enc
    except Exception as e:
        print(f"    ERROR parsing embedded font: {e}")
        return {}


def decode_pdf_string_bytes(s: str) -> bytes:
    """Decode PDF literal string to raw bytes, handling all escape sequences."""
    result = bytearray()
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == '\\' and i + 1 < len(s):
            nxt = s[i + 1]
            if nxt == 'n': result.append(10); i += 2
            elif nxt == 'r': result.append(13); i += 2
            elif nxt == 't': result.append(9); i += 2
            elif nxt == 'b': result.append(8); i += 2
            elif nxt == 'f': result.append(12); i += 2
            elif nxt == '\\': result.append(92); i += 2
            elif nxt == '(': result.append(40); i += 2
            elif nxt == ')': result.append(41); i += 2
            elif nxt in '01234567':
                oct_str = nxt
                j = i + 2
                while j < len(s) and j < i + 4 and s[j] in '01234567':
                    oct_str += s[j]
                    j += 1
                result.append(int(oct_str, 8) & 0xFF)
                i = j
            else:
                result.append(ord(nxt) & 0xFF); i += 2
        else:
            result.append(ord(ch) & 0xFF)
            i += 1
    return bytes(result)


def extract_text_ops_from_stream(stream_text: str) -> list[dict]:
    """
    Parse PDF content stream text to extract font setting (Tf) and 
    text showing (Tj/TJ) operators, maintaining font state.
    
    Works on the FULL stream as one string, not line-by-line.
    """
    ops = []
    current_font = None
    current_size = 0.0
    
    # Find all Tf operators: /FontRef size Tf
    # Find all Tj operators: (string) Tj
    # Find all TJ operators: [...] TJ
    # We need them in order, so we scan sequentially
    
    pos = 0
    text = stream_text
    
    while pos < len(text):
        # Skip whitespace
        while pos < len(text) and text[pos] in ' \t\n\r':
            pos += 1
        if pos >= len(text):
            break
        
        # Check for Tf: /Name size Tf
        tf_match = re.match(r'/(\S+)\s+([\d.]+)\s+Tf', text[pos:])
        if tf_match:
            current_font = tf_match.group(1)
            current_size = float(tf_match.group(2))
            pos += tf_match.end()
            continue
        
        # Check for TJ array: [...] TJ
        if text[pos] == '[':
            # Find matching ]
            bracket_depth = 1
            j = pos + 1
            in_string = False
            while j < len(text) and bracket_depth > 0:
                if in_string:
                    if text[j] == '\\':
                        j += 2; continue
                    if text[j] == ')':
                        in_string = False
                elif text[j] == '(':
                    in_string = True
                elif text[j] == '[':
                    bracket_depth += 1
                elif text[j] == ']':
                    bracket_depth -= 1
                j += 1
            
            # Check if followed by TJ
            rest = text[j:j+10].strip()
            if rest.startswith('TJ'):
                array_content = text[pos+1:j-1]
                # Extract all (string) segments
                raw_bytes = b''
                for str_match in re.finditer(r'\(([^)]*(?:\\.[^)]*)*)\)', array_content):
                    raw_bytes += decode_pdf_string_bytes(str_match.group(1))
                
                if raw_bytes and current_font:
                    ops.append({
                        'font': current_font,
                        'size': current_size,
                        'raw_bytes': raw_bytes,
                        'type': 'TJ',
                    })
                pos = j + 2
                continue
        
        # Check for Tj: (string) Tj
        if text[pos] == '(':
            # Find matching )
            j = pos + 1
            while j < len(text):
                if text[j] == '\\':
                    j += 2; continue
                if text[j] == ')':
                    break
                j += 1
            
            rest = text[j+1:j+10].strip()
            if rest.startswith('Tj') and current_font:
                raw_str = text[pos+1:j]
                raw_bytes = decode_pdf_string_bytes(raw_str)
                ops.append({
                    'font': current_font,
                    'size': current_size,
                    'raw_bytes': raw_bytes,
                    'type': 'Tj',
                })
                pos = j + 3
                continue
        
        pos += 1
    
    return ops


def decode_glyphs(raw_bytes: bytes, encoding: dict, is_type0: bool) -> list[str]:
    """Decode raw bytes through the font encoding to get glyph names."""
    glyphs = []
    if is_type0:
        for i in range(0, len(raw_bytes) - 1, 2):
            code = (raw_bytes[i] << 8) | raw_bytes[i + 1]
            glyphs.append(encoding.get(code, f"CID{code}"))
    else:
        for b in raw_bytes:
            if b in encoding:
                glyphs.append(encoding[b])
            elif 32 <= b <= 126:
                glyphs.append(chr(b))
            else:
                glyphs.append(f"\\x{b:02x}")
    return glyphs


def glyph_to_char(glyph_name: str) -> str:
    """Convert glyph name to its base character for readable text."""
    if glyph_name == 'space':
        return ' '
    base = glyph_name.split('.')[0]
    if len(base) == 1:
        return base
    # Some glyph names are full words like 'ampersand'
    name_map = {
        'ampersand': '&', 'period': '.', 'comma': ',',
        'colon': ':', 'semicolon': ';', 'exclam': '!',
        'question': '?', 'hyphen': '-', 'endash': '–',
        'emdash': '—', 'quoteright': "'", 'quoteleft': "'",
        'quotedblleft': '"', 'quotedblright': '"',
    }
    return name_map.get(base, base)


def main():
    print(f"Opening PDF: {PDF_PATH}")
    doc = fitz.open(PDF_PATH)
    
    all_titles = []
    all_alt_glyphs = set()
    
    for page_idx in range(min(10, len(doc))):
        page = doc[page_idx]
        page_num = page_idx + 1
        print(f"\n{'='*60}")
        print(f"Page {page_num}")
        print(f"{'='*60}")
        
        # Get font info for this page
        font_map = get_font_info(doc, page)
        decorative_fonts = {k: v for k, v in font_map.items() if v['is_decorative']}
        
        if not decorative_fonts:
            print(f"  No decorative fonts.")
            continue
        
        for ref, info in decorative_fonts.items():
            alts = [v for v in info['encoding'].values() if isinstance(v, str) and '.' in v]
            if alts:
                print(f"  Font {ref} ({info['basename']}): {len(alts)} alternates")
        
        # Get content stream
        xref_list = page.get_contents()
        for content_xref in xref_list:
            stream = doc.xref_stream(content_xref)
            if not stream:
                continue
            stream_text = stream.decode('latin-1')
            
            # Extract text operations
            text_ops = extract_text_ops_from_stream(stream_text)
            
            # Filter to decorative font operations
            for op in text_ops:
                font_ref = op['font']
                font_info = font_map.get(font_ref)
                
                if not font_info or not font_info['is_decorative']:
                    continue
                
                enc = font_info['encoding']
                if not enc:
                    continue
                
                glyphs = decode_glyphs(op['raw_bytes'], enc, font_info['is_type0'])
                readable = ''.join(glyph_to_char(g) for g in glyphs)
                
                # Skip very short strings (single chars, numbers)
                if len(readable.strip()) < 2:
                    continue
                
                alternates = [g for g in glyphs if isinstance(g, str) and '.' in g and g not in ['.', '..']]
                for a in alternates:
                    all_alt_glyphs.add(a)
                
                has_alts = "***" if alternates else "   "
                print(f"  {has_alts} \"{readable.strip()}\" -> {glyphs}")
                if alternates:
                    print(f"       Alternates: {alternates}")
                
                all_titles.append({
                    "page": page_num,
                    "text": readable.strip(),
                    "font_ref": font_ref,
                    "font_basename": font_info['basename'],
                    "font_size": op['size'],
                    "is_type0": font_info['is_type0'],
                    "glyph_sequence": glyphs,
                    "alternates_used": alternates,
                    "raw_bytes_hex": [f"0x{b:02x}" for b in op['raw_bytes']],
                })
    
    doc.close()
    
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Decorative titles with glyph data: {len(all_titles)}")
    print(f"Titles with alternates: {sum(1 for t in all_titles if t['alternates_used'])}")
    print(f"Unique alternate glyphs: {sorted(all_alt_glyphs)}")
    print(f"Count: {len(all_alt_glyphs)}")
    
    output = {
        "titles": all_titles,
        "all_alternate_glyphs": sorted(list(all_alt_glyphs)),
    }
    
    output_path = os.path.join(OUTPUT_DIR, "title_glyphs_v3.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\nSaved: {output_path}")


if __name__ == "__main__":
    main()
