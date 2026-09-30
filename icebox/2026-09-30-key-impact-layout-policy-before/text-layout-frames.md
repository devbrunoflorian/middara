# Text Layout Frames: separating printed ink from translation space

**Status:** the page 2 dialogue-frame pilot and fixed viewer scrollport were visually approved by the user. Generalizing frame extraction remains pending; selection-outline polish is documented for later.

## Data contract for the sample pilot

The bounding box of printed glyphs is evidence about where the source text was painted. It is not automatically the width available to a translated paragraph.

The data model and renderer must keep these concepts separate:

- **Source ink bounds:** the actual extents of the original glyphs in the PDF. Keep the current `bbox` meaning for compatibility and use it for source fidelity, hit testing, and audit evidence.
- **Translation layout frame:** the rectangle in which the replacement paragraph may wrap. Its width comes from the intended column or local layout region, not from the longest original line.
- **Text alignment and indentation:** independent properties inside the frame. A short centered quote may occupy a narrow ink box while using the full body-text column as its frame.
- **Vertical budget:** separate from horizontal frame width. A wider frame may reduce wrapping; it does not authorize overlapping the next paragraph or artwork.

The editor should permit natural reflow across the full intended frame while retaining the source typography and alignment where appropriate. It should not expand across a neighboring column, illustration, caption, or other protected region. A real vertical overflow remains visible and must be resolved or explicitly accepted; it must not be hidden by clipping.

The sample extractor represents the concepts separately: a `region` carries observed `sourceBounds`; an editable `unit` carries its semantic kind, source-block lineage, source ink bbox, and unmodified `sourceLines`; each source line retains baseline, line bbox, and style-bearing span runs. A `layoutFrame` is deliberately absent from these sample regions until it is inferred from page design evidence. Structured values such as a credit's bold `label`/regular `body` or an index row's `pageReference` are conveniences derived from those runs, not replacements for the original runs. This is an audit model only; the serialized production schema and translation keys remain undecided.

## Evidence from page 2

In `apps/web/public/pages/page_002/page_002_dom.json`, the centered dialogue is `block_21`:

- Its merged ink bounds are approximately `x=239.07..587.79 pt`, a width of `348.72 pt`.
- The two original lines have shorter/variable ink extents, but both are centered around `x=413 pt`.
- The adjacent main prose paragraph `block_23` spans approximately `x=118.99..704.62 pt`, a width of `585.63 pt`, with a center around `x=411.80 pt`.

This is strong geometric evidence that the dialogue is centered within the broad body-text measure. Its printed characters occupy only part of that measure. The current extractor sets `availableX` and `availableWidth` to the union of the line ink boxes, so `block_21` receives only `348.72 pt`. `SpanBlock` then uses that value as the `.realbox` width. The translated text is therefore constrained by the source glyph extents and wraps too early; the screenshot's apparent “box limit” follows directly from this data path.

The pilot uses the adjacent body's `block_23` frame (`x=118.99 pt`, `width=585.63 pt`) as a conservative first comparison. This is a measured neighboring text line, not yet the final inferred page-column boundary. The user visually approved the page 2 result: the dialogue can use the broader frame while the blue outline continues to identify the original source text during editing. This validates the pilot only, not the generalized extraction rule.

## Focused structural audit

The read-only audit also confirmed three separate follow-up problems. They are recorded so the frame prototype does not accidentally claim to solve them:

- Page 2 has 21 text blocks in the current JSON. The dialogue is JSON array index 4 (`id=block_21`), so its current editor key is `page_2_block_4`. The prototype attaches metadata by `block.id` and does not reorder or merge the array, preserving that key and any saved translation.
- The page 2 middle credits column is JSON array index 16 (`id=block_39`): 22 lines and 28 spans, comprising 6 `OptimaLTStd-Bold` labels and 22 `OptimaLTStd` name spans at 10 pt. The current block editor takes the first span's style for the flattened paragraph, so fixing the frame alone cannot preserve bold labels within editable credits. Mixed-style editing needs its own follow-up design.
- Page 3's “Summary of Components” and “Choosing a Game Mode” are two separate lines in the same current block (`block_11`, array index 1), both `Cinzel-Regular` 12 pt. They must remain separate content units, even if assigned the same wider layout frame; the current one-block translation model still requires a semantic split follow-up.
- Page 101 has three column-sized raw blocks with 356, 349, and 226 lines respectively. A layout-frame change will not make those entries individually editable; index structure and leader rules need separate treatment.

These findings make the implementation order explicit: prove a non-destructive frame on page 2 first, then address mixed styles and semantic splitting as distinct work, and only then generalize extraction to multi-column and index pages.

## Read-only sample extraction results

The reproducible analyzer is [`scripts/audit_layout_sample.py`](../../scripts/audit_layout_sample.py). It reads the source PDF and writes a machine-readable audit snapshot to `tmp/layout-sample/`; it never overwrites the page JSON consumed by the app. The current measured results are recorded in [`sample-layout-audit.md`](sample-layout-audit.md).

- **Page 2 credits:** 3 visual columns and 17 category candidates split at bold labels ending in `:`. All 17 retain their source line boxes and styled runs, with a separately derived bold label and regular body.
- **Page 3 contents:** 39 label units pair with 39 page-reference lines at a measured baseline delta of 0.49–0.55 pt. “Summary of Components” maps to 4 and “Choosing a Game Mode” maps to 8. Dotted leaders are vector artwork, not editable text.
- **Page 101 index:** 3 independent column blocks yield 74, 74, and 49 baseline groups. Of 197 candidate rows, 192 have numeric references (including ranges and comma-separated lists). Four rows appear to be section headings without references. One row, “Values”, has the nonnumeric right-edge text “Back” in the source PDF and is explicitly flagged for human review.

These counts validate a sample-level segmentation approach, not the final production output. Stable translation keys remain a separate migration concern: splitting a legacy multi-entry block cannot silently reuse its old key for multiple new units. Before app integration, prepare a dry-run mapping that preserves old drafts and reports ambiguous legacy blocks.

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

1. **Done for the representative sample:** record source geometry and units for the page 2 credits, page 3 contents, and page 101 index using `python scripts/audit_layout_sample.py --report docs/architecture/sample-layout-audit.md`.
2. **Done for the first rendering pilot:** use a `585.63 pt` frame for the page 2 centered dialogue. The user confirmed the live text uses the broader frame and that the blue outline still points to the original source bounds.
3. **Next:** integrate the sample units behind optional sidecar metadata without changing the current page JSON, then visually inspect the credits, page 3 row/page pairing, and page 101 index entries in the app.
4. Confirm a true narrow-wrap case next to artwork and preserve narrower frames only where the PDF visibly requires them.
5. Preserve all existing block keys and saved translations while testing the frame as non-destructive metadata. Do not regenerate all 102 pages or migrate Payload keys during this proof.
6. Ask for visual approval on the remaining representative cases. Only after the credits, page 3, and page 101 behavior is approved should the serialized model be generalized and processed in small batches.

## Acceptance criteria

- A centered short source line can use the full width of its genuine column when translated.
- The same text remains centered/indented as the source design intends.
- A real narrow region caused by an image, a column boundary, or a designed inset remains protected.
- Separate paragraphs remain separately editable even when they share a frame.
- The preview makes vertical overflow obvious and does not silently clip or overlap neighboring content.
- Existing saved translation keys remain usable during the frame-model transition.

## Pilot state

The first renderer prototype is stored in `apps/web/public/pages/page_002/layout_frames.json`, keyed by extracted block ID. `App.tsx` overlays this optional metadata at load time, and `SpanBlock` uses it only for replacement text. The source DOM JSON, array order, block keys, and saved translation schema remain untouched. The editor takes the frame's center alignment as its default; a saved user override still takes precedence. `scripts/audit_layout_sample.py` adds an audit-only sample model for semantic units and lineage; it does not feed the app yet.

This is a one-block pilot, not the final extraction algorithm. The user approved the live page 2 result, including keeping the blue source outline visible while editing. No 102-page extraction, database change, or translation-key migration is part of the pilot.

### Deferred selection-outline polish

The blue outline has two jobs that should stay distinct:

- While the text editor/live preview is active, keep the outline on the original source ink bounds so the translator can identify which printed text is being replaced.
- After leaving text editing, the selected outline may adapt to the translated text's rendered bounds so the selection reflects the current result.

A later visual-fit indicator could use green when the translated text fits the intended layout frame, yellow when it exceeds that frame, and red only for actual line/block overflow or collision. “Fits” must be evaluated against the intended translation frame, not the original glyph-ink box; otherwise legitimate reflow would be marked as a failure. This is cosmetic and lower priority than making translation and extraction reliable, so it is deliberately not part of this commit's implementation.

### Checks completed

- `npm run build -w apps/web` passes. Vite still reports the pre-existing `/texture.png` resolution warning.
- `git diff --check` passes.
- The local Vite server returns HTTP 200 for the frame sidecar and serves loader code that attaches it by `block.id`.
- `page_002_dom.json` was not modified; its SHA-256 during this audit was `F1C5B1ED56BCC1209C4DFDDA0FB9670205CBC7FDE1CB7A23E20909CEBB8A9EFF`.
- The user visually confirmed the page 2 frame result and the fixed viewer scrollport. This approval does not cover generalized extraction, mixed-style credit editing, or semantic splitting on pages 3 and 101.
