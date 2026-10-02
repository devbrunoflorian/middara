# Ghost text review batch: page 20

- **Status:** tracer localizado concluído; a página segue **não certificada** porque 37 regiões candidatas ainda não receberam disposição individual.
- **Data:** 2026-10-01.
- **Branch:** `codex/book-visual-batch-audit`.
- **Source PDF:** `C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf`.
- **Criteria:** [`2026-10-01-grill-me-fidelity-acceptance.md`](2026-10-01-grill-me-fidelity-acceptance.md) and [Rule 07](../../.agents/rules/07-fantasmas-e-artefatos-duplicados.md).

## Goal and method

Exercise the ghost-review method on a dense page without treating a whole page or image as one class. Review the final source PDF, extracted page background, candidate bboxes, and English viewer. Require one confirmed positive and a hard counterexample before making a narrow change. Preserve ambiguous lines and keep every suppression reversible and auditable.

## Confirmed positive: Loot card titles

The card artwork prints `Item Loot`, `Monster Loot`, or `Unique Loot`; the same title also appeared as an HTML line at the corresponding bbox. PDF/background crop `tmp/ghost-audit/page20-hires/p020-imgseq828.jpg` and the earlier 400% browser capture support the duplicate classification. The exact allowlist contains 12 line IDs across four repeated rows:

`line_538_0`, `line_1073_0`, `line_1126_0`, `line_1137_0`, `line_1147_0`, `line_1162_0`, `line_1173_0`, `line_1183_0`, `line_1198_0`, `line_1209_0`, `line_1219_0`, `line_1234_0`.

Only these 12 lines in `apps/web/public/pages/page_020/page_020_dom.json` are marked `rasterizedDuplicate`. Each carries an evidence record with source page, region, rule, audit ID, and this report as evidence reference. The normal viewer capture after the change shows one title per card and retains row/category labels, levels, and visible values. It did not reveal loss of adjacent text.

## Hard counterexample and limits

Coin values can contain coincident spans with different color passes. `line_471_0` (`10`, candidate image sequence 672) remains unmarked; the crop shows one printed value and cannot justify removing either pass. This is a control against expanding the title-specific fix to numbers, all text in cards, or the 37-region candidate set.

The 37 page-level candidate regions / 100 extracted lines are not all classified. This tracer resolves only the 12 repeated Loot titles. Other title/body overlaps, vector text, and ambiguous color passes still need per-region decisions; p. 20 remains open and uncertified.

## Implementation and verification

- `scripts/apply_audited_artwork_text_suppressions.py` now has an exact page-20 line-ID/text manifest and a `--page` option. Applying page 20 twice was idempotent by SHA-256; assertions confirmed exactly 12 audited IDs and that `line_471_0` stays untouched.
- The normal viewer showed one title per Loot card after the change. The updated production build passed with `npm run build -w apps/web`; existing unresolved `/texture.png` build warning remains.
- `python -m py_compile scripts/apply_audited_artwork_text_suppressions.py` and `git diff --check` passed.
- Admin-mode visibility/marking is not signed off in this tracer. Inspection found that `PageRenderer` only passed `isAdmin` to source lines in blocks with inline typographic units, so ordinary source lines could not display the Admin marker. The prop is now passed to every line, and confirmed spans receive a stronger red outline/background and high stacking order. The local Chrome session raised an unwanted debugging banner; browser control was released at the user's request before a post-fix visual check. Build passes, but Admin appearance still needs browser confirmation.

## Reusable finding

An image can contain readable title text while the extracted PDF text layer paints the same title again. A repeated card layout can provide enough repeated examples to confirm only the exact title lines. Matching bboxes, image overlap, font, color, or `suspectedGhost` status are screening signals, not proof. A same-page hard counterexample may share geometry while needing preservation; therefore the disposition belongs to an exact line occurrence with evidence, not to an entire card class or region.

## Next action

Resume without broadening this fix: visually verify Admin markers once the browser session is available, then review remaining page-20 candidates in small class-based batches against PDF and viewer. Record each region as `confirmed duplicate`, `legitimate vector`, or `ambiguous`. Do not certify p. 20 or generalize its rules while unresolved candidates remain. For the book-wide queue, continue the 480-region review batch process in [`2026-10-01-ghost-text-detector.md`](2026-10-01-ghost-text-detector.md); 454 groups still await visual disposition after 26 representative sheets were calibrated.
