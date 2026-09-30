# Archived item: `PageRenderer.before.css`

Archived exact pre-change bytes from `apps/web/src/components/PageRenderer.css` at commit `266b285`.

## Why it was archived

The previous page stage centered its child through flex alignment even when the page exceeded the scroll viewport. The replacement uses auto margins to center only while the page fits and lets oversized content start at the scroll origin.

## Active replacement

The active file remains at `apps/web/src/components/PageRenderer.css`. This snapshot is not imported or used at runtime. Restore it only if deliberately reverting the zoom viewport work.
