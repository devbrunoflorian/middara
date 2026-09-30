# Handoff: continue the Rulebook App translation and extraction work

- **Last updated:** 2026-09-30
- **Working branch:** `fix/pixel-render/overflow`; page 2 save point is `310bd82` (`feat: finalize page 2 translation fidelity pilot`), one local commit ahead of `origin/fix/pixel-render/overflow` at the last check.
- **Master observed during read-through:** local `master` and `origin/master` at `f7e89ab` (`docs: record master promotion and recovery refs`). The feature branch is one documentation commit ahead; refs do **not** currently match.
- **Working tree at handoff update:** the read-only full-book fidelity scanner, its audit report, page matrix, and handoff updates are in progress/uncommitted. Inspect `git status --short --branch` before continuing.
- **Runtime:** Vite remains available at `http://localhost:8080/`. Payload was restarted via npm on port 3000 and now returns HTTP 200. The local ignored `apps/admin/.env` sets `DATABASE_URL=file:./apps-admin.db`. This is the existing current-schema database; the tracked legacy `middara.db` is not used by Payload.

This is the current continuation guide. Read it first, then follow the linked source documents; do not infer implementation approval from audit findings or plans written by a previous assistant.

## Product goal

The user wants to translate the Middara rulebook in the app while preserving the printed page's visual hierarchy and making translation units practical to edit. The immediate product goal is to make real translation progress; perfect automatic PDF reconstruction is not a prerequisite for every page. Changes must preserve existing translations/drafts and be checked against the PDF on representative layouts before generalization.

The actual runtime is a React/Vite viewer over page artwork and extracted JSON. Payload provides translation persistence. The source PDF is still the production of truth for visual text/layout; PyMuPDF blocks are extraction artifacts, not semantic paragraphs, credit categories, contents entries, or index rows.

## Required reading and operating rules

1. [`README.md`](README.md) — task history and status index.
2. [`.agents/rules/00-README.md`](../../.agents/rules/00-README.md), [rule 06](../../.agents/rules/06-comportamento-esperado-da-ia.md), and [rule 13](../../.agents/rules/13-registro-de-progresso-por-tarefa.md) — project instructions, evidence standards, small-sample policy, and mandatory task documentation.
3. [`2026-09-30-project-readthrough.md`](2026-09-30-project-readthrough.md) — confirmed current structure, data flow, documentation drift, and code facts from the broad read-through.
4. [`2026-09-30-preview-fidelity-and-credit-units.md`](2026-09-30-preview-fidelity-and-credit-units.md) — confirmed cause of live-preview fidelity loss and revised page 2 plan for separate credit label/body targets.
5. [`2026-09-30-implement-preview-credit-pilot.md`](2026-09-30-implement-preview-credit-pilot.md) — implementation, browser QA, corrections, and remaining persistence limitation for the current pilot.
6. [`2026-09-30-payload-save-reset-safety.md`](2026-09-30-payload-save-reset-safety.md) — database correction, API CRUD proof, legacy-record handling, and PT reset/close guard.
7. [`2026-09-30-heading-baseline-audit.md`](2026-09-30-heading-baseline-audit.md) — title baseline cause and candidate Esmeralda offset; the user later approved the page 2 result as impeccable.
8. [`2026-09-30-page2-credit-units.md`](2026-09-30-page2-credit-units.md) — expansion to all 17 audited page 2 credit categories; covered by the user's page 2 approval.
9. [`2026-09-30-page2-overflow-and-title-alternates.md`](2026-09-30-page2-overflow-and-title-alternates.md) — hide overflow marks outside Admin, align translated Esmeralda/PUA headings through the block override path, add a no-blue Discord link to the Portuguese Special Thanks credit, and record the PUA/bold Payload probe.
10. [`2026-09-30-book-wide-english-fidelity-audit.md`](2026-09-30-book-wide-english-fidelity-audit.md) — page-2 lessons, non-uniform audit method, page statuses, and plan for the other 101 pages.
11. [`2026-09-30-book-fidelity-scan.md`](2026-09-30-book-fidelity-scan.md) and [`book-fidelity-page-matrix.csv`](book-fidelity-page-matrix.csv) — first full 102-page machine screen, evidence, font-risk queue, and limits; this is the current audit status.
11. [Visual reference rule](../../.agents/rules/references/README.md) — canonical PDF path and required comparison practice.
12. [`../architecture/text-layout-frames.md`](../architecture/text-layout-frames.md) — accepted page 2 dialogue-frame pilot and layout data contract.
13. [`../architecture/sample-layout-audit.md`](../architecture/sample-layout-audit.md) and [`../architecture/sample-key-impact.md`](../architecture/sample-key-impact.md) — reproducible sample findings and existing-key collisions.
14. [`2026-09-30-credit-editor-proof.md`](2026-09-30-credit-editor-proof.md) and [`2026-09-30-credit-draft-compatibility-audit.md`](2026-09-30-credit-draft-compatibility-audit.md) — proof scope and static key-compatibility findings.
15. [`2026-09-30-layout-sample-audit.md`](2026-09-30-layout-sample-audit.md), [`2026-09-30-translation-key-dry-run.md`](2026-09-30-translation-key-dry-run.md), and [`2026-09-30-translation-editor-save-point.md`](2026-09-30-translation-editor-save-point.md) — methods and earlier approved work.
16. For persistence, read [`../translation-editor-save-and-line-breaks.md`](../translation-editor-save-and-line-breaks.md) and [`../payload-database-recovery.md`](../payload-database-recovery.md). Read [`../../icebox/README.md`](../../icebox/README.md) before replacing or retiring project material.

**Documentation warning:** `docs/PROJECT_STRUCTURE.md` and portions of `.agents/rules/01–10` contain older or aspirational claims. In particular, the current extraction entry point is `scripts/extract_dom.py`, not `packages/ingest/extract_pdf.py` / `build_dom.ts`; the live viewer loads 102 page JSON files rather than only pages 1–10. Verify claims against current code and the read-through record before relying on them. `ARCHITECTURE.md` explicitly describes a target architecture rather than current implementation.

## Accepted decisions and confirmed evidence

- Translation should happen at semantic editable-unit level, with source line/span style and geometry retained as lineage. One raw PyMuPDF block is not guaranteed to be one semantic unit.
- Preserve source ink `bbox` separately from a translation layout frame. Frame width, alignment, indentation, vertical budget, and source typography are distinct properties.
- The user visually approved the page 2 dialogue-frame pilot: replacement text uses a broader measured frame (~585.63 pt), while the blue selection outline identifies original printed text during editing. This approves that single pilot only.
- Mixed style runs must survive in units like page 2 credits. A bold `Label:` and regular body belong to one credit category/editor unit; replacing the text with one tool-styled run loses that distinction in the current editor.
- The page 2 PDF audit identifies 17 credit categories in three columns. Each now has separate label/body targets. `Playtesters` retains its existing semantic key; six middle-column units share one legacy block and remain behind the legacy-key fallback.
- Page 3 contents labels and numeric page references are separate data from vector dotted leaders. Pair an entry by baseline without making leaders editable text.
- Page 101 index rows must first be separated by column, then grouped by baseline. Equal baseline does not join entries from different columns.
- Every substantial task requires a dated record in `docs/project-progress/`, updated with method, evidence, corrections, verification, limitations, and next step. Update its index. Archive replaced project material in `icebox/` with a reason.
- Keep translation progress ahead of generalized extractor sophistication. Validate one page/unit, then a small sample. Do not run the full extractor across 102 pages as the next step.
- The active Payload API passed HTTP 200 and isolated CRUD on a temporary PT key; the temporary key was deleted. A read-only SQLite check confirmed seven rows in `apps-admin.db`, zero probe rows, and two unchanged rows in legacy `middara.db`; no draft text was read.
- `middara.db` contains two legacy PT rows for page 2 at old line-bbox keys, mapping to lines 4 and 5 of narrative block 12. They were intentionally left in the tracked legacy database and were not flattened/migrated. The user accepts reconstructing the page 2 draft if necessary.
- Payload still declares `spanKey` globally unique while language is separate; preserve language-qualified keys and account for that schema constraint in future key designs.
- PT editor Reset, closing with unsaved changes, and selecting another block with unsaved changes now request confirmation. Browser visual QA is pending because saved site-access settings block automated access to the local origin; do not use alternate surfaces to bypass it.
- Large `EsmeraldaPro` headings now have a narrowly scoped 12% downward visual-offset candidate applied to both source spans and translated block overrides, including PUA-font segments. The extractor drops PyMuPDF span `origin`/baseline; this remains a heuristic and requires the user's visual check before calibration is accepted.
- Overflow outlines are now gated on Admin mode. The Portuguese Special Thanks body links “Canal Beta do Discord” through sidecar metadata while inheriting the segment's styling; external navigation is suppressed in Admin mode.
- Payload round-trip on a disposable key confirmed PUA glyph/font and bold weight survive; the temporary row was deleted. Actual editor/browser persistence and visual checks remain user-confirmation items.

## Current implementation shape

- **Viewer:** `apps/web` React 19 + TypeScript + Vite. It loads `/pages/page_NNN/page_NNN_dom.json` and page backgrounds. Page 2 alone loads optional `layout_frames.json` and `credit_units.json` metadata; the sidecar may assign several semantic units to one source block. Runtime currently sets the page `images` collection to an empty array.
- **Translation backend/admin:** `apps/admin` Payload CMS v3 + Next.js + SQLite adapter, usually port 3000. `Translations` stores `spanKey`, `language`, and JSON segment data; current schema's `spanKey` unique constraint is global.
- **Renderer/editor:** `PageRenderer.tsx` positions source lines absolutely. Current legacy editor key is `page_${pageNumber}_block_${blockIdx}`, tied to the DOM array index. For page 2 credits, that legacy key stays active if present; otherwise each of 17 label/body pairs uses language-qualified semantic keys. A no-op editor open does not replace original lines. Changed text uses `.realbox`; page 2 block_12 has a measured centered frame and line-height pilot. Rich text selection can style character ranges, while genuinely changed “Edit Text” still replaces the text with the chosen current style.
- **Override format:** loader accepts legacy segment arrays and a version-2 envelope (`segments`, `textAlign`); writes use the envelope. Payload API persistence was verified with a disposable new key; user-facing save/reload has not been checked in the blocked browser session.
- **Persistence:** language-specific `localStorage` map under `middara-lines-v2-${lang}` is loaded first; Payload is fetched and merged over local values for duplicate keys. Saving optimistically updates the local map, then attempts Payload and preserves the local draft if server save fails.
- **Extraction:** `scripts/extract_dom.py` directly reads PyMuPDF dict blocks, treats non-page-sized images as content, uses PyMuPDF dict enumeration as an image z-order proxy for ghost overlap, not `get_bboxlog()` paint-order proof, heuristically merges vertically adjacent blocks, and assigns each merged block's union of glyph line bounds as `availableX`/`availableWidth`. The heuristic is not a validated semantic segmentation algorithm and has hard-coded input/output paths; do not batch-run it.
- **Audit scripts:** `scripts/audit_layout_sample.py` and `scripts/audit_translation_key_impact.py` are read-only sample/dry-run tools writing under ignored `tmp/layout-sample/`; their outputs do not feed production rendering.
- **Other packages:** `packages/schema` defines a Zod book/page/block target schema but is not the viewer's direct source of page data. `packages/ingest` currently has a TypeScript Payload ingester; it is not the current PDF extractor. `apps/api` is a separate legacy Drizzle schema and is not the active runtime.

## Sample audit results (read-only)

| Page | Candidate units | Evidence | Current key risk |
|---|---:|---|---|
| 2 | 17 credit categories | Split at bold labels ending in `:`; all preserve source lines and styled runs; three visual columns | Six middle-column categories map to legacy key `page_2_block_16` |
| 3 | 39 contents labels | All 39 reference lines paired by baseline (delta 0.49–0.55 pt); leaders are vector artwork | Seven legacy keys fan out; first two entries share `page_3_block_1` |
| 101 | 197 index rows | Three independent columns with 74/74/49 baseline groups; 192 numeric refs parsed; one anomaly (`Values` / `Back`) flagged | Existing column keys fan out to 74/74/49 rows |

All 253 sample units mapped uniquely to 46 current keys by at least 98% unique bbox containment plus lineage cross-check. Eleven keys fan out. A read-only query found zero matching records for these 46 keys in one local current-schema SQLite snapshot. This does not prove browser `localStorage`, another database, or a deployed database has no drafts.

## Current priority and safe next action

The page 2 frontend pilot has been implemented and previously visually inspected in Chrome: opening/canceling the narrative editor preserves original lines; `Playtesters:` and its list open under separate keys; changed test text updates the field preview. The legacy combined key remains a guarded fallback. The PDF guide is linked from `.agents/rules/00-README.md`. Payload API CRUD was tested with a temporary key that was deleted.

**Verification complete:** final `npm run build -w apps/web` passed; lint completed with existing warnings and no errors; `git diff --check` passed. A read-only DB check confirmed seven current-schema rows, no temporary probe record, and the two legacy rows remain untouched. Automated browser access to the saved-blocked local origin is unavailable, so current UI changes have not been visually verified.

**Next priority:** page 2 save point is committed as `310bd82`. The read-only machine screen of all 102 PDF/JSON page pairs is complete: compared span text/style/bboxes match, but 61 pages use fonts dependent on remote or system fallback and 32 contain PUA symbols. See the scan report and matrix; these counts are candidates, not confirmed errors. Validate the heterogeneous app-render sample (pages 3, 4, 6, 13, 15, 24, 101) against the PDF at the same scale, then fix only proven shared causes and recheck all pages using them. App-origin browser access remains blocked by saved preferences; do not bypass it through CDP/Playwright or another surface. No page is visually approved by the scanner alone. Do not expand translation to a page until its English source status is visually approved or an explicit exception is recorded.

## Git state and recovery references

At the last branch check, `fix/pixel-render/overflow` was at `310bd82` and one commit ahead of its remote. Local `master` and `origin/master` remain at the earlier recorded `f7e89ab`; do not force-update or push either branch unless asked. Historical preservation refs from the earlier user-requested master replacement are documented in [`2026-09-30-promote-overflow-to-master.md`](2026-09-30-promote-overflow-to-master.md).

Previous handoff snapshots and their reasons are indexed in [`../../icebox/README.md`](../../icebox/README.md). Failed PNPM bootstrap artifacts are preserved at [`../../icebox/2026-09-30-pnpm-install-prompt-artifacts/README.md`](../../icebox/2026-09-30-pnpm-install-prompt-artifacts/README.md). The pre-update handoff/index/skill copies are at [`../../icebox/2026-09-30-handoff-before-persistence-credit-update/README.md`](../../icebox/2026-09-30-handoff-before-persistence-credit-update/README.md); the earlier pre-pilot copy remains at [`../../icebox/2026-09-30-handoff-before-preview-credit-pilot/README.md`](../../icebox/2026-09-30-handoff-before-preview-credit-pilot/README.md).
