# ADR 0001: SOURCE geometry and translated flow

- **Status:** Accepted
- **Context:** PDF uses fixed per-span origins/baselines; translated strings change length and line breaks.
- **Decision:** Preserve known origins and fragment geometry for intact source content. Reflow changed/localized text within editorial units/frames. Do not let an inferred browser line-height reposition source text.
- **Why:** One flow model cannot simultaneously keep exact source baselines and support natural target-language reflow.
- **Alternatives considered:** One global HTML paragraph flow; copying absolute source y positions to every translation; page-specific offsets.
- **Consequences:** Renderer has two paths with shared IDs/content semantics. QA must identify which path was exercised and compare source separately from translation.
