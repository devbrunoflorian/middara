# Fixed scroll viewport snapshot

This snapshot preserves the active app layout and documentation before constraining the single-page viewer to the available viewport on 2026-09-30.

- `App.before.css` is archived because `.page-wrapper` had no bounded flex size in single-page mode, allowing the page content to determine the scroll area's height. The resulting horizontal scrollbar could sit after the full page content instead of at the viewport's visible bottom. The active layout will give the wrapper a bounded flex viewport and keep scrolling inside the page stage.
- `translation-editor-save.before.md` is archived because the active documentation will be updated to record the fixed scrollport design and its still-pending visual confirmation.

Active files remain at their usual paths. To restore, copy an individual snapshot back to its corresponding active path.