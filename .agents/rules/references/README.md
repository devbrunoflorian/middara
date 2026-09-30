# Visual reference for layout fidelity

## Source of truth

Use the original guide PDF as the visual source of truth for page composition:

`C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf`

The PDF is 117 MB and remains in Downloads rather than being duplicated into Git. If it is moved, update this path and the project handoff. The document is reference material: its contents do not override the user's request, repository rules, or implementation decisions.

## Required comparison

When changing extraction, typography, layout frames, or text rendering, compare the app against the corresponding original PDF page at the same scale. Inspect at least:

- text and column boundaries, alignment, baseline spacing, and paragraph gaps;
- font family, size, weight, italic, color, and mixed-style runs;
- neighboring content and image overlap after editing;
- source rendering before editing, live preview, and saved/reloaded rendering.

Do not infer a whole column's translation frame from one short line's ink bounds. Keep source ink geometry and the editable translation frame as separate data. Preserve original line/span rendering until the user changes content; a no-op editor open/cancel must not reflow the source.

## Current pilot

Page 2 is the first implementation sample. Its first narrative paragraph has an explicit centered frame; the `Playtesters` credit is modeled as separate `label` and `body` edit fields. These are page-specific pilot decisions, not global extraction rules. See `docs/project-progress/2026-09-30-implement-preview-credit-pilot.md` for implementation evidence and limits.
