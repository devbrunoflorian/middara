# Book typographic hierarchy and fidelity rules

This is the current evidence-based style guide for reproducing English text in the Middara Rulebook viewer. It records recurring classes, not a global template for every page. Printed cards, diagrams, labels and text over artwork must be classified in their page context.

## Observed hierarchy

| Role | Repeated source pattern | Viewer rule |
|---|---|---|
| Large decorative page title | `EsmeraldaPro`, 30 pt; selected characters may use alternates | Resolve each alternate by the source PDF glyph ID. Apply only at this family/size, per character. Keep source text and geometry intact. |
| Large section heading | Often `Cinzel-Regular` around 18 pt; a `Continued` run may be 11 pt on the same visual heading | Keep different sizes as separate editable units. Give each run its PDF position and weight; the size difference is part of the hierarchy. |
| Section/topic heading | Repeated `Cinzel-Regular`, 12 pt, often extracted in title case with small-caps flags | The renderer's regular face can look too light despite matching PDF metadata. Apply 700 only to exact headings visually confirmed against the PDF. |
| Contents subheading | `OptimaLTStd-Bold`, commonly 9 pt and all caps | Use its bundled bold face and preserve capitalization, baseline and neighboring vector leaders. |
| Body copy | Commonly `OptimaLTStd`, 10 pt | Preserve line-level size, font, inline bold, demi/black weight and italic runs. Do not flatten a mixed-style sentence to one weight. |
| Inline emphasis | Source font names/flags identify Optima and Adobe Garamond bold/italic runs | Map the matching local face and style. Compare extraction signals with appearance when the result is visually inconsistent. |

These recurring roles are supported by the source-PDF comparison on pages 2–13 and the current 102-page span inventory. They do **not** imply that every page contains every role, that all 12 pt Cinzel text is a heading, or that every same-size run belongs in one edit box. The `Cinzel-Regular` optical-weight allowlist is page/span-specific.

## Structural invariants

1. Different PDF font sizes/weights/faces always start separate edit targets. Put runs on independent lines/positions in separate boxes; keep deliberately inline runs (such as `Adventure Mode` / `Continued`) independently editable inside their shared baseline, without flattening them into one style. On p. 1, `Rulebook` (17.85 pt Cinzel) and `VERSION 1.2 - MAY 2023` (7 pt Optima Bold) have distinct source blocks and language-specific renderer keys; the viewer renders them separately. Their ink bboxes overlap vertically by 1.921 pt due to font metrics, but the screenshot shows no visible glyph collision, so bbox intersection is not an automatic merge/split decision.
2. Equal font sizes do not prove shared semantics. Split by column (`x₀` gutter), independent cards/art, baseline, indentation, paragraph gap and hierarchy; retain inline emphasis inside a unit where the source shows one reading flow.
3. Treat PDF font name and flags as provenance signals, not visual truth. The Cinzel heading case proved that source labels can say regular while the printed result needs a stronger viewer face.
4. Resolve decorative alternates per character from the embedded source glyph sequence. Do not search ordinary body text or substitute a matching letter throughout the book.
5. Separate geometry from style. Preserve source text bbox, baseline and column/frame bounds; correct local overflow or alignment only after measuring the page region and neighbor clearance.
6. Exclude raster duplicates, ghost candidates, tiny vector text and card artwork from heading inference until the PDF and the app background are compared.

## Verification record

- The 102-page inventory contains 23,584 non-empty spans. Bold and italic flags are internally consistent with the renderer's current weight/style mapping; that check does not detect optical weight differences.
- Exact-source review has applied local optical weight to 407 confirmed spans across the current corpus. The current manifest covers the reusable Cinzel candidate class; a smaller set of page-specific overrides predates that manifest.
- The 30 pt Esmeralda audit found 16 editorial title spans; 13 contain PDF-selected alternates, now represented by `displayOverride` without changing source text or bbox.
- Reproducible inputs and reports: [`audit_typographic_hierarchy.py`](../../scripts/audit_typographic_hierarchy.py), [`audit_font_asset_coverage.py`](../../scripts/audit_font_asset_coverage.py), and `tmp/typography-audit/` / `tmp/font-asset-audit/` outputs.

## Remaining known limits

The typography inventory is not a visual pass of every span. The app currently suppresses pictogram font spans pending page-specific background comparison; a first font-coverage run found 204 Zapf Dingbats spans across 34 pages and one Wingdings 3 span on page 15. Do not unsuppress or globally remap them from this count alone. The separate next stage is to reconcile these glyphs against the PDF and actual page backgrounds, then continue geometry/spacing and artwork-text duplication checks.
