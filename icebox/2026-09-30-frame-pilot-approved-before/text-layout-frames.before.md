# Text Layout Frames: separating printed ink from translation space

**Status:** layout policy accepted for a page 2 prototype; broad extractor rollout and visual approval still pending.

## Decision being proposed

The bounding box of printed glyphs is evidence about where the source text was painted. It is not automatically the width available to a translated paragraph.

The data model and renderer must keep these concepts separate:

- **Source ink bounds:** the actual extents of the original glyphs in the PDF. Keep the current `bbox` meaning for compatibility and use it for source fidelity, hit testing, and audit evidence.
- **Translation layout frame:** the rectangle in which the replacement paragraph may wrap. Its width comes from the intended column or local layout region, not from the longest original line.
- **Text alignment and indentation:** independent properties inside the frame. A short centered quote may occupy a narrow ink box while using the full body-text column as its frame.
- **Vertical budget:** separate from horizontal frame width. A wider frame may reduce wrapping; it does not authorize overlapping the next paragraph or artwork.

The editor should permit natural reflow across the full intended frame while retaining the source typography and alignment where appropriate. It should not expand across a neighboring column, illustration, caption, or other protected region. A real vertical overflow remains visible and must be resolved or explicitly accepted; it must not be hidden by clipping.

## Evidence from page 2

In `apps/web/public/pages/page_002/page_002_dom.json`, the centered dialogue is `block_21`:

- Its merged ink bounds are approximately `x=239.07..587.79 pt`, a width of `348.72 pt`.
- The two original lines have shorter/variable ink extents, but both are centered around `x=413 pt`.
- The adjacent main prose paragraph `block_23` spans approximately `x=118.99..704.62 pt`, a width of `585.63 pt`, with a center around `x=411.80 pt`.

This is strong geometric evidence that the dialogue is centered within the broad body-text measure. Its printed characters occupy only part of that measure. The current extractor sets `availableX` and `availableWidth` to the union of the line ink boxes, so `block_21` receives only `348.72 pt`. `SpanBlock` then uses that value as the `.realbox` width. The translated text is therefore constrained by the source glyph extents and wraps too early; the screenshot's apparent “box limit” follows directly from this data path.

The pilot uses the adjacent body's `block_23` frame (`x=118.99 pt`, `width=585.63 pt`) as a conservative first comparison. This is a measured neighboring text line, not yet the final inferred page-column boundary; the PDF comparison and the user's view will determine whether it is the right frame.

## Focused structural audit

The read-only audit also confirmed three separate follow-up problems. They are recorded so the frame prototype does not accidentally claim to solve them:

- Page 2 has 21 text blocks in the current JSON. The dialogue is JSON array index 4 (`id=block_21`), so its current editor key is `page_2_block_4`. The prototype attaches metadata by `block.id` and does not reorder or merge the array, preserving that key and any saved translation.
- The page 2 middle credits column is JSON array index 16 (`id=block_39`): 22 lines and 28 spans, comprising 6 `OptimaLTStd-Bold` labels and 22 `OptimaLTStd` name spans at 10 pt. The current block editor takes the first span's style for the flattened paragraph, so fixing the frame alone cannot preserve bold labels within editable credits. Mixed-style editing needs its own follow-up design.
- Page 3's “Summary of Components” and “Choosing a Game Mode” are two separate lines in the same current block (`block_11`, array index 1), both `Cinzel-Regular` 12 pt. They must remain separate content units, even if assigned the same wider layout frame; the current one-block translation model still requires a semantic split follow-up.
- Page 101 has three column-sized raw blocks with 356, 349, and 226 lines respectively. A layout-frame change will not make those entries individually editable; index structure and leader rules need separate treatment.

These findings make the implementation order explicit: prove a non-destructive frame on page 2 first, then address mixed styles and semantic splitting as distinct work, and only then generalize extraction to multi-column and index pages.

## Why the prior clustering idea is insufficient

Clustering based only on the min/max X of each block's ink repeats the same mistake: centered titles, short last lines, and short dialogue lines have smaller ink bounds even when they share a wider column. A strict margin match can also split members of the same region. The cluster should describe a layout region; it cannot be inferred solely by comparing painted glyph extents.

## Proposed data and rendering contract

1. Preserve the original ink `bbox` and existing translation keys.
2. Add an explicit per-block translation frame, initially derived from a page region or a manually audited override. The serialized name and migration details remain an implementation decision.
3. Store frame identity, frame geometry, alignment, and any paragraph indent separately from span font/style data.
4. Render the replacement paragraph inside that frame. Centered content remains centered in the frame even when its source ink occupied only a fraction of the width.
5. Keep the original text and replacement text at the same semantic block granularity. Do not merge adjacent paragraphs merely because they share a frame, and do not split a phrase solely because PyMuPDF emitted separate raw blocks.
6. Treat image wraps, sidebars, multi-column pages, and index leaders as distinct region constraints. A frame may narrow locally where the original design truly narrows; that exception must come from visible layout evidence, not a generic ink-width heuristic.
7. Keep horizontal fit and vertical collision as separate checks. Reflow to the frame width first, then flag text that crosses the block's permitted vertical area or collides with protected neighboring content.

## Validation plan before batch extraction

1. Create a read-only geometry audit for page 2 showing source ink bounds beside proposed frames for body paragraphs, the centered dialogue, and the three-column credits.
2. Prototype the dialogue with a `585.63 pt` frame centered around the body column. Compare it to the original PDF and confirm the Portuguese text no longer wraps at the source ink width or collides with the next paragraph.
3. Audit page 3 headings and contents entries to ensure a shared frame does not merge separate semantic blocks or their page references.
4. Audit a true narrow-wrap case next to artwork and a multi-column/index page. Preserve narrower frames only where the visual design requires them.
5. Preserve all existing block keys and saved translations while testing the frame as non-destructive metadata. Do not regenerate all 102 pages or migrate Payload keys during this proof.
6. Ask for visual approval on these representative pages. Only after approval, promote the validated steps into a project rule/skill and process small batches.

## Acceptance criteria

- A centered short source line can use the full width of its genuine column when translated.
- The same text remains centered/indented as the source design intends.
- A real narrow region caused by an image, a column boundary, or a designed inset remains protected.
- Separate paragraphs remain separately editable even when they share a frame.
- The preview makes vertical overflow obvious and does not silently clip or overlap neighboring content.
- Existing saved translation keys remain usable during the frame-model transition.

## Pilot state

The first renderer prototype is stored in `apps/web/public/pages/page_002/layout_frames.json`, keyed by extracted block ID. `App.tsx` overlays this optional metadata at load time, and `SpanBlock` uses it only for replacement text. The source DOM JSON, array order, block keys, and saved translation schema remain untouched. The editor takes the frame's center alignment as its default; a saved user override still takes precedence.

This is a one-block pilot, not the final extraction algorithm. The translated quote must be inspected in the live app against the PDF, especially for horizontal fit, center alignment, and collision with the next paragraph. Only after that visual check should this frame model be promoted into extracted data and applied to more pages. No 102-page extraction, database change, or translation-key migration is part of the pilot.

### Checks completed

- `npm run build -w apps/web` passes. Vite still reports the pre-existing `/texture.png` resolution warning.
- `git diff --check` passes.
- The local Vite server returns HTTP 200 for the frame sidecar and serves loader code that attaches it by `block.id`.
- `page_002_dom.json` was not modified; its SHA-256 during this audit was `F1C5B1ED56BCC1209C4DFDDA0FB9670205CBC7FDE1CB7A23E20909CEBB8A9EFF`.
- A real-browser visual check of the translated dialogue's fit, center alignment, and overlap with the next paragraph is still outstanding.
