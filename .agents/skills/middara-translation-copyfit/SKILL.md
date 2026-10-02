---
name: middara-translation-copyfit
description: Translate or copyfit Middara Rulebook pages from the official English PDF into Brazilian Portuguese while preserving terminology, rich text, visual hierarchy, and page-specific DTP notes.
---

# Middara translation and copyfitting

Use this skill for the Middara Rulebook's English extraction, PT-BR translation, and DTP review. Read the current project handoff and the relevant page-progress record first.

## Source and page workflow

1. Treat the official English PDF as the wording source. Read its page text directly; use app JSON, old extraction files, database entries, and screenshots as corroborating context, never as a replacement for the source PDF.
2. Work page by page. Preserve semantic block/paragraph boundaries and inline style runs. A change in font size or independent bounding box is a separate text unit; don't merge it into a neighbor. For lists, tables of contents, and columns, verify the relationship between labels and page numbers against the rendered source.
3. Mark a page's English as source-checked before preparing its PT-BR translation. Keep a clear page status and never imply that machine extraction alone proves the app's visual fidelity.
4. Include text visibly printed as page content. Keep ambiguous text over cards/artwork in a separate review/localization section. Follow `.agents/rules/07-fantasmas-e-artefatos-duplicados.md`: a suspicion is not evidence to suppress or translate a ghost.
5. Put English and its corresponding PT-BR unit together in the per-page Markdown. Preserve bold, italic, mixed runs, title level, font family/size, reading order, and source context as metadata where Markdown alone cannot represent them.

## Translation decisions

- Apply `docs/translations/glossary.md` consistently. Preserve game terms, proper names, numbers, icons/placeholders, and referenced page numbers. Extend the glossary only as documented candidates when a recurring source term has no official entry; don't silently invent a project-wide term.
- Use the approved page 2 PT-BR entries as a voice and terminology reference, not as a template for page structure. Current database coverage is limited; check the progress note for its observed scope.
- Translate for clear, natural Brazilian Portuguese and preserve the rule's meaning. For mechanical rules, prefer concise phrasing only when it does not change the rule or omit meaning.
- Preserve markup rigorously. Prefer balanced Markdown emphasis. If HTML/rich-text tags are required, validate every opening tag has a corresponding close; do not use blind string replacements that can leak style.

## Copyfitting and acceptance

Read [copyfitting and DTP decisions](references/copyfitting-and-dtp.md) for the expansion metric, title hierarchy, DTP flags, and QA. The 20% expansion point is an alert to review wording and layout, not a universal maximum or proof of fit. Inspect the real target frame/render when available. Never shrink a major heading merely to force the original box to contain a longer translation; document the need for negative space or a second line.

For curated Markdown drafts, run `python scripts/audit_translation_copyfit.py` to report character-count alerts per paired unit. This is read-only and does not judge visual fit; short headings and labels can exceed 20% while still fitting. Use `--threshold` to change the report threshold and `--output <path>` for a CSV; treat every alert as a review cue, not an automatic rewrite.

An extracted/translated page remains a draft until source text, terms, inline styling, page references, and actual layout risks are checked. Keep unresolved artwork text, missing context, and layout overflow explicit instead of silently guessing.
