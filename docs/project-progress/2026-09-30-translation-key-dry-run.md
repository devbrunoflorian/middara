# Task: read-only translation-key impact map

- **Status:** complete for the read-only sample; editor integration and local-draft compatibility remain pending.
- **Branch:** `fix/pixel-render/overflow`
- **Starting commit:** `a8eae78` (`Fix viewer scroll and add translation frame pilot`)

## Goal

Before integrating semantic editable units for page 2 credits, page 3 contents, or page 101 index rows, map each candidate unit to the current production DOM block and legacy editor key. Identify one-to-many or ambiguous splits that could orphan or overwrite saved translations.

## Planned method

- Read the sample unit audit and production DOM JSON for pages 2, 3, and 101. Confirmed the current key formula directly in `PageRenderer.tsx`: current DOM array index, not `block.id`, forms the numeric part of `page_{page}_block_{index}`.
- Matched each sample unit's source bbox to its unique best containing production block, accepting only a unique match with at least 98% bbox containment. Retained source-block lineage as a separate cross-check because paragraph merging means source index is not necessarily a current DOM array index.
- Added `scripts/audit_translation_key_impact.py` to produce a concise report and a detailed JSON map. It asserts expected sample counts, unique unit IDs, and no ambiguous/unmatched geometry before writing results.
- Queried the current-schema `apps/admin/apps-admin.db` with SQLite `mode=ro` for the exact sampled legacy keys. No record text was read or printed. The script never writes to SQLite, page JSON, app code, browser `localStorage`, or Payload.

## Safety limits

This is an impact map only. It does not migrate or activate new translation keys and does not claim local browser drafts are absent. Existing grouped translations may not be divisible safely among newly split units; such cases must be marked for manual handling.

## Results

- All 253 sample units mapped uniquely by bbox containment: 17 page 2 credit categories, 39 page 3 contents labels, and 197 page 101 index rows.
- The 253 units touch 46 current editor keys. Eleven of those keys fan out to multiple candidate units: page 2 has 1 fanout key (six categories share it), page 3 has 7 (maximum 3), and page 101 has 3 column keys (74, 74, and 49 units).
- The highest-risk cases match the earlier concerns: six middle-column credit categories share `page_2_block_16`; “Summary of Components” and “Choosing a Game Mode” share `page_3_block_1`; and each page 101 column has one current key for dozens of candidate entries.
- The local current-schema database snapshot has zero records across the 46 exact sampled keys. This does not establish whether browser-local drafts or records on another database/deployment exist.
- No candidate units were activated and no translation keys were migrated. Existing combined translations cannot be split safely without translation-aware segmentation and a draft-preserving compatibility path.

## Corrections

- The first Markdown output included all 253 rows inline and was too long for review. The report now summarizes fanout and examples; the complete mapping remains under `tmp/layout-sample/key-impact-map.json`.
- The script's initial description said it did not query SQLite. Before the final run, it was corrected to describe and perform only an explicit read-only SQLite key-count query, consistent with the task's purpose and the database read permission already granted.
- An initial manual tally mistook the six units on the one page 2 fanout key for six separate fanout keys. A per-key aggregation corrected the totals to 1 / 7 / 3, or 11 fanout keys overall; the report now shows the fanout-key count explicitly.

## Verification

- `python scripts/audit_translation_key_impact.py` completed; all 253 units passed the count, unique-ID, and unique-geometry assertions.
- `python -m py_compile scripts/audit_translation_key_impact.py` passed.
- A separate summary of the generated JSON confirmed page counts 17/39/197, 0 ambiguous mappings, key counts 12/31/3, fanout-key counts 1/7/3, and maximum fanout 6/3/74.
- Read-only SQLite query confirmed 0 matching keys and 0 records among the 46 sampled keys in `apps/admin/apps-admin.db`.
- `git diff --check -- . ':!icebox/**'` passed before the final documentation link; rerun after closing this record.
- The sample report is [`docs/architecture/sample-key-impact.md`](../architecture/sample-key-impact.md); full mapping is `tmp/layout-sample/key-impact-map.json`.
- No production DOM JSON, app runtime code, browser storage, Payload records, or database content was modified.

## Next step

Next, design and document a non-destructive page 2 credit sidecar/editor proof that retains each existing combined key and any old combined translation as recoverable data. Before integrating, inspect the browser-local draft format through the user-approved browser context or implement a compatibility path that does not overwrite it. Request visual confirmation only after a concrete page 2 credit proof is ready.

## Files

- Analyzer: [`scripts/audit_translation_key_impact.py`](../../scripts/audit_translation_key_impact.py)
- Findings: [`docs/architecture/sample-key-impact.md`](../architecture/sample-key-impact.md)
- Layout policy: [`docs/architecture/text-layout-frames.md`](../architecture/text-layout-frames.md)
