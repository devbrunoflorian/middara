# Page 2 translation-frame pilot snapshots

Each snapshot preserves the active version immediately before the page 2 frame pilot. The pilot adds optional layout metadata for one block and leaves the extracted block array order and translation key unchanged.

- `App.before.tsx`: archived because the loader will apply optional frame metadata keyed by extracted block id.
- `PageRenderer.before.tsx`: archived because the renderer will read the optional layout frame for replacement text and pass its alignment default to the editor.
- `RichSpanEditor.before.tsx`: archived because the editor will accept a per-block default alignment while honoring saved overrides.
- `text-layout-frames.before.md`: archived because the architecture record will be updated with audit results and pilot status.
- `icebox-index.before.md`: archived because this archive item is being added to the active index.

The active files remain at their normal paths. Restore an individual snapshot by copying it back to the corresponding path. The new frame fixture is additive and does not replace the source DOM JSON.