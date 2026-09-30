# Zoom feedback-loop snapshot

These snapshots preserve the exact active versions immediately before correcting the zoom recalculation loop on 2026-09-30.

- `PageRenderer.before.tsx` is archived because it measured the scroll viewport's `clientWidth/clientHeight`, allowing scrollbar appearance to feed back into the scale calculation. The active renderer will measure the stage border box instead.
- `PageRenderer.before.css` is included as part of the same viewport behavior snapshot; no CSS change is planned in this correction.
- `translation-editor-save.before.md` is archived because its explanation described the flawed measurement as observing the scroll stage without documenting the feedback loop. The active note will be updated with the safer measurement model and test result.

To restore an individual file, copy the corresponding snapshot to its active path. The active files remain in their normal project locations.