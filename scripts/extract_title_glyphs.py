"""
extract_title_glyphs.py – Passos 1-3 do processo PUA
=====================================================
Abre o PDF original, identifica blocos de título decorativo (EsmeraldaPro,
CinzelDecorative) nas páginas 1-10, extrai a sequência exata de nomes de
glifo do content stream, e gera um JSON de mapeamento.

Saída:
  scripts/output/title_glyphs.json — sequência de glifos por título
"""

import fitz  # PyMuPDF
import json
import os
import re
import struct

PDF_PATH = r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Fonts we consider "decorative title" fonts
DECORATIVE_FONT_PATTERNS = ["EsmeraldaPro", "CinzelDecorative"]


def is_decorative_font(font_name: str) -> bool:
    """Check if a font name matches one of the decorative title patterns."""
    return any(pat in font_name for pat in DECORATIVE_FONT_PATTERNS)


def extract_encoding_differences(font_obj) -> dict[int, str]:
    """
    For a Type1 font, read /Encoding /Differences to build code→glyph-name map.
    Returns dict of {byte_code: glyph_name}.
    """
    encoding_map = {}
    
    # Start with WinAnsiEncoding as base (most common)
    # We'll override with /Differences
    # Standard WinAnsi maps 32-127 to standard ASCII names
    win_ansi_names = {}
    for i in range(32, 127):
        ch = chr(i)
        # Standard Adobe glyph names for ASCII
        name = ch  # simplified; the font's actual encoding overrides this
        win_ansi_names[i] = name
    
    try:
        # Get the font's encoding dictionary
        xref = font_obj.xref
        doc = font_obj  # we'll handle this differently
    except:
        pass
    
    return encoding_map


def get_font_encoding_from_page(page, font_name_ref: str) -> dict[int, str]:
    """
    Given a page and a font reference name (like /T1_0), read the font
    resource's /Encoding /Differences array to get code→glyph-name mapping.
    """
    encoding = {}
    
    # Access the page's font resources
    fonts = page.get_fonts(full=True)
    
    # Get the xref of the font object
    for font_info in fonts:
        xref = font_info[0]
        name = font_info[3]  # basename
        ref_name = font_info[4]  # reference name like T1_0
        
        if ref_name == font_name_ref or name == font_name_ref:
            # Read the font object from the PDF
            doc = page.parent
            font_dict_str = doc.xref_object(xref)
            
            # Parse /Encoding /Differences
            # Look for /Differences array in the encoding
            enc_match = re.search(r'/Encoding\s+(\d+\s+\d+\s+R)', font_dict_str)
            if enc_match:
                enc_ref = enc_match.group(1)
                enc_xref = int(enc_ref.split()[0])
                enc_str = doc.xref_object(enc_xref)
                
                # Parse /Differences array
                diff_match = re.search(r'/Differences\s*\[([^\]]+)\]', enc_str)
                if diff_match:
                    diff_content = diff_match.group(1).strip()
                    return parse_differences(diff_content)
            
            # Check inline encoding
            diff_match = re.search(r'/Differences\s*\[([^\]]+)\]', font_dict_str)
            if diff_match:
                diff_content = diff_match.group(1).strip()
                return parse_differences(diff_content)
            
            # For Identity-H encoded fonts, we need CIDToGIDMap
            if 'Identity-H' in font_dict_str:
                return {'type': 'identity-h', 'xref': xref}
    
    return encoding


def parse_differences(diff_str: str) -> dict[int, str]:
    """
    Parse a /Differences array string like:
    "32 /space /I.swsh /n.alt /t /r.alt /o /d /u /c /t /i /o /n.alt"
    Returns {code: glyph_name}
    """
    encoding = {}
    tokens = diff_str.split()
    current_code = 0
    
    for token in tokens:
        token = token.strip()
        if not token:
            continue
        if token.startswith('/'):
            # It's a glyph name
            glyph_name = token[1:]  # remove leading /
            encoding[current_code] = glyph_name
            current_code += 1
        else:
            # It's a code number
            try:
                current_code = int(token)
            except ValueError:
                pass
    
    return encoding


def extract_text_operators(page) -> list[dict]:
    """
    Extract raw text operators (Tj, TJ, Tf) from the page's content stream.
    Returns a list of dicts with operator info in order.
    """
    operators = []
    
    # Get raw content stream
    # We'll use fitz's get_texttrace or parse the content stream manually
    # Actually, let's use fitz's text extraction with detail
    
    # Use fitz's built-in method to get text with font info per span
    blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
    
    results = []
    for block in blocks:
        if block["type"] != 0:  # text block
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                font_name = span["font"]
                text = span["text"]
                if is_decorative_font(font_name):
                    results.append({
                        "text": text,
                        "font": font_name,
                        "size": span["size"],
                        "bbox": list(span["bbox"]),
                        "flags": span["flags"],
                    })
    
    return results


def extract_glyph_names_for_span(doc, page, span_info: dict) -> list[str]:
    """
    For a decorative span, extract the actual glyph names used.
    This is the core of the extraction: we need to read what glyphs
    the PDF actually references, not just the Unicode text.
    """
    page_num = page.number
    font_name = span_info["font"]
    text = span_info["text"]
    
    # Get all fonts on this page
    fonts = page.get_fonts(full=True)
    
    target_xref = None
    target_ref = None
    for font_info in fonts:
        xref = font_info[0]
        name = font_info[3]  # basename like PZXUMZ+EsmeraldaPro
        ref_name = font_info[4]  # reference name like T1_0
        
        # Match by basename containing our font pattern
        if any(pat in name for pat in DECORATIVE_FONT_PATTERNS):
            target_xref = xref
            target_ref = ref_name
            break
    
    if target_xref is None:
        print(f"  WARNING: Could not find font resource for {font_name} on page {page_num + 1}")
        return [ch for ch in text]  # fallback: return plain chars
    
    # Read the font object
    font_dict_str = doc.xref_object(target_xref)
    
    # Determine font type
    is_type0 = '/Type0' in font_dict_str or 'Identity-H' in font_dict_str
    is_type1 = '/Type1' in font_dict_str and not is_type0
    
    print(f"  Font: {font_name}, xref={target_xref}, ref={target_ref}, type={'Type0/CID' if is_type0 else 'Type1'}")
    
    if is_type1:
        return extract_type1_glyphs(doc, target_xref, font_dict_str, text)
    elif is_type0:
        return extract_type0_glyphs(doc, target_xref, font_dict_str, text)
    else:
        print(f"  WARNING: Unknown font type for {font_name}")
        return [ch for ch in text]


def extract_type1_glyphs(doc, xref: int, font_dict_str: str, text: str) -> list[str]:
    """
    For Type1 fonts: read /Encoding /Differences to get code→glyph mapping.
    Then map each character in the text to its glyph name.
    """
    # Parse /Differences from the font dict or its encoding reference
    encoding = {}
    
    # Check for encoding reference
    enc_ref_match = re.search(r'/Encoding\s+(\d+)\s+(\d+)\s+R', font_dict_str)
    if enc_ref_match:
        enc_xref = int(enc_ref_match.group(1))
        enc_str = doc.xref_object(enc_xref)
        
        diff_match = re.search(r'/Differences\s*\[([^\]]+)\]', enc_str)
        if diff_match:
            encoding = parse_differences(diff_match.group(1).strip())
    
    # Check inline differences
    if not encoding:
        diff_match = re.search(r'/Differences\s*\[([^\]]+)\]', font_dict_str)
        if diff_match:
            encoding = parse_differences(diff_match.group(1).strip())
    
    if not encoding:
        print(f"    WARNING: No /Differences found, falling back to standard names")
        return [ch for ch in text]
    
    # Map each character to its glyph name
    glyph_names = []
    for ch in text:
        code = ord(ch)
        if code in encoding:
            glyph_names.append(encoding[code])
        else:
            # Standard encoding — use the character itself as glyph name
            glyph_names.append(ch)
    
    return glyph_names


def extract_type0_glyphs(doc, xref: int, font_dict_str: str, text: str) -> list[str]:
    """
    For Type0/CID fonts (Identity-H encoding): codes are 2-byte CIDs.
    Map CID → GID → glyph name using the embedded font's post/cmap tables.
    """
    # For Identity-H, the CID = the character code = the GID
    # We need to find the descendant font and its embedded font program
    
    # Find DescendantFonts reference
    desc_match = re.search(r'/DescendantFonts\s*\[\s*(\d+)\s+(\d+)\s+R\s*\]', font_dict_str)
    if not desc_match:
        print(f"    WARNING: No DescendantFonts found for Type0 font")
        return [ch for ch in text]
    
    desc_xref = int(desc_match.group(1))
    desc_str = doc.xref_object(desc_xref)
    
    # Find the font descriptor and embedded font stream
    fd_match = re.search(r'/FontDescriptor\s+(\d+)\s+(\d+)\s+R', desc_str)
    if not fd_match:
        print(f"    WARNING: No FontDescriptor found")
        return [ch for ch in text]
    
    fd_xref = int(fd_match.group(1))
    fd_str = doc.xref_object(fd_xref)
    
    # Find embedded font file (FontFile2 for TrueType, FontFile3 for CFF)
    ff_match = re.search(r'/FontFile[23]?\s+(\d+)\s+(\d+)\s+R', fd_str)
    if not ff_match:
        print(f"    WARNING: No embedded font file found")
        return [ch for ch in text]
    
    ff_xref = int(ff_match.group(1))
    
    # Extract the embedded font as bytes
    font_bytes = doc.xref_stream(ff_xref)
    
    if not font_bytes:
        print(f"    WARNING: Could not extract font stream")
        return [ch for ch in text]
    
    # Use fontTools to parse the embedded font and get GID→name mapping
    try:
        from fontTools.ttLib import TTFont
        import io
        
        font = TTFont(io.BytesIO(font_bytes))
        
        # Get the glyph order (GID → name)
        glyph_order = font.getGlyphOrder()
        
        glyph_names = []
        for ch in text:
            cid = ord(ch)
            if cid < len(glyph_order):
                glyph_names.append(glyph_order[cid])
            else:
                glyph_names.append(ch)
        
        font.close()
        return glyph_names
        
    except Exception as e:
        print(f"    WARNING: fontTools parsing failed: {e}")
        return [ch for ch in text]


def main():
    print(f"Opening PDF: {PDF_PATH}")
    doc = fitz.open(PDF_PATH)
    
    all_titles = []
    all_alt_glyphs = set()
    
    # Process pages 1-10 (0-indexed: 0-9)
    for page_idx in range(min(10, len(doc))):
        page = doc[page_idx]
        page_num = page_idx + 1
        print(f"\n{'='*60}")
        print(f"Page {page_num}")
        print(f"{'='*60}")
        
        # Find decorative spans
        decorative_spans = extract_text_operators(page)
        
        if not decorative_spans:
            print(f"  No decorative title spans found.")
            continue
        
        for span in decorative_spans:
            text = span["text"].strip()
            if not text:
                continue
                
            print(f"\n  Title: \"{text}\" (font: {span['font']}, size: {span['size']})")
            
            # Extract glyph names
            glyph_names = extract_glyph_names_for_span(doc, page, span)
            
            print(f"  Glyphs: {glyph_names}")
            
            # Identify alternates (anything with a dot suffix)
            alternates = []
            for gn in glyph_names:
                if '.' in gn and gn not in ['.', '..']:
                    alternates.append(gn)
                    all_alt_glyphs.add(gn)
            
            if alternates:
                print(f"  Alternates found: {alternates}")
            
            all_titles.append({
                "page": page_num,
                "text": text,
                "font": span["font"],
                "size": span["size"],
                "bbox": span["bbox"],
                "glyph_sequence": glyph_names,
                "alternates_used": list(set(alternates)),
            })
    
    doc.close()
    
    # Summary
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Total decorative titles found: {len(all_titles)}")
    print(f"Unique alternate glyphs across all titles: {sorted(all_alt_glyphs)}")
    print(f"Count of unique alternates: {len(all_alt_glyphs)}")
    
    # Save results
    output = {
        "titles": all_titles,
        "all_alternate_glyphs": sorted(list(all_alt_glyphs)),
    }
    
    output_path = os.path.join(OUTPUT_DIR, "title_glyphs.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\nResults saved to: {output_path}")
    return output


if __name__ == "__main__":
    main()
