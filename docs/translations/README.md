# Middara Rulebook 1.2 — translation drafts

This folder is the maintained home for page-by-page English source text and Brazilian Portuguese drafts. The official PDF is the textual source of truth. App JSON, database entries, previous extraction files, and screenshots help with style/context but do not replace the PDF.

## Workflow

1. Extract source English directly from the PDF and map the text to visible, semantic units.
2. Check wording, ordering, and styling against the PDF. Keep a separate note for ambiguous text over cards/artwork; do not automatically translate or suppress it.
3. Mark English source/layout status. Only after a page's English has passed the fidelity review, add PT-BR beneath the corresponding English units.
4. Apply the official glossary and page 2 voice reference. Record unresolved recurring terms as candidates rather than silently standardizing them.
5. Calculate character expansion as a warning signal, preserve source hierarchy, and review actual line wrapping/frame fit in the rendered PT preview. Use a DTP flag when the layout needs a deliberate change.

Run `python scripts/audit_translation_copyfit.py` to list expansion alerts by EN/PT unit; use `--output <path>` for a CSV. The scanner is read-only and reports character counts only. It cannot certify line breaks, glyph widths, frame fit, or page fidelity.

The existing 20% value is a review threshold, not an automatic pass/fail for layout. A page can be under 20% and still overflow, or exceed it while fitting available leader space.

## Files

- [`glossary.md`](glossary.md): project copy of the official glossary from `C:\Users\bruno\Middara\Rulebook 1.2\.agents\rules\glossary.md`.
- [`glossary-candidates.md`](glossary-candidates.md): provisional, non-authoritative candidates and cross-page terminology conflicts found in the current drafts; requires team review before standardization.
- [`references/page-2-voice-reference.md`](references/page-2-voice-reference.md): read-only scope and caveats for using the database translation on page 2.
- [`pages/page-003.md`](pages/page-003.md): 40 Contents entries extracted from the PDF, paired to page numbers by baseline, and translated as a PT-BR draft after the existing EN visual review; PT preview remains pending.
- [`pages/page-004.md`](pages/page-004.md): the page title and 14 component descriptions translated after the documented EN visual review; the artwork/card text is reserved for localization, and PT preview is pending.
- [`pages/page-005.md`](pages/page-005.md): 12 editorial component descriptions translated after the documented EN visual review; the Portuguese preview is still pending.
- [`pages/page-006.md`](pages/page-006.md): 8 component descriptions translated after the documented EN visual review; card text is held for artwork localization and two source wording anomalies are recorded.
- [`pages/page-007.md`](pages/page-007.md): the complete three-column component checklist and quantities translated after the documented EN visual review; short labels with expansion above 20% are flagged for width review.
- [`pages/page-013.md`](pages/page-013.md): both columns, phase list, callouts, split-size title, central-gutter coordinates and expansion alerts captured; the difficulty strip remains an artwork-localization item.
- [`source-pages/`](source-pages/): raw line-level English transcript for every PDF page, with per-span font/size/flags/bbox evidence. This generated transcript deliberately keeps artwork text and questionable reading order visible; it is not approved semantic copy or a translation.
- [`../../scripts/extract_translation_markdown.py`](../../scripts/extract_translation_markdown.py): reproducibly regenerates those raw per-page transcripts from the official 102-page PDF.
- [`../../scripts/audit_translation_copyfit.py`](../../scripts/audit_translation_copyfit.py): read-only EN/PT character-expansion report for curated drafts; alerts are not layout-fit judgments.
- [`page-status.csv`](page-status.csv): page-by-page extraction, English fidelity, and translation gate.
- [`../../.agents/skills/middara-translation-copyfit/SKILL.md`](../../.agents/skills/middara-translation-copyfit/SKILL.md): reusable translation and copyfitting workflow.

Curated `pages/page-NNN.md` files contain semantic translation units and their layout/style notes. `source-pages/page-NNN.md` files are a lower-level extraction aid and must not be mistaken for reviewed editorial text. Draft Markdown is not saved to the Payload database.

## Existing material

The sibling `C:\Users\bruno\Middara\Rulebook 1.2\_page_extraction\` contains older extracted/translated Markdown for pages 1–10. These files are preserved as historical drafts and terminology clues. Their grouping, 20% rule, and translation quality must be checked against the PDF and current project decisions before reuse. They are not copied over this maintained set.
