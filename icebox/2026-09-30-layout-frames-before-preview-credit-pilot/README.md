# Layout frames before preview and credit pilot

This folder preserves the version of `apps/web/public/pages/page_002/layout_frames.json` that was active immediately before the 2026-09-30 preview-fidelity and credit-unit pilot.

The active file was extended with an explicit centered paragraph frame for `block_12` and line-height metadata, based on the measured page 2 PDF text geometry. The previous `block_21` dialogue frame remains present and unchanged. This snapshot exists to make that targeted layout adjustment reviewable and reversible; it does not replace or supersede the active file.

To restore the prior state, copy this `layout_frames.json` to `apps/web/public/pages/page_002/layout_frames.json`.
