# Copyfitting and DTP decisions for Middara

## Project rules

- **20% expansion alert:** calculate `((PT characters - EN characters) / EN characters) * 100`, including spaces and excluding Markdown markup. Above 20%, review for a shorter natural rendering. Do not distort meaning or a rules instruction to hit the number. Keep the count and decision visible in the page draft when useful.
- **A count is not a fit measurement.** Check actual glyph widths, wrapping, available frame dimensions, and nearby content in the rendered target. The 20% value is a review trigger, not a universal cap or a claim that less than 20% will fit.
- **DTP exception:** when a faithful translation cannot fit the existing frame, add a note with the source unit, expansion/fit evidence, and concrete layout action. Do not silently omit, paraphrase away, or shrink text.
- **Heading hierarchy:** preserve the source typeface, size, weight, and intended hierarchy. For major titles, use available negative space, a wider frame, or a second line; explicitly tell the diagrammer not to reduce the title font. The source bounding box is evidence, not an immutable maximum for translated text.
- **Structured/variable text:** preserve numbers, symbols, placeholders, term case, and their semantic attachment to text. Do not assume visual similarity makes two units interchangeable.
- **Rich text:** preserve mixed runs and balance every markup tag. Keep separate font sizes and independent boxes separate; only preserve inline flow where the PDF shows the runs belong to the same text unit.
- **Fonts:** do not silently replace a source font with a visually similar family. Record a missing-font/fallback risk for DTP review.

## Suggested page note

```markdown
> [!DTP]
> Source unit: `ITEM UPGRADES` (page 3, PDF y≈303 pt). PT expands 62% using the official glossary term. Keep the 9 pt bold hierarchy; inspect the actual leader/frame before changing wording or type size.
```

Use this only when the actual layout warrants action. A percentage above 20% alone does not prove a collision or require a DTP flag.

## External grounding

- [W3C: Text size in translation](https://www.w3.org/International/articles/article-text-size/) explains that length changes vary with string length and that flexible layout/reflow is preferable to tight fixed frames. Its example percentages are not a Middara-specific PT-BR guarantee.
- [Microsoft: Exchanging localizable resources](https://learn.microsoft.com/en-us/globalization/localization/exchanging-localizable-resources) recommends separating localizable content from presentation, retaining translator context, then reassembling and testing the translated layout.
- [Microsoft: Localization testing](https://learn.microsoft.com/en-us/globalization/testing/how-to-perform-localization-testing) separates visual, linguistic, and contextual validation and recommends in-context review.
- [Adobe InDesign: Create and position text frames](https://helpx.adobe.com/indesign/desktop/add-and-manage-text/add-and-manage-text-frames/create-position-text-frames.html) documents moving and resizing text frames independently from scaling their text.

These sources inform the workflow; the official glossary, user's DTP choices, source PDF, and project rules govern this book.
