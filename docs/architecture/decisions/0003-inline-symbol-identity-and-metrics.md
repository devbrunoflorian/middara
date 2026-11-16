# ADR 0003: Inline symbol identity and occurrence metrics

- **Status:** Accepted
- **Context:** A symbol may be a font glyph, multiple vectors, image or compound artwork, and visually similar paths can serve different purposes.
- **Decision:** Persist stable semantic `symbolId` in rich segments; source occurrence determines artwork, color/variant, bbox, advance and anchor when known. Treat ink bounds, advance, baseline anchor and line metrics separately.
- **Why:** Translation needs stable meaning while source fidelity needs the exact occurrence's geometry.
- **Alternatives considered:** Unicode/PUA as identity; storing SVG source in translation; assigning line-height from SVG viewBox; redrawing a similar installed font glyph.
- **Consequences:** A registry centralizes identity and defaults; each adapter needs source evidence. A successful standard `SemanticSymbol` test does not certify alternate renderer branches.
