---
name: tracer-bullets
description: Build software in small, end-to-end vertical slices with immediate validation and feedback. Use when implementing a feature, scaling a workflow, or when the user mentions tracer bullets, small batches, or avoiding broad unverified changes.
---

# Tracer Bullets

Use this workflow to reach working evidence early instead of building broad layers on unverified assumptions.

## Workflow

1. Identify the riskiest assumption on the critical path.
2. Choose the smallest useful slice that crosses the necessary layers, such as data → transformation → UI → persistence, or source PDF → extracted span → renderer → browser comparison.
3. Inspect the existing code and project rules first. Reuse current interfaces and tools where possible.
4. Implement only that slice. Keep the change easy to inspect and reversible.
5. Validate immediately with the cheapest check that proves behavior, then verify its visible or persisted result where relevant.
6. Record the actual result, limitations, and next slice before broadening.
7. Expand by repeating the loop. Do not generalize from one successful example until a second representative case supports the rule.

## Guardrails

- Do not build multiple disconnected layers before proving the first end-to-end path.
- A passing build or scanner proves only what it checks; do not present it as visual or behavioral validation.
- Distinguish confirmed facts, hypotheses, and unresolved cases in reports.
- Preserve existing data, keys, and user work while validating a slice.
- When an example reveals a counterexample, narrow or revise the rule before scaling it.
- Follow the user's authorization and the repository's rules. If the user has authorized autonomous execution, continue through the agreed scope without repeatedly asking for approval.

## Middara example

For a font family currently suppressed by the viewer, first choose one exact glyph on one page. Trace its source bbox/codepoint, compare the PDF crop to the app's served background, implement or retain only the proven local behavior, and verify the result in context. Then test known counterexamples before scanning every occurrence. Never remap the whole glyph family based on one page.

## Source

Adapted from the tracer-bullets technique in *The Pragmatic Programmer* and the [AI Hero article](https://www.aihero.dev/tracer-bullets).
