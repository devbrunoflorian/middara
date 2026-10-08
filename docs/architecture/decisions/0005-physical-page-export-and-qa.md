# ADR 0005: Physical-page export and QA

- **Status:** Accepted
- **Context:** Browser viewport scale and PDF physical page dimensions are different. A visually plausible screenshot can conceal export shrink, wrong page box, missing content or duplicate paint layers.
- **Decision:** Export using the source page's physical dimensions and compare PDF page boxes, coordinates, raster and structure. Viewer, persistence and export are separate acceptance steps.
- **Why:** Print geometry is part of the PDF contract; viewport alone cannot verify it.
- **Alternatives considered:** Screenshot-to-PDF at viewport size; accepting by zero clipping only; treating a build as visual proof.
- **Consequences:** Report exact tested pages/locales/state, tolerances, viewer/API and known exceptions. No page-wide PASS based only on a machine scan.
