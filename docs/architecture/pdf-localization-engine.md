# Reusable PDF localization engine

This guide describes a reusable architecture for localizing a complex, illustrated PDF. It is independent of Middara; each PDF still needs source-specific classification and acceptance evidence.

## Pipeline

```text
Source PDF → extraction → source geometry/assets → semantic structure
  → editorial units and inline objects → locale storage/editor
  → translated flow → viewer/export → structural + visual QA
```

### Ingest and inspect

1. Record PDF page count, page boxes, rotation, fonts, embedded images and vector drawings.
2. Extract text spans, style, direction, bbox, origin/baseline, character geometry and paint-order evidence when available.
3. Extract vector/image occurrences separately. Preserve page-local coordinates and provenance; do not flatten every drawable into text.
4. Build per-page sidecars with stable source identifiers. Keep original evidence immutable where possible.
5. Review layouts that mix columns, cards, diagrams, screenshots, callouts and tables. Text extraction is not editorial classification.

### Structure and metrics

- Model visual containers only for real relationships: list → item → editorial paragraphs, table → cell, heading → body, card → its fields.
- Give every translatable unit a stable key independent of physical line wrapping.
- Give inline graphics a semantic identity and a per-occurrence recipe.
- Keep ink bounds, advance, baseline anchor/offset and line metrics separate. Preserve exact PDF geometry for source view; don't infer baselines from browser line-height.
- Track raster, vector, text and HTML as distinct paint sources to detect duplicate or omitted content.

### Locale and editor

- Store locale overrides separately from immutable source data where the existing system allows.
- Persist rich runs, semantic object IDs, style metadata and unknown/legacy values reversibly.
- Let target-language text reflow within semantic units and approved containers. Do not bind target text to source physical lines.
- Preserve list/table/card parent relations while exposing natural translated units to the translator.
- Missing translation should trigger an explicit fallback state; it is not a layout error and should never be filled with invented copy.

### Viewer and export

- Use a source-preserving renderer for untouched source content and a translated-flow renderer for changed text.
- Keep symbols from changing text leading just because their ink is taller. Draw overflow intentionally around a stable line anchor/advance.
- Export against the physical page dimensions, not the viewport. Verify MediaBox/CropBox, scale, font embedding, page count and raster output.

## WHAT TO DO

- Treat the source PDF as geometric and visual truth.
- Compare vectors/text with coordinates and baselines before changing CSS.
- Classify candidates by role and context; record confidence and unresolved cases.
- Prove a representative instance and a difficult counterexample before applying a family rule.
- Validate source, translation, persistence, reload, viewer and export independently.
- Preserve original IDs and translations when adding internal editorial structure.
- Keep exceptions explicit and reversible.

## WHAT NOT TO DO

- Do not turn proximity, size, path shape or a large vertical gap into semantics by itself.
- Do not let an SVG viewBox or ink bbox define advance or line-height automatically.
- Do not use a global line-height, font metric patch or `translateY` guess to repair a local symptom.
- Do not split translated content by physical source lines.
- Do not classify all extractable text as editable prose; it may be printed inside artwork.
- Do not hide candidate text/vectors automatically based on overlap, size or z-order alone.
- Do not certify a book because clipping is zero; structure and layer membership matter too.
