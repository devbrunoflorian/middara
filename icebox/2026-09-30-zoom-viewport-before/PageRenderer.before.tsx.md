# Archived item: `PageRenderer.before.tsx`

Archived exact pre-change bytes from `apps/web/src/components/PageRenderer.tsx` at commit `266b285`.

## Why it was archived

The old viewport recomputed fit only from window resize and React dependencies; container-only changes could leave a stale fit scale. The replacement observes the actual page viewport size. It also provides reliable top/left scroll access when the page is zoomed beyond the viewport.

## Active replacement

The active file remains at `apps/web/src/components/PageRenderer.tsx`. This snapshot is not imported or used at runtime. Restore it only if deliberately reverting the zoom viewport work.
