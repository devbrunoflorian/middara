# Ghost text review batch: page 20

- **Status:** investigation ongoing; page 20 remains uncertified. No Loot-title suppressions are active after the provisional change was withdrawn.
- **Date:** 2026-10-01.
- **Follow-up:** 2026-10-02; scanner experiment and targeted tracers only.
- **Branch:** `codex/book-visual-batch-audit`.
- **Source PDF:** `C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf`.
- **Criteria:** [`2026-10-01-grill-me-fidelity-acceptance.md`](2026-10-01-grill-me-fidelity-acceptance.md) and [Rule 07](../../.agents/rules/07-fantasmas-e-artefatos-duplicados.md).

## Why no page-wide decision is safe

The page has 37 candidate image regions and 100 extracted lines. These are screening results, not 37 proven ghosts. The book's background extraction removes text from the page content stream but only tries to clean some image/Form streams; text inside nested Forms may remain in `background.webp`. A matching title in the background therefore does not prove that the HTML viewer alone added it.

## Loot-title hypothesis reviewed and withdrawn

Twelve occurrences of `Item Loot`, `Monster Loot`, and `Unique Loot` were provisionally flagged as duplicates. This was too strong a conclusion. Offline PyMuPDF inspection of the source PDF's `get_texttrace()` and `get_bboxlog()` shows the same title text painted as `fill-text` after the relevant card image/Form. For example, `Monster Loot` is trace sequence 840 after image/path events 837–839; `Unique Loot` is trace sequence 1565 after card image event 1556; and `Item Loot` is trace sequence 1754 after image event 1750. This proves that the vector titles are part of the published PDF composition.

The first page-level paint-order sweep failed to match 28 short tokens because it required at least four characters for textual matching. I changed the read-only scanner to accept an exact short-token match only when the text-trace bbox covers at least 60% of the candidate line bbox. The page-20 rerun now maps all 100 lines to exact text traces painted after their selected local image operation; the previously unmatched set consisted of one-digit values, co-located `10` passes, and four `:` separators. The exact line IDs, trace strings, image sequence, and text sequence are listed in [`page20-paint-order-precheck.csv`](page20-paint-order-precheck.csv). This is evidence of PDF paint order, not proof that the app differs from it or that any line should be suppressed.

A second screening signal now reports image operations whose bboxes overlap a candidate line after its last matched text draw. In the three layout tracers (pages 20, 56, and 74), this signal appeared on 0/100, 35/90, and 11/241 lines respectively. It can help identify source-PDF compositions where later artwork may cover text, but bbox intersection cannot establish opacity, clipping, or actual pixel coverage; it must not change classification or rendering. A book-wide run was stopped after it proved substantially slower than the targeted tracer and before producing any result files; the larger queue remains untouched.

The earlier high-zoom viewer observation was not a side-by-side comparison against the same source-PDF crop, so it cannot establish that the app is less faithful than the PDF. I removed the provisional `rasterizedDuplicate` metadata from these 12 lines and reverted the page-20 allowlist from `scripts/apply_audited_artwork_text_suppressions.py`. The titles remain available as source text. This is an explicit correction to the earlier report and commit, not a confirmed fix.

## Hard counterexample and other open regions

Coin values can contain coincident spans with different color passes. `line_471_0` concatenates two co-located `10` spans (black and white) at the same bbox; the line string is `1010`, while the candidate image sequence 672 shows one printed value. Exact per-span matching finds two text-trace draws (`10 10`, sequences 747–748) after that image. This is a useful hard counterexample to line-level string matching: keep both original spans and do not suppress the line. Other candidate areas include the repeated Item Loot card bodies, small card values and version labels, as well as Monster/Unique card titles. Each needs evidence at the exact occurrence; no decision propagates to the full card or region.

## Implementation and verification

- The p. 20 JSON is restored so none of the 12 Loot-title lines carry the provisional suppression marker. The reusable suppression script no longer includes a page-20 rule.
- `scripts/audit_artwork_text_overlays.py` now matches short exact text tokens only when bbox coverage is at least 60%, and reports later-image bbox intersections as a separate non-verdict signal. Page-20 pilot assertions matched all 100 candidates and preserved the distinction between line strings and individual color-pass spans; the p. 20 output is retained in the linked CSV. Selected layout tracers p. 20/56/74 produced 100/90/241 candidates and later-image intersections on 0/35/11 lines. No page data was changed by this scanner.
- `PageRenderer` now passes the Admin state to every source line. Previously it only passed Admin state to lines in blocks with inline typographic units, preventing ordinary confirmed spans from receiving the Admin marker. The confirmed marker's outline/background contrast and stacking order were also strengthened.
- `npm run build -w apps/web` passed after the renderer change, with the existing unresolved `/texture.png` build warning. `python -m py_compile scripts/audit_artwork_text_overlays.py`, page-20 assertions, and `git diff --check` passed.
- The Admin indicator still needs visual confirmation in the viewer. The browser session displayed Chrome's debugger banner; it was released at the user's request. Do not reopen it during the user's series time.

## Reusable finding

For each suspected overlap, answer these separately: (1) what pixels survive in the app background; (2) what the final PDF actually paints and in what order; and (3) whether the rendered app differs from the PDF. Form/XObject text makes the first answer insufficient. A screenshot of the app by itself, a bbox overlap, or a positive example without a hard counterexample does not authorize suppression.

## Next action

Without Chrome, continue read-only classification of page-20 candidates using PDF `get_bboxlog()`/`get_texttrace()`, background crops, and exact span IDs. Use later-image bbox overlap only to prioritize manual inspection, never as a pixel-occlusion verdict. Record `source-PDF paint evidence` as a screening status, not a final `confirmed duplicate` decision. Leave data unchanged until a later same-scale PDF/viewer comparison proves the rendered app adds or alters text. Then continue the 480-region book-wide queue in [`2026-10-01-ghost-text-detector.md`](2026-10-01-ghost-text-detector.md); 454 groups still await visual disposition after 26 representative sheets were calibrated.
