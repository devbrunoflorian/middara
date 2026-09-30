# Task: static audit of translation-draft compatibility

- **Status:** complete for static source behavior; actual browser-draft contents and visual integration remain unverified.
- **Branch:** `fix/pixel-render/overflow`
- **Starting commit:** `c3d192e` (`docs: record project handoff publication`)

## Goal

Determine whether a page 2 semantic credit proof can use new isolated editor keys while preserving any existing combined-block translation draft, without reading browser storage or changing app behavior.

## Method

- Read the handoff and active credit-editor proof record first.
- Trace the current key construction, draft read/write/restore behavior, rendering override, and editor save path in source code.
- Establish whether the existing code path allows a non-destructive side-by-side versioned key scheme, or whether draft metadata/value inspection is still necessary.
- Do not inspect Chrome/Codex storage, execute browser or CDP commands, query storage via terminal, modify app code, production JSON, database, or drafts.

## Verification and limits

This audit can prove source-level key isolation and write behavior. It cannot prove whether a user's browser currently contains a draft, what that draft says, or whether another deployment/database has state. If integration safety still depends on those unknowns, stop before implementation/activation and report the exact constraint.

## Results

- Current editor identity is `page_${pageNumber}_block_${blockIdx}` in `PageRenderer.tsx:531`. It is tied to array position, so it is not a stable semantic identity for new credit categories.
- Browser persistence uses one language-scoped key, `middara-lines-v2-${lang}` (`PageRenderer.tsx:179`), whose JSON is an array indexed into a `Map` by `spanKey` (`:250-265`). The save handler clones the current map, sets only the saved `spanKey`, and serializes the complete map (`:372-384`). Therefore, saving a truly new unique key through this path preserves existing well-formed legacy entries; it does not require inspecting their contents.
- Payload saves query by both `spanKey` and `language`, update a matching document, or create one (`PageRenderer.tsx:200-226`). However, the Payload collection declares `spanKey` globally unique (`apps/admin/src/collections/Translations.ts:15`) while `language` is a separate field. A key reused across languages can collide in the collection. New key design must either encode language or separately address the uniqueness schema; do not assume the query's language filter makes the schema composite.
- Local overrides are loaded first and server records are merged over them (`PageRenderer.tsx:296-309`), so the server copy wins for a duplicate key in memory. No browser data or local draft values were inspected.
- The renderer selects the override for exactly one current block key (`PageRenderer.tsx:531-535`) and substitutes a single flowing `.realbox` when that override exists (`:547 onward`). A legacy translation for the merged credits block can therefore still represent all six middle-column categories. Rendering new per-category units over it without a runtime compatibility rule risks overlapping the legacy text. Static key isolation alone does not establish visual safety.

## Decision

**Storage-level compatibility: feasible without reading `localStorage`, if new keys are unique and saved additively. Visual activation: not yet approved.** Before enabling semantic credit units, implementation must check whether the current legacy key has an override in the already-loaded `overrides` map. If it does, keep the legacy block as the active editor/rendering path and do not layer split credit units over it. If it does not, the new units can use stable distinct keys. This guard can preserve drafts at runtime without exposing their contents. A visual page 2 check is still required before generalization.

Use an explicit stable credit-unit namespace (and resolve the Payload language uniqueness constraint) rather than deriving new identity from `blockIdx`. Do not reset/delete the legacy key as part of this pilot. No app code, browser storage, production page JSON, database, or Payload record was changed during this audit.

## Next step

The next step may implement a narrowly gated page 2 proof: old legacy key present means legacy block stays active; absent means semantic credit units can be used under distinct stable IDs. Resolve the language/global uniqueness contract explicitly. Keep page 3/page 101 inactive, build and inspect the concrete page 2 state, then request the user's visual confirmation.
