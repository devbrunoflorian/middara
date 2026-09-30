# Handoff: continue the Rulebook App translation and extraction work

- **Last updated:** 2026-09-30
- **Working branch:** `fix/pixel-render/overflow`
- **Code baseline:** `a8eae78` — `Fix viewer scroll and add translation frame pilot`
- **Current status:** sample audits and key-impact dry run are complete. Static source review shows additive new keys can preserve existing well-formed browser drafts, but page 2 credit rendering still needs a runtime guard for a legacy combined override and a language/key uniqueness decision. `fix/pixel-render/overflow` is now the local and remote `master`; former master tips are preserved in backup branches. Local dev servers are running from the post-reboot restart.

This is the current continuation guide. Read it first, then follow the linked source documents; do not infer implementation approval from audit findings or from plans written by a previous assistant.

## Product goal

The user wants to translate the Middara rulebook in the app, while preserving the printed page's visual hierarchy and making translation units practical to edit. The product goal is to make translation progress possible soon; perfect automatic PDF reconstruction is not a prerequisite for every page. Changes must nevertheless preserve existing translations/drafts and must be visually checked against the PDF for each representative layout before being generalized.

The app renders editable HTML over page artwork extracted from the source PDF. PyMuPDF's raw blocks are extraction artifacts, not reliable semantic paragraphs, credits, table rows, or index entries. Printed glyph bounds describe where the original ink appears; they do not automatically describe the usable width for a replacement translation.

## Required reading and operating rules

Read in this order before resuming implementation:

1. [`../project-progress/README.md`](README.md) — task history and status index.
2. [`../../.agents/rules/00-README.md`](../../.agents/rules/00-README.md), [`../../.agents/rules/06-comportamento-esperado-da-ia.md`](../../.agents/rules/06-comportamento-esperado-da-ia.md), and [`../../.agents/rules/13-registro-de-progresso-por-tarefa.md`](../../.agents/rules/13-registro-de-progresso-por-tarefa.md) — project instructions, evidence standards, small-sample policy, and mandatory task documentation.
3. [`../architecture/text-layout-frames.md`](../architecture/text-layout-frames.md) — accepted page 2 translation-frame pilot and layout data contract.
4. [`../architecture/sample-layout-audit.md`](../architecture/sample-layout-audit.md) and [`../architecture/sample-key-impact.md`](../architecture/sample-key-impact.md) — reproducible sample findings and existing-key collisions.
5. [`2026-09-30-credit-editor-proof.md`](2026-09-30-credit-editor-proof.md) and [`2026-09-30-credit-draft-compatibility-audit.md`](2026-09-30-credit-draft-compatibility-audit.md) — current proof scope, browser-permission limits, and static key-compatibility findings.
6. [`2026-09-30-layout-sample-audit.md`](2026-09-30-layout-sample-audit.md), [`2026-09-30-translation-key-dry-run.md`](2026-09-30-translation-key-dry-run.md), and [`2026-09-30-translation-editor-save-point.md`](2026-09-30-translation-editor-save-point.md) — methods and earlier approved work.
7. For saving/persistence, read [`../translation-editor-save-and-line-breaks.md`](../translation-editor-save-and-line-breaks.md) and [`../payload-database-recovery.md`](../payload-database-recovery.md). Read [`../../icebox/README.md`](../../icebox/README.md) before replacing or retiring project material.

For PDF/layout work, use the available `pdf:pdf`, `layout-debugging`, and `visual-fidelity-qa` skills where applicable. The source PDF supplied for this project is `C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf`; confirm that it exists before relying on it.

## Accepted decisions and facts

- Translation should happen at semantic editable-unit level, with source line/span style and geometry preserved as lineage. One raw PyMuPDF block is not guaranteed to be one sentence or semantic unit.
- Preserve source `bbox`/ink bounds separately from a translation layout frame. Frame width, alignment, indentation, vertical budget, and source typography are different properties.
- The user visually approved the page 2 dialogue frame pilot: replacement text uses a broader measured frame (~585.63 pt) while the blue selection outline continues to identify the original printed text during editing. This approves that single pilot, not an automatic rule for every page.
- Style runs must remain available when an editable unit contains mixed styles. On page 2 credits, a bold `Label:` and regular body are parts of one category/editor unit; flattening to the first span's style is not acceptable.
- Page 3 contents labels and their numeric page references are separate data from vector dotted leaders. They should be paired by baseline for an entry without making the leaders editable text.
- Page 101 index rows must first be separated by column, then grouped by baseline. Equal baseline does not mean two columns form one entry.
- Every substantial task needs a dated record in `docs/project-progress/` opened/updated before work. Record method, findings, failures/corrections, verification, limitations, files, and next action. Update this index and the current task record.
- Keep the app's translation goal ahead of generalized extractor sophistication. Validate one page/unit, then a small sample; do not regenerate all 102 pages as the next move.
- The static compatibility audit found that the existing local save path can preserve old entries when a new unique key is added, but a legacy combined-credit override must remain the active rendering path until handled. Payload also enforces globally unique `spanKey`; the new key design must account for language before writes.

## Evidence already produced (read-only sample)

The analyzer `scripts/audit_layout_sample.py` reads the source PDF and writes audit outputs under `tmp/layout-sample/`; it does not overwrite production page JSON. Current sample findings:

| Page | Candidate units | Main evidence | Current key risk |
|---|---:|---|---|
| 2 | 17 credit categories | Split at bold labels ending in `:`; all 17 preserve source lines and styled runs; three visual columns | Six middle-column categories map to legacy key `page_2_block_16` |
| 3 | 39 contents labels | All 39 page-reference lines paired by baseline (delta 0.49–0.55 pt); dotted leaders are vector artwork | Seven legacy keys fan out; “Summary of Components” and “Choosing a Game Mode” share `page_3_block_1` |
| 101 | 197 index rows | Three independent columns with 74/74/49 baseline groups; 192 numeric refs parsed; one right-edge anomaly (`Values` / `Back`) flagged | Existing column keys fan out to 74/74/49 proposed rows |

The key-impact script `scripts/audit_translation_key_impact.py` maps all 253 sample units uniquely to 46 current keys, using at least 98% unique bbox containment and a source-lineage cross-check. Eleven keys fan out: one on page 2, seven on page 3, and three on page 101. The read-only query found zero matching records for these 46 keys in the local current-schema SQLite snapshot `apps/admin/apps-admin.db`. **This does not prove that browser `localStorage`, another local database, or a deployed database has no drafts.**

These are sample/audit results, not production extraction or activation. The full mapping is `tmp/layout-sample/key-impact-map.json`.

## Current task: page 2 credit editor proof

The next useful product-sized proof is to edit a single page 2 credit category (label and body retaining bold/regular styling), then verify that neighboring categories and saved text are unchanged. Do not start with a batch rewrite or a key migration.

Browser inspection remains blocked by the saved permission state. The user explicitly allowed local app inspection, and settings screenshots/reporting indicated local browsing is allowed, but the normal Codex in-app browser API repeatedly returned:

> `A saved user permission setting blocks this action`

The tool expressly prohibited reaching the same page using another browser surface, raw CDP/commands, an indirect request, or policy circumvention. A full PC reboot did not change that permission result. Do not keep retrying without a material permission-state change and do not alter the firewall; the denial is a Browser Use policy gate, not evidence of a network failure.

The static source audit now establishes that new unique keys can be added without replacing well-formed old local entries: the save path copies the loaded map and stores the whole map. The actual draft values remain unknown. The renderer uses one override per current block and replaces the whole block with a flowing box; therefore the legacy combined credit key must be checked in the loaded map before rendering split units. If present, retain the legacy rendering and do not layer new categories over it. The Payload `spanKey` field is globally unique while language is a separate field; resolve this constraint in the new key contract before saving cross-language records. See [`2026-09-30-credit-draft-compatibility-audit.md`](2026-09-30-credit-draft-compatibility-audit.md).

After the reboot, both app processes were absent. They have since been started separately and confirmed ready:

- `npm run dev:api` — Next/Payload at `http://localhost:3000`, current terminal session `65763`.
- `npm run dev:web` — Vite at `http://localhost:8080/`, current terminal session `51794`.
- `Get-NetTCPConnection` confirmed listeners on ports 3000 and 8080 (`::` and `::1`, respectively).

These session IDs are temporary. If the machine/app sessions restart, check listeners before starting duplicate processes. On Windows, start the API and Vite scripts separately; the root `npm run dev` script's `&` separator did not reliably start both workspaces in this shell.

No browser storage was read/exported, no local draft was modified, and the current credit-proof task has not modified app source, production page JSON, Payload, or the database. The server startup is an environment action only.

## Safe continuation plan

1. Implement a runtime guard: if the loaded overrides contain the legacy combined credit key, keep it as the active legacy unit and suppress split-category rendering; otherwise render semantic category units.
2. Define stable credit IDs and resolve Payload's global `spanKey` uniqueness across languages. Keep the legacy key/value untouched, do not auto-split old translated prose, and provide an explicit reversible way to review legacy content.
3. Keep the pilot to page 2, preserve source lines/style runs and production DOM JSON, and do not activate page 3/page 101 units.
4. Verify relevant build/focused behavior for code changes, then present a concrete page 2 app state for visual confirmation. Generalize only after that confirmation.

## Working-tree and change status

The force-promotion initially set local/remote `master` and `fix/pixel-render/overflow` to `0d0b4b6`; documentation-only follow-up `f7e89ab` was then fast-forwarded to both and verified on all four refs. This audit's documentation commit is being advanced to both branches as well. The old remote tip `da77930` is preserved at `backup/remote-master-before-overflow-reset-20260930`; the former remote-tracking tip `9dd0b7b` is preserved at `backup/origin-master-before-upstream-rewrite-20260930`; the divergent local tip `cb4df27` is preserved locally at `backup/local-master-before-overflow-reset-20260930`. The underlying code baseline for the layout pilot is `a8eae78`. Inspect `git status --short --branch` before continuing because the working tree can change.

The task-by-task evidence and archival reasons are in `docs/project-progress/` and `icebox/`; keep active documentation in its normal location and archive only superseded versions with a reason in the item's icebox README.
