# ADR 0002: Editorial units and existing persistence

- **Status:** Accepted
- **Context:** A PDF line is not a natural translation unit, but replacing a line with a separate database record can break existing IDs, styles, list relations and Payload compatibility.
- **Decision:** Expose stable editorial units through the hybrid structure already supported by sidecars/metadata. Add a parent/container only for a real relation. Preserve translation keys unless a separately approved migration is needed.
- **Why:** Translator UX should say “edit this paragraph”; internal block/paragraph naming is an implementation detail.
- **Alternatives considered:** Independent new block for each physical line; one merged page-wide text block; schema migration for every new paragraph.
- **Consequences:** Family classification precedes batch application; reflow is per editorial unit; bullets/steps/cells retain parent relations. `Enter`/`Shift+Enter` is not a universal persisted contract yet.
