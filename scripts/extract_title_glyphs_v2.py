"""
extract_title_glyphs_v2.py – Passos 1-3 (corrigido)
====================================================
Lê os bytes crus do content stream + /Encoding /Differences
para obter os nomes reais dos glifos (I.swsh, n.alt, etc).

O fitz.get_text() já faz decodificação Unicode, perdendo os glifos
alternativos. Precisamos dos bytes ANTES da decodificação.
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
    """Parse /Differences array: '32 /space 73 /I.swsh /n.alt /t ...' """
    encoding = {}
    tokens = diff_str.split()
    current_code = 0
    for token in tokens:
        token = token.strip()
        if not token:
            continue
        if token.startswith('/'):
            encoding[current_code] = token[1:]  # remove /
            current_code += 1
        else:
            try:
                current_code = int(token)
            except ValueError:
                pass
    return encoding


def get_all_font_encodings(doc, page) -> dict[str, dict]:
    """
    For each font on the page, extract its encoding info.
    Returns { font_ref_name: { 'basename': ..., 'subtype': ..., 'encoding': {code: glyph_name} } }
    """
    result = {}
    fonts = page.get_fonts(full=True)
    
    for font_info in fonts:
        xref = font_info[0]
        ext = font_info[1]
        font_type = font_info[2]
        basename = font_info[3]
        ref_name = font_info[4]  # e.g. T1_0, C0_0
        
        font_dict_str = doc.xref_object(xref)
        
        is_type0 = '/Type0' in font_dict_str or 'Identity-H' in font_dict_str
        is_decorative = any(pat in basename for pat in DECORATIVE_FONT_PATTERNS)
        
        if not is_decorative:
            continue
        
        info = {
            'basename': basename,
            'ref_name': ref_name,
            'xref': xref,
            'is_type0': is_type0,
            'encoding': {},
            'glyph_order': None,
        }
        
        if is_type0:
            # Type0/CID: need to extract embedded font and get glyph order
            info['encoding'] = extract_type0_encoding(doc, xref, font_dict_str)
        else:
            # Type1: read /Differences
            info['encoding'] = extract_type1_encoding(doc, xref, font_dict_str)
        
        result[ref_name] = info
        # Also key by basename for matching
        result[basename] = info
    
    return result


def extract_type1_encoding(doc, xref: int, font_dict_str: str) -> dict[int, str]:
    """Extract /Encoding /Differences from a Type1 font."""
    encoding = {}
    
    # Check for encoding reference object
    enc_ref_match = re.search(r'/Encoding\s+(\d+)\s+\d+\s+R', font_dict_str)
    if enc_ref_match:
        enc_xref = int(enc_ref_match.group(1))
        enc_str = doc.xref_object(enc_xref)
        diff_match = re.search(r'/Differences\s*\[([^\]]+)\]', enc_str, re.DOTALL)
        if diff_match:
            encoding = parse_differences(diff_match.group(1).strip())
            return encoding
    
    # Check inline /Differences
    diff_match = re.search(r'/Differences\s*\[([^\]]+)\]', font_dict_str, re.DOTALL)
    if diff_match:
        encoding = parse_differences(diff_match.group(1).strip())
        return encoding
    
    return encoding


def extract_type0_encoding(doc, xref: int, font_dict_str: str) -> dict[int, str]:
    """
    For Type0 (Identity-H) fonts: extract the embedded font program,
    parse with fontTools to get GID→glyph name mapping.
    """
    encoding = {}
    
    # Find DescendantFonts - could be inline array or reference
    # Try reference first
    desc_match = re.search(r'/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R\s*\]', font_dict_str)
    if not desc_match:
        # Try inline (the array might contain the dict directly, or multiple refs)
        # Also try without brackets
        desc_match = re.search(r'/DescendantFonts\s*(\d+)\s+\d+\s+R', font_dict_str)
    
    if not desc_match:
        # Try to find it as a stream reference in the font dict keys
        # Some PDFs have DescendantFonts as an array with inline dicts
        print(f"    DEBUG: Font dict for xref {xref}:")
        print(f"    {font_dict_str[:500]}")
        return encoding
    
    desc_xref = int(desc_match.group(1))
    desc_str = doc.xref_object(desc_xref)
    
    # Find FontDescriptor
    fd_match = re.search(r'/FontDescriptor\s+(\d+)\s+\d+\s+R', desc_str)
    if not fd_match:
        return encoding
    
    fd_xref = int(fd_match.group(1))
    fd_str = doc.xref_object(fd_xref)
    
    # Find FontFile2 or FontFile3
    ff_match = re.search(r'/FontFile[23]?\s+(\d+)\s+\d+\s+R', fd_str)
    if not ff_match:
        return encoding
    
    ff_xref = int(ff_match.group(1))
    font_bytes = doc.xref_stream(ff_xref)
    
    if not font_bytes:
        return encoding
    
    try:
        from fontTools.ttLib import TTFont
        import io
        
        font = TTFont(io.BytesIO(font_bytes))
        glyph_order = font.getGlyphOrder()
        
        # For Identity-H, CID = GID
        for gid, name in enumerate(glyph_order):
            encoding[gid] = name
            
        font.close()
        print(f"    WARNING: Found and parsed Type0/CID font (Identity-H) with {len(glyph_order)} glyphs. "
              f"If this is used in titles, manual CID mapping might be required.")
    except Exception as e:
        print(f"    ERROR parsing embedded font: {e}")
    
    return encoding


def extract_raw_text_bytes(page) -> list[dict]:
    """
    Parse the content stream manually to extract raw text bytes
    associated with each font operator (Tf).
    
    We track: Tf sets the current font, Tj/TJ contain the raw bytes.
    """
    import struct
    
    # Get the raw content stream bytes
    # fitz can give us the page's contents
    xref_list = page.get_contents()
    doc = page.parent
    
    all_ops = []
    current_font = None
    current_font_size = 0
    
    for content_xref in xref_list:
        stream = doc.xref_stream(content_xref)
        if not stream:
            continue
        
        # Decode stream to text for parsing
        try:
            text = stream.decode('latin-1')  # PDF content streams are bytes, latin-1 preserves all byte values
        except:
            continue
        
        # Simple state machine to parse PDF operators
        # We need Tf (set font), Tj (show string), TJ (show string array)
        # BT...ET mark text blocks
        
        in_text = False
        i = 0
        lines = text.replace('\r\n', '\n').replace('\r', '\n').split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check for BT/ET
            if line == 'BT':
                in_text = True
                continue
            if line == 'ET':
                in_text = False
                continue
            
            if not in_text:
                continue
            
            # Check for Tf: /FontName size Tf
            tf_match = re.match(r'/(\S+)\s+([\d.]+)\s+Tf', line)
            if tf_match:
                current_font = tf_match.group(1)
                current_font_size = float(tf_match.group(2))
                continue
            
            # Check for Tj: (string) Tj
            tj_match = re.search(r'\((.+?)\)\s*Tj', line)
            if tj_match and current_font:
                raw_str = tj_match.group(1)
                # Decode PDF string escapes
                raw_bytes = decode_pdf_string(raw_str)
                all_ops.append({
                    'font': current_font,
                    'font_size': current_font_size,
                    'raw_bytes': raw_bytes,
                    'type': 'Tj',
                })
                continue
            
            # Check for TJ: [(string) kern (string) kern ...] TJ
            tj_array_match = re.search(r'\[(.+?)\]\s*TJ', line, re.DOTALL)
            if tj_array_match and current_font:
                arr_content = tj_array_match.group(1)
                # Extract all string segments from the array
                raw_bytes = b''
                for str_match in re.finditer(r'\(([^)]*)\)', arr_content):
                    raw_bytes += decode_pdf_string(str_match.group(1))
                
                if raw_bytes:
                    all_ops.append({
                        'font': current_font,
                        'font_size': current_font_size,
                        'raw_bytes': raw_bytes,
                        'type': 'TJ',
                    })
    
    return all_ops


def decode_pdf_string(s: str) -> bytes:
    """Decode a PDF literal string (between parens), handling escapes."""
    result = bytearray()
    i = 0
    while i < len(s):
        if s[i] == '\\' and i + 1 < len(s):
            next_ch = s[i + 1]
            if next_ch == 'n':
                result.append(10)
                i += 2
            elif next_ch == 'r':
                result.append(13)
                i += 2
            elif next_ch == 't':
                result.append(9)
                i += 2
            elif next_ch == '\\':
                result.append(92)
                i += 2
            elif next_ch == '(':
                result.append(40)
                i += 2
            elif next_ch == ')':
                result.append(41)
                i += 2
            elif next_ch.isdigit():
                # Octal escape
                oct_str = next_ch
                j = i + 2
                while j < len(s) and j < i + 4 and s[j].isdigit():
                    oct_str += s[j]
                    j += 1
                result.append(int(oct_str, 8) & 0xFF)
                i = j
            else:
                result.append(ord(next_ch))
                i += 2
        else:
            result.append(ord(s[i]) & 0xFF)
            i += 1
    return bytes(result)


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
        
        # Step 1: Get font encodings for decorative fonts on this page
        font_encodings = get_all_font_encodings(doc, page)
        
        if not font_encodings:
            print(f"  No decorative fonts on this page.")
            continue
        
        for ref_name, finfo in font_encodings.items():
            if ref_name == finfo['basename']:
                continue  # skip duplicate key
            print(f"  Font: {finfo['basename']} (ref={ref_name}, xref={finfo['xref']})")
            if finfo['encoding']:
                enc = finfo['encoding']
                # Show a sample of the encoding
                sample = dict(list(enc.items())[:10])
                print(f"    Encoding sample: {sample}")
                # Count alternates in encoding
                alts = [v for v in enc.values() if '.' in v and v not in ['.', '..']]
                if alts:
                    print(f"    *** ALTERNATES IN ENCODING: {alts}")
            else:
                print(f"    No encoding extracted.")
        
        # Step 2: Extract raw text operations from content stream
        raw_ops = extract_raw_text_bytes(page)
        
        decorative_ops = [op for op in raw_ops if any(pat.lower() in op['font'].lower() for pat in ['Esmeralda', 'CinzelDeco'])]
        
        if not decorative_ops:
            print(f"  No decorative text operators in content stream.")
            continue
        
        for op in decorative_ops:
            font_ref = op['font']
            raw_bytes = op['raw_bytes']
            
            # Find the encoding for this font
            enc = None
            for key, finfo in font_encodings.items():
                if key == font_ref or finfo['ref_name'] == font_ref:
                    enc = finfo['encoding']
                    break
            
            if not enc:
                # Try matching by basename containing the pattern
                for key, finfo in font_encodings.items():
                    if font_ref in finfo.get('basename', ''):
                        enc = finfo['encoding']
                        break
            
            is_type0 = False
            for key, finfo in font_encodings.items():
                if key == font_ref or finfo['ref_name'] == font_ref:
                    is_type0 = finfo.get('is_type0', False)
                    break
            
            # Decode bytes through the encoding
            glyph_names = []
            if is_type0:
                # 2-byte codes
                for i in range(0, len(raw_bytes) - 1, 2):
                    code = (raw_bytes[i] << 8) | raw_bytes[i + 1]
                    if enc and code in enc:
                        glyph_names.append(enc[code])
                    else:
                        glyph_names.append(f"CID{code}")
            else:
                # 1-byte codes
                for b in raw_bytes:
                    if enc and b in enc:
                        glyph_names.append(enc[b])
                    else:
                        # WinAnsi fallback
                        if 32 <= b <= 126:
                            glyph_names.append(chr(b))
                        else:
                            glyph_names.append(f"\\x{b:02x}")
            
            # Reconstruct readable text from glyph names
            readable = ''.join(
                g.split('.')[0] if '.' in g and g not in ['.'] else g
                for g in glyph_names
            )
            
            # Identify alternates
            alts_in_this = [g for g in glyph_names if '.' in g and g not in ['.', '..']]
            for a in alts_in_this:
                all_alt_glyphs.add(a)
            
            print(f"\n  Text: \"{readable}\" (font_ref: {font_ref}, size: {op['font_size']}, type: {'TJ' if op['type']=='TJ' else 'Tj'})")
            print(f"  Raw bytes: {[hex(b) for b in raw_bytes]}")
            print(f"  Glyph sequence: {glyph_names}")
            if alts_in_this:
                print(f"  *** ALTERNATES: {alts_in_this}")
            
            all_titles.append({
                "page": page_num,
                "text": readable,
                "font_ref": font_ref,
                "font_size": op["font_size"],
                "glyph_sequence": glyph_names,
                "alternates_used": list(set(alts_in_this)),
                "raw_bytes_hex": [hex(b) for b in raw_bytes],
            })
    
    doc.close()
    
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Total decorative titles extracted: {len(all_titles)}")
    print(f"Unique alternate glyphs: {sorted(all_alt_glyphs)}")
    print(f"Count: {len(all_alt_glyphs)}")
    
    output = {
        "titles": all_titles,
        "all_alternate_glyphs": sorted(list(all_alt_glyphs)),
    }
    
    output_path = os.path.join(OUTPUT_DIR, "title_glyphs_v2.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\nSaved: {output_path}")


if __name__ == "__main__":
    main()
