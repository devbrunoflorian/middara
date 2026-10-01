# Handoff: continue the Rulebook App translation and extraction work

- **Last updated:** 2026-09-30
- **Working branch observed during read-through:** `fix/pixel-render/overflow` at `a57f2de` (`more docs`), tracking `origin/fix/pixel-render/overflow`.
- **Master observed during read-through:** local `master` and `origin/master` at `f7e89ab` (`docs: record master promotion and recovery refs`). The feature branch is one documentation commit ahead; refs do **not** currently match.
- **Working tree at handoff update:** documentation changes for this read-through are in progress; inspect `git status --short --branch` before continuing.
- **Runtime:** the prior task started API and Vite separately after reboot. Process/session state is temporary; check listeners before starting duplicates.

This is the current continuation guide. Read it first, then follow the linked source documents; do not infer implementation approval from audit findings or plans written by a previous assistant.

## Product goal

The user wants to translate the Middara rulebook in the app while preserving the printed page's visual hierarchy and making translation units practical to edit. The immediate product goal is to make real translation progress; perfect automatic PDF reconstruction is not a prerequisite for every page. Changes must preserve existing translations/drafts and be checked against the PDF on representative layouts before generalization.

The actual runtime is a React/Vite viewer over page artwork and extracted JSON. Payload provides translation persistence. The source PDF is still the production of truth for visual text/layout; PyMuPDF blocks are extraction artifacts, not semantic paragraphs, credit categories, contents entries, or index rows.

## Required reading and operating rules

1. [`README.md`](README.md) — task history and status index.
2. [`.agents/rules/00-README.md`](../../.agents/rules/00-README.md), [rule 06](../../.agents/rules/06-comportamento-esperado-da-ia.md), and [rule 13](../../.agents/rules/13-registro-de-progresso-por-tarefa.md) — project instructions, evidence standards, small-sample policy, and mandatory task documentation.
3. [`2026-09-30-project-readthrough.md`](2026-09-30-project-readthrough.md) — confirmed current structure, data flow, documentation drift, and code facts from the broad read-through.
4. [`2026-09-30-preview-fidelity-and-credit-units.md`](2026-09-30-preview-fidelity-and-credit-units.md) — confirmed cause of live-preview fidelity loss and revised page 2 plan for separate credit label/body targets.
5. [`../architecture/text-layout-frames.md`](../architecture/text-layout-frames.md) — accepted page 2 dialogue-frame pilot and layout data contract.
6. [`../architecture/sample-layout-audit.md`](../architecture/sample-layout-audit.md) and [`../architecture/sample-key-impact.md`](../architecture/sample-key-impact.md) — reproducible sample findings and existing-key collisions.
7. [`2026-09-30-credit-editor-proof.md`](2026-09-30-credit-editor-proof.md) and [`2026-09-30-credit-draft-compatibility-audit.md`](2026-09-30-credit-draft-compatibility-audit.md) — current proof scope, browser-permission limits, and static key-compatibility findings.
8. [`2026-09-30-layout-sample-audit.md`](2026-09-30-layout-sample-audit.md), [`2026-09-30-translation-key-dry-run.md`](2026-09-30-translation-key-dry-run.md), and [`2026-09-30-translation-editor-save-point.md`](2026-09-30-translation-editor-save-point.md) — methods and earlier approved work.
9. For persistence, read [`../translation-editor-save-and-line-breaks.md`](../translation-editor-save-and-line-breaks.md) and [`../payload-database-recovery.md`](../payload-database-recovery.md). Read [`../../icebox/README.md`](../../icebox/README.md) before replacing or retiring project material.

**Documentation warning:** `docs/PROJECT_STRUCTURE.md` and portions of `.agents/rules/01–10` contain older or aspirational claims. In particular, the current extraction entry point is `scripts/extract_dom.py`, not `packages/ingest/extract_pdf.py` / `build_dom.ts`; the live viewer loads 102 page JSON files rather than only pages 1–10. Verify claims against current code and the read-through record before relying on them. `ARCHITECTURE.md` explicitly describes a target architecture rather than current implementation.

## Accepted decisions and confirmed evidence

- Translation should happen at semantic editable-unit level, with source line/span style and geometry retained as lineage. One raw PyMuPDF block is not guaranteed to be one semantic unit.
- Preserve source ink `bbox` separately from a translation layout frame. Frame width, alignment, indentation, vertical budget, and source typography are distinct properties.
- The user visually approved the page 2 dialogue-frame pilot: replacement text uses a broader measured frame (~585.63 pt), while the blue selection outline identifies original printed text during editing. This approves that single pilot only.
- Mixed style runs must survive in units like page 2 credits. A bold `Label:` and regular body belong to one credit category/editor unit; replacing the text with one tool-styled run loses that distinction in the current editor.
- Page 3 contents labels and numeric page references are separate data from vector dotted leaders. Pair an entry by baseline without making leaders editable text.
- Page 101 index rows must first be separated by column, then grouped by baseline. Equal baseline does not join entries from different columns.
- Every substantial task requires a dated record in `docs/project-progress/`, updated with method, evidence, corrections, verification, limitations, and next step. Update its index. Archive replaced project material in `icebox/` with a reason.
- Keep translation progress ahead of generalized extractor sophistication. Validate one page/unit, then a small sample. Do not run the full extractor across 102 pages as the next step.
- Static compatibility review found that adding a genuinely new local key copies and persists the existing well-formed local override map, but a legacy combined-credit override must remain the active renderer path until handled. Payload currently declares `spanKey` globally unique while language is separate; resolve this constraint in any new key design.

## Current implementation shape

- **Viewer:** `apps/web` React 19 + TypeScript + Vite. It loads `/pages/page_NNN/page_NNN_dom.json` and page backgrounds. Page 2 alone loads optional `layout_frames.json` metadata. Runtime currently sets the page `images` collection to an empty array.
- **Translation backend/admin:** `apps/admin` Payload CMS v3 + Next.js + SQLite adapter, usually port 3000. `Translations` stores `spanKey`, `language`, and JSON segment data; current schema's `spanKey` unique constraint is global.
- **Renderer/editor:** `PageRenderer.tsx` positions source lines absolutely. Current editor key is `page_${pageNumber}_block_${blockIdx}`, tied to the DOM array index. An override becomes one flowing `.realbox` using layout-frame metadata or source-derived width. Rich text selection can style character ranges, while “Edit Text” replaces segments with one style run.
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

First correct the no-op editor-open regression: opening/canceling the page 2 narrative block must not replace source-accurate lines with a left-aligned, collapsed single-style reflow. Then prove a **single page 2 credit category** with independently editable bold label and regular body. Before rendering split units, guard against the legacy combined key so old translated content remains visible and does not overlap the new units. Define stable IDs and reconcile language with Payload's global `spanKey` uniqueness. Preserve all legacy values and do not auto-split old prose. Keep pages 3 and 101 inactive until page 2 behavior and persistence are proven.

The normal Codex in-app browser API previously returned a saved-permission denial. Do not try alternate browser/CDP/network surfaces to bypass it. If a material permission change does not resolve it, use a user-run visual check or approved headless test rather than repeated attempts.

## Git state and recovery references

At the read-through snapshot, `fix/pixel-render/overflow` and its remote are at `a57f2de`; local `master` and `origin/master` are at `f7e89ab`. They do not match. Do not force-update or push either branch unless asked. Historical preservation refs from the earlier user-requested master replacement are documented in [`2026-09-30-promote-overflow-to-master.md`](2026-09-30-promote-overflow-to-master.md).

Previous handoff snapshots and their reasons are indexed in [`../../icebox/README.md`](../../icebox/README.md).
