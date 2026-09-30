# Task: translation editor save point and page 2 frame pilot

- **Status:** committed and pushed; two browser checks remain explicitly unconfirmed.
- **Branch:** `fix/pixel-render/overflow`
- **Commit:** `a8eae78` (`Fix viewer scroll and add translation frame pilot`)

## Goal

Keep the app usable for translation: prevent zoom/scroll from trapping page content, allow editing without page navigation stealing keyboard/link input, keep local drafts on server failure, preview edited text on the page, and prove a wider translation frame on one centered paragraph without replacing its source bounds.

## Method

1. Inspected the renderer, editor, page-stage CSS, key handling, saved page JSON, and the page 2 PDF geometry.
2. Reproduced the zoom behavior against the local Vite app. Continuous `ResizeObserver` measurements fed scrollbar changes back into scale; a first observer-based adjustment still looped, so the final scale update became event-driven and measures the stage's outer rectangle.
3. Bounded single-page viewing to the viewport and kept scrolling within `.page-stage`, moving the horizontal scrollbar to the visible viewport edge.
4. Prevented admin arrow/PageUp/PageDown navigation while a text field is focused and changed index links in admin mode to select the block for editing.
5. Added a non-destructive page 2 frame sidecar for centered dialogue `block_21`, preserving the source DOM JSON, block order, and existing translation keys. The translated text uses the body-column width while the blue selection outline continues to identify the original printed bounds during editing.
6. Updated the save-point and layout-policy documentation, and archived pre-change versions in `icebox/` with a reason for each snapshot.

## Results and verification

- `npm run build -w apps/web` passed; the pre-existing `/texture.png` resolution warning remained.
- The user visually confirmed that the horizontal scrollbar remains accessible while vertically scrolling a zoomed page.
- The user visually approved the page 2 dialogue frame and the blue outline as a reference to the original text while editing.
- Commit `a8eae78` was pushed to `origin/fix/pixel-render/overflow`; the branch was clean and synchronized at that point.
- No 102-page extraction, Payload migration, or translation-key change was included.

## Corrections and deferred checks

- The first continuous resize observer caused zoom drift/looping. A first observer iteration still failed to settle; it was removed in favor of event-driven recomputation. The current documentation still marks browser confirmation of zoom stability as pending.
- Admin index-link selection was implemented but does not have a recorded user visual confirmation yet.
- Green/yellow/red outline states and adapting the selection outline to translated bounds after leaving the editor were explicitly deferred as lower priority.

## Next step

Continue the small-sample layout work documented in [`2026-09-30-layout-sample-audit.md`](2026-09-30-layout-sample-audit.md). Before activating semantic block splits, create a dry-run mapping for old `spanKey` translations and preserve browser-local drafts.

## Related documentation

- [`docs/translation-editor-save-and-line-breaks.md`](../translation-editor-save-and-line-breaks.md)
- [`docs/architecture/text-layout-frames.md`](../architecture/text-layout-frames.md)
- [`icebox/README.md`](../../icebox/README.md)
