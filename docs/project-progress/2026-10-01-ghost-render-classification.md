# Ghost classification in the reader and Admin

- **Status:** completed for renderer policy and page 16's confirmed hidden-text panels; book-wide review remains active.
- **Date:** 2026-10-01.
- **Branch:** `codex/book-visual-batch-audit`.
- **Related decisions:** [`2026-10-01-grill-me-fidelity-acceptance.md`](2026-10-01-grill-me-fidelity-acceptance.md), especially decisions 1 and 4–12.

## Objective

Make the rendering policy match the user's ghost-review decisions: a detector's `suspectedGhost` flag is only a candidate signal and must not by itself hide text. Only an explicitly confirmed, localized duplicate may be suppressed in normal reading. Confirmed source spans remain available and visibly identified in Admin, and every action must preserve the source data.

## Riskiest assumption and smallest slice

The current `PageRenderer.tsx` treated `suspectedGhost` as a suppression instruction in two places: `extractBlockInfo` omitted its spans from the editable block text, and `LineRenderer` did not render suspected lines unless selected. This contradicts the accepted policy. First correct only these renderer semantics, expose explicit `rasterizedDuplicate` status in Admin, and use page 13/16 as a false-positive/confirmed-positive pair.

## Acceptance checks

1. On page 13, the known false-positive heading `Adventure Mode Continued` is present in ordinary EN view and remains part of the Admin source/edit selection.
2. Explicitly confirmed `rasterizedDuplicate` lines stay hidden in normal reading, while the underlying source remains available and marked in Admin.
3. `suspectedGhost` alone never changes visibility or editability.
4. Recheck page 16's confirmed local suppression as a positive control and ensure ordinary text adjacent to those lines is preserved.
5. Run the web build and focused page checks. This slice does not classify any new line or authorize wider suppression.

## Findings before code changes

- `PageRenderer.tsx` lines near 312 skip every `suspectedGhost` span while assembling Admin edit info.
- `LineRenderer` near 1238 hides every unselected `suspectedGhost` line in ordinary and Admin rendering.
- Existing explicit `rasterizedDuplicate` markers are already local to reviewed lines and are the correct suppression mechanism for this tracer.
- The user's latest interview answers require confirmed ghosts to remain accessible and visibly identified in Admin. The existing renderer did not provide an explicit Admin status marker, so the tracer will cover this requirement locally without changing detection or classification.
- A read-only inspection of page 20 at 200–400% showed the candidate Loot Deck cards and embedded labels in the viewer. It did not resolve the 37 region dispositions; no page 20 data will be changed on that basis.
- Removing the blanket `suspectedGhost` filter made 48 readable overlay lines on page 16 appear over the source PDF's red scrambled hidden-text fills. The PDF render contains no matching readable copy in those panels; the viewer did. This is a confirmed duplicate under the accepted rule. The two exact-coincident page-number spans at the same bbox are a hard counterexample and remain unclassified because they could be paint/style passes.
- Page 13 `Adventure Mode Continued` has no `suspectedGhost` marker in its current JSON; its presence remains a useful normal-view control, but it does not alone prove behavior of the old suppression path.

## Updated implementation slice

Mark only the 48 page 16 panel-text lines by exact line ID, with a structured per-occurrence record containing source page/region, line text+bbox from the JSON, the rule used, and the PDF/render comparison. Keep the two coincident page-number spans outside the manifest. Then compare p. 13 and p. 16 at normal-view scale and verify the Admin marker for confirmed lines. Do not batch other suspected candidates.

## Result / limits

Renderer correction is in place: `suspectedGhost` no longer suppresses or drops lines from Admin edit text; explicit `rasterizedDuplicate` lines remain hidden in normal view and are rendered with an Admin-only dashed red outline and a status description/tooltip. Page 13's heading is visible in ordinary EN view at 100%. On page 16, source-PDF comparison confirmed 48 readable lines over the original red hidden-text panels as duplicates; they now have exact line-ID allowlisting and structured evidence. The two coincident `55` spans remain unclassified. The previous 154 locally confirmed lines remain suppressed, for 202 explicit duplicates on the inset.

Verification: `npm run build -w apps/web` passed (known `/texture.png` warning only); `python -m py_compile scripts/apply_audited_artwork_text_suppressions.py`, the page-16 idempotency/hash check, the 48 confirmed / 2 pending span assertions, and `git diff --check` passed. The p. 16 normal view was visually reloaded at Fit to Screen after JSON change; red source-art panels remain, readable overlays are gone, and the page number ambiguity remains untouched. Admin mode was opened to confirm the confirmed lines are accessible and marked. No drafts, translations, Payload, database, or source PDF/artwork were changed.

The 37 p. 20 regions remain unresolved; its contact sheets and isolated viewer pass did not provide enough aligned PDF↔app evidence to classify them. Continue by a new page/class tracer, preserving ambiguity rather than widening page-16 rules. The 480-region queue and the main 102-page fidelity objective remain active.
