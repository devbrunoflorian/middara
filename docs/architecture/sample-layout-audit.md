# Sample Layout Extraction Audit

Read-only sample analysis against the source PDF. No production page JSON, translation key, or database record was written.

## Page 2: credit categories

- Visual regions/columns: 3.
- Candidate editable categories split at bold labels ending in a colon: 17.
- Categories with source lines and original styled runs preserved: 17/17.
- Categories with a bold-label/regular-body split in the sample model: 17/17.
- Source style/color evidence: OptimaLTStd 10 pt #231f20 × 45; OptimaLTStd-Bold 10 pt #231f20 × 17.
- The boundary is a semantic style cue (bold `Label:`), not vertical proximity; original line/span geometry remains attached as lineage.

## Page 3: contents rows

- Candidate entry labels: 39.
- Page references paired by baseline within 1.5 pt: 39.
- Numeric page-reference lines left unmatched: 0.
- Matched baseline delta range: 0.49..0.55 pt.
- The dotted leaders are not treated as editable text; they remain part of the original page artwork. Page references retain separate source line/span lineage.

### First matched entries

| Entry | Page | Baseline delta (pt) |
|---|---:|---:|
| Summary of Components | 4 | 0.50 |
| Choosing a Game Mode | 8 | 0.50 |
| CRAWL MODE | 9 | 0.50 |
| ADVENTURE MODE | 10 | 0.50 |

## Page 101: index entries

- Visual columns identified from independent source blocks: 3.
- Candidate editable rows grouped by baseline (tolerance 1.25 pt): 197.
- Per-column row counts: 74, 74, 49.
- Numeric page references parsed from the right side, including comma lists/ranges: 192.
- Rows without numeric refs: 5; right-edge anomalies requiring human review: 1.
- Each row retains all same-baseline fragments and their original styled runs, including the tab/leader geometry. A numeric right-side run is exposed as a page reference when detected; the raw run remains in lineage.

### First rows per column

- `index-column-1`: **Abilities** -> `47`; 5 source fragments at baseline 126.40 pt.
- `index-column-2`: **Exit** -> `19`; 6 source fragments at baseline 126.40 pt.
- `index-column-3`: **Re-Specing** -> `87`; 2 source fragments at baseline 126.40 pt.

### Manual-review rows

- `p101-c1-r045`: `Values`; unparsed right-edge text: `Back`.

## What this proves, and what it does not

- It proves that line/baseline grouping can recover separate contents rows and separate index rows from PyMuPDF's large raw blocks while retaining exact source lineage.
- The reported region bounds are observed ink/text extents only; the audit does not promote them to translation frames. Frame geometry needs separate visual/design evidence.
- It demonstrates a reproducible credit-category boundary, but the 3-column credit region and all split units still need comparison in the app before adopting the serialized model.
- It does not write final page JSON, migrate legacy translation keys, or claim that every numeric index run has been parsed correctly.
- The sample output is evidence for the schema proposal: region geometry, semantic editable unit, original line boxes, style runs, and source lineage remain distinct fields.
