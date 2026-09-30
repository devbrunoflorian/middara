# Event-driven zoom recalculation snapshot

These snapshots preserve the active files immediately before replacing the second unsuccessful zoom correction on 2026-09-30.

- `PageRenderer.before.tsx` preserves the border-box `ResizeObserver` attempt. The user confirmed that the runaway zoom remained, so the observer approach is being removed completely in favor of recalculation only after explicit events (zoom changes, editor open/close, and window resize).
- `translation-editor-save.before.md` preserves the corresponding documentation, which described the unsuccessful observer approach.

The active files remain in their normal project locations. Restore an individual snapshot by copying it back to the corresponding active path.