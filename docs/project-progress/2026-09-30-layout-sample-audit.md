# Task: sample layout extraction audit

- **Status:** sample audit complete; app integration and translation-key compatibility work remain pending.
- **Branch:** `fix/pixel-render/overflow`
- **Starting commit:** `a8eae78` (`Fix viewer scroll and add translation frame pilot`)

## Goal

Move the column/layout plan forward in a small, reviewable step. Inspect representative cases from page 2 (body and mixed-style credits), page 3 (contents entries), and page 101 (multi-column index). Keep source text geometry, intended translation space, editable units, and styles as separate concepts. Do not modify the 102-page production extraction or translation database during the sample audit.

## Method

1. Read the project layout/debugging and visual-fidelity guidance, the current `extract_dom.py`, current DOM JSON for pages 2, 3, and 101, the existing frame-pilot decision, and the translation persistence paths.
2. Opened the supplied source PDF and rendered pages 2, 3, and 101 for visual comparison. Inspected the source PDF with PyMuPDF directly rather than treating existing JSON as ground truth.
3. Added `scripts/audit_layout_sample.py`. It reads only the source PDF and writes a detailed JSON snapshot under `tmp/layout-sample/` plus a concise Markdown report. It does not overwrite page JSON or call the Payload API.
4. Split the representative content using evidence specific to each layout:
   - Page 2 credit categories start at a bold span ending in `:`; following source lines belong to that category until the next such label.
   - Page 3 contents labels pair with the separate page-number block by baseline, within 1.5 pt. Dotted leaders remain PDF artwork.
   - Page 101 is split into three source columns, then same-baseline fragments within each column are grouped with a 1.25 pt tolerance. Numeric right-edge references are parsed separately while retaining their original source runs.
5. Queried both local SQLite databases using immutable/read-only SQLite connections to check server-side key impact. Did not read or modify browser `localStorage`.
6. Added a tracked audit report and updated the layout policy with sample findings and migration boundaries.

## Results

- Page 2: three credit columns yielded 17 category units. All 17 have a bold-label/regular-body split in the audit representation; source line boxes and original font/color runs are retained. Observed styles are `OptimaLTStd-Bold`, 10 pt, `#231f20` for labels and `OptimaLTStd`, 10 pt, `#231f20` for body text.
- Page 3: 39 contents labels paired with 39 page references. Baseline differences ranged from 0.49 to 0.55 pt. “Summary of Components” pairs with 4; “Choosing a Game Mode” pairs with 8.
- Page 101: three independent source blocks yielded 74, 74, and 49 baseline groups (197 candidate rows). 192 numeric references were parsed, including comma-separated references and ranges. Four rows appear to be section headings without page numbers.
- One anomaly is flagged for human review: the row whose label is “Values” has “Back” at the right edge instead of a numeric page reference in the source PDF.
- The current-schema `apps-admin.db` contains seven English translation records and no records for the sampled legacy keys checked. The old-schema `middara.db` contains two coordinate-based Portuguese records, which are not directly compatible with current `spanKey` keys.
- Browser-local drafts use `localStorage` key family `middara-lines-v2-{language}`. Their contents were not inspected, so this task makes no claim that local drafts are absent.

## Corrections made during the task

- The first page 101 reference parser used the left edge of a numeric run. It missed a right-aligned reference when the run's left edge was far inside the column. The check now uses the run's right edge against the column boundary.
- The first numeric parser handled comma-separated numbers but not ranges. It now recognizes forms such as `92-93` and `100,41-43`.
- “Values Back” was initially treated as a single label after the reference parser failed to recognize “Back”. The source PDF crop confirmed that “Back” is printed in the page-reference position. The audit now separates the label `Values`, records `Back` as unparsed right-edge text, and flags it for human review instead of guessing.
- The first draft assigned observed text bounds to a `layoutFrame`. That would repeat the original ink-bounds/margin mistake. The sample model now calls them `sourceBounds` and explicitly marks frames as not inferred from ink.

## Verification and limits

- Ran `python scripts/audit_layout_sample.py --report docs/architecture/sample-layout-audit.md` successfully.
- Ran `python -m py_compile scripts/audit_layout_sample.py` successfully.
- Ran assertions for 17 credit units, 39/39 contents pairings, the first two expected contents references, 197 index rows, per-column counts, 192 parsed references, and the single “Values / Back” review case. All passed.
- `git diff --check -- . ':!icebox/**'` passed.
- Rendered PDF review crops and JSON audit output were created under `tmp/pdfs/` and `tmp/layout-sample/`. Cleanup of those generated artifacts was blocked by the automatic review policy for recursive deletion; they remain organized under `tmp/` and are not production inputs.
- The visual comparison was of the original PDF only. No React/renderer code changed in this task, so no app build or user-side visual confirmation was required.
- No production DOM JSON, translation key, database record, or 102-page batch was modified.

## Next step

Prepare an app-facing sample sidecar and a dry-run translation-key compatibility map before splitting any current block into multiple editable units. Keep every legacy key and local draft recoverable; do not activate new page 2/3/101 units until their mapping is explicit. Then integrate the smallest page 2 credit case and request visual confirmation in the app before applying the same model to the contents/index pages.

## Files

- Analyzer: [`scripts/audit_layout_sample.py`](../../scripts/audit_layout_sample.py)
- Findings: [`docs/architecture/sample-layout-audit.md`](../architecture/sample-layout-audit.md)
- Layout contract and remaining plan: [`docs/architecture/text-layout-frames.md`](../architecture/text-layout-frames.md)
- Existing database checkpoint: [`docs/payload-database-recovery.md`](../payload-database-recovery.md)
