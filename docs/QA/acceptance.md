# QA status semantics and evidence

> Rule 05 owns the required policy. This document explains the status vocabulary and evidence used to apply it; the operational certification procedure is the [visual-fidelity-qa skill](../../.agents/skills/visual-fidelity-qa/SKILL.md). If wording conflicts, rule 05 prevails.

## Candidate states

- **Candidate:** geometry, glyph, overlap, unusual metrics or detector output worth inspecting. No defect implied.
- **False positive:** a suspected problem was compared with the source and the current result matches within a stated tolerance.
- **Confirmed defect:** a reproducible difference from the source or accepted interaction contract with an identified scope.
- **Known exception:** a consciously preserved source-specific case, documented with its boundary and rationale.
- **Outlier:** confirmed structure not represented by any approved family; report it before designing a new contract.
- **Inconclusive:** available evidence does not establish role, layer, or expected behavior. Do not promote to defect or pass.

## Structural PASS

A page/family passes only for its declared scope when:

- relevant source text/vector/image content is represented once, in the correct visual/editorial layer;
- live text inside artwork is not duplicated over its source paint;
- all intended inline objects retain identity, source occurrence geometry, baseline anchor and horizontal advance;
- parent/child relations for bullets, steps, callouts, cells and examples are correct;
- rich text/styles, tags and unknown metadata survive edit, reflow and reload;
- no unintended missing/duplicate content, clipping, collision or overflow exists;
- viewer and export agree, and physical page boxes match the source.

`0 clipping` and `0 collision` are necessary but insufficient. A source PDF render and coordinates are primary evidence; the viewer/export is the implementation under test.

## Evidence interpretation

The official source PDF is the primary evidence; extracted sidecars explain the source model, and viewer/export show the implementation. Raster comparison supports appearance review but cannot establish semantic classification by itself. The same observed difference can be a false positive, defect or unresolved candidate depending on source geometry and the active renderer path.

Detailed measurements and page-specific acceptance results belong in dated `docs/project-progress/` records. For example, the p. 40 A–D tolerance and viewer/export results are recorded in [the 2026-10-07 audit](../project-progress/2026-10-07-source-structure-audit-and-doc-consolidation.md); that local tolerance does not establish a book-wide tolerance for unrelated measurements.
