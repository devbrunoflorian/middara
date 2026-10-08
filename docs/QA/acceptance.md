# QA acceptance contract

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

## Validation sequence

1. Record the exact PDF, printed page and PDF page index, viewer URL/API/locale/mode, source sidecars and translation state.
2. Inspect source geometry: baseline/origin, bbox, vector/image bounds, paint order, line breaks and adjacent content.
3. Inspect the same region in viewer SOURCE/EN and export. Use raster comparison as supporting evidence, not semantic classification.
4. For localized units, edit and reflow; confirm styles, inline symbols, list/table/card relation, save/reload, locale switch and fallback behavior.
5. Compare page boxes and export at the physical page size.
6. State tolerance, failures, unknowns and exact coverage. A representative test does not certify all pages.

## Audit reporting

Report candidate counts by detector and classification. Separate current adapters, known artwork/overlay intersections, signature similarities, unconfirmed overlaps and inconclusives. Never describe all geometric candidates as a defect backlog. A confirmed outlier includes page, block/region, source evidence, classification, confidence and why approved families do not fit.

## p. 40 reference check

For the ten A–D markers in the Movement Example, source advances are 9.991–10.000 pt and compound boxes are 9.996 pt. The export MediaBox matches `820.3460 × 820.3460 pt`; measured marker bbox translation is +0.257 to +0.262 pt in y and at most 0.008 pt in x. The acceptance tolerance for this comparison is 0.30 pt (less than 0.4 CSS px at 96 dpi); the viewer was visually checked at 200%. This does not establish a book-wide tolerance for unrelated measurements.
