# Debugging principles

1. **Measure first.** Record source and output coordinates, baselines, advances, paint order, MediaBox and exact viewer/API.
2. **Use the PDF as truth.** Prefer extractable geometry over raster estimates; render images confirm, but do not replace, text traces and path data.
3. **Find the first divergence.** Trace PDF → sidecar → semantic adapter → editor state → normalized runs → preview → save/reload → export.
4. **Separate geometry from meaning.** A gap, bbox or path can locate a candidate; context establishes paragraph, bullet, symbol, artwork or card.
5. **Separate ink, advance, anchor and line metrics.** Fixing one with another creates drift or line-height changes.
6. **Keep SOURCE and translated flow separate.** Exact baseline rendering for intact source does not constrain target-language line breaks.
7. **Reproduce in the live viewer.** Confirm the origin badge, locale, mode and API before interpreting screenshots or edit failures.
8. **Change the narrowest proven shared abstraction.** Do not add a page/string selector when a family contract is the cause; do not make a global rule from one instance.
9. **Protect rich content.** Check bold/italic/style boundaries, symbols, tags, selection, delete/backspace and run merges after editor changes.
10. **Validate persistence and export separately.** Save/reload, EN ↔ target locale and physical PDF output are distinct states.
11. **Document confidence and counterexamples.** Keep candidates and inconclusives visible; preserve known exceptions.
12. **Do not claim completion from a build or screenshot.** State exact scope and residual uncertainty.

## Evidence-first sequence

```text
PDF + source sidecars → viewer state → renderer branch → DOM/SVG/CSS
  → persisted override → export PDF → compare at page scale
```

Stop and revise the hypothesis when one link in this sequence contradicts the assumed cause.
