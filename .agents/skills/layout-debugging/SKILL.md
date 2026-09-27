---
name: layout-debugging
description: Cheatsheet for debugging PDF-to-HTML layout overlaps, positioning issues, and typography mapping.
---

# PDF-to-HTML Layout Debugging

When working on the Middara Rulebook translation app, layout fidelity is paramount. When things overlap or misalign, follow these debugging steps before touching CSS or React state.

## 1. Absolute vs. Inline Positioning
- **The PDF Engine:** Defines text with exact `(x, y)` coordinates per word/syllable.
- **The HTML Engine:** Defines text blocks and flows content organically (`word-wrap`, `text-align: justify`).
- **The Conflict:** If you place inline text inside an absolute `line.bbox`, the text sits on the browser's calculated baseline (influenced by `line-height` and font metrics). If you change the text to `position: absolute`, it snaps to `top: 0` of the bounding box, which pulls it off the baseline and inevitably causes overlaps with adjacent lines.
- **Rule of Thumb:** NEVER use `position: absolute` for individual spans within a line or paragraph unless you are deliberately positioning a disconnected glyph. Let the text flow inline to preserve baselines.

## 2. Global Typography Flags
- Be careful with `font-feature-settings`. Applying `"swsh" 1` globally to fix Cinzel/Esmeralda will inadvertently trigger aggressive swash caps on standard body text fonts (like Adobe Garamond Pro Italic), fundamentally altering the text's appearance.

## 3. PDF Font Metadata (Type0 / CID)
- If titles or special characters are missing, it's likely a `Type0 (Identity-H)` CID font. 
- The standard `fontTools` extraction script might fail to map these because CID $\neq$ Unicode. 
- **Debug:** Run the `extract_title_glyphs_v2.py` script. It has been updated to emit a `WARNING` when encountering Identity-H fonts. Cross-reference the GID from the `.ttf` using `fontTools` to verify if it's a structural character (a letter) or just a decorative bullet (e.g., `ahungarumlaut` mapped to a dingbat).

## 4. The Overflow Reality
- If a translation is longer than the original English text, it WILL overflow the absolute bounding box.
- Do not attempt to fix this by hacking `letter-spacing` or `line-height` per line.
- The correct architectural fix is to implement **Block-Level Rendering** (grouping lines into a single `<p>`) and letting the browser handle the wrapping within the block's width.
