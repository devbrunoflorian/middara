# ADR 0004: Source artwork and structural classification

- **Status:** Accepted
- **Context:** PDFs contain editable text, rasterized labels, card art, page furniture, vectors and stale/duplicate text in the same extraction API.
- **Decision:** Extraction identifies candidates; context and paint/source comparison assign editorial, component, artwork, diagram, table, decoration or false-positive role. Never suppress or promote by bbox, font size, adjacency or path shape alone.
- **Why:** Geometric proximity does not express semantics or layer membership.
- **Alternatives considered:** Hide all text covered by images; convert every nearby vector into inline symbol; infer paragraph breaks from a global gap threshold.
- **Consequences:** Audits report candidates, confirmed defects, false positives, exceptions, outliers and inconclusives separately. New structure remains open until source evidence exists.
