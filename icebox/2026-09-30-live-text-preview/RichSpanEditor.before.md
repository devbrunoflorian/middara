# Archived item: RichSpanEditor before live preview

`RichSpanEditor.before.tsx` preserves the active component before the 2026-09-30 live-edit preview change. It is archived because the old `Edit Text` mode updated only the textarea until **Confirm** was pressed, so the page could not show actual wrapping while the translator typed. The active replacement remains at `apps/web/src/components/RichSpanEditor.tsx`; this snapshot is reference/recovery material and is not imported. Restore it only to intentionally remove preview while typing.
