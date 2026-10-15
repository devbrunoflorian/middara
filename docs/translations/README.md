# Middara Rulebook 1.2 — translation reference and progress

This folder contains translation references, curated notes, source extracts, and page-level history. The active production route is manual EN→PT-BR translation in the Admin RichSpanEditor, saved as unit overrides. The official PDF remains the textual source of truth; app JSON, database entries, previous extraction files, and screenshots help with locating context but do not replace it.

**Escopo confirmado pelo usuário:** o conteúdo já existente no database das páginas impressas 1–12 está aprovado e deve ser preservado. A fila/drafts novos começam na p. 13; essa aprovação se refere ao conteúdo persistido, não afirma que cada página esteja integralmente traduzida.
Os estados das páginas 1–12 em `page-status.csv` são registros de auditorias anteriores, não uma solicitação para reabrir essa faixa. A fila de produção ativa começa na p. 13.

Use [`manual-editor-workflow.md`](manual-editor-workflow.md) for the current repeatable translation procedure. [`production-workflow.md`](production-workflow.md) and the Markdown templates describe the older offline draft/review process; they are reference material, not the active save/preview route. Pilot files preserve historical decisions and evidence.

## Current workflow

Translate the next page/unit manually in the Admin viewer, compare against the PDF, use the canonical glossary and limited page 2 voice sample, inspect PT reflow, then save and reload. Do not auto-translate. See the workflow guide for exact steps and for the current limits of page status, glossary matching, overflow signals, and export.

`python scripts/audit_translation_copyfit.py` remains a read-only character-expansion scanner for curated Markdown drafts; it does not scan live Payload overrides or certify visual fit.

## Files

- [`glossary.md`](glossary.md): project copy of the official glossary from `C:\Users\bruno\Middara\Rulebook 1.2\.agents\rules\glossary.md`.
- [`manual-editor-workflow.md`](manual-editor-workflow.md): active manual translation workflow in the Admin RichSpanEditor.
- [`glossary-candidates.md`](glossary-candidates.md): provisional, non-authoritative candidates and cross-page terminology conflicts found in the current drafts; requires team review before standardization.
- [`references/page-2-voice-reference.md`](references/page-2-voice-reference.md): read-only scope and caveats for using the database translation on page 2.
- [`pages/page-003.md`](pages/page-003.md): all 40 Contents labels and destinations rechecked against the PDF; PT draft exists, but six width alerts and a conflict with the saved title (`Índice` vs `Sumário`) keep the page from being approved or reimported.
- [`pages/page-004.md`](pages/page-004.md): title and 14 descriptions source-rechecked; printed `Adventures` typo and `Items Tiers` cross-reference discrepancy recorded, PT preview pending.
- [`pages/page-005.md`](pages/page-005.md): 12 descriptions rechecked against source text; 8 short heading alerts need actual PT width review, preview still pending.
- [`pages/page-006.md`](pages/page-006.md): 8 descriptions source-rechecked; `Adventurer Mode` and `Red Reveal Recoder` preserved as printed; a missing clause was restored; PT preview pending.
- [`pages/page-007.md`](pages/page-007.md): all 40 list units and four quantity subtotals rechecked against the source; 19 copyfit alerts remain pending column preview.
- [`pages/page-008.md`](pages/page-008.md): six units drafted, reconciled read-only with five Payload records and one local PT intro, and visually previewed in an isolated context; no actual state was overwritten. `Crawl Mode` remains provisional.
- [`pages/page-009.md`](pages/page-009.md): 17 saved PT-BR units recorded, six source-size/style mismatches aligned, `SHOP AND TRAIN` copyfit backed up and saved, and the full PT preview checked after read-back; `Crawl Mode` term remains provisional.
- [`pages/page-010.md`](pages/page-010.md): 22 saved PT-BR units audited; five targeted copy/style corrections read back and previewed. `Ficha de Aventura` remains a cross-page glossary decision.
- [`pages/page-011.md`](pages/page-011.md): nine saved PT-BR units reconciled and previewed; title subtitle copyedited with snapshot/read-back; the cover's three duplicate editable labels stay hidden. Status and sheet-label terminology remain candidates.
- [`pages/page-013.md`](pages/page-013.md): 25 content units and separate headings/callouts source-rechecked; five semantic placements are mapped, and the decorative flag beside `Flags` remains removed by the approved cleanup overlay; 5 copyfit alerts await preview, DIFFICULTY art stays separate.
- [`proposals/page-029-item-upgrades-v1.md`](proposals/page-029-item-upgrades-v1.md): complete page proposal drafted after p.29 PDF↔Viewer review; glossary/terminology questions and PT copyfit remain pending. No Payload or canonical data was changed.
- [`proposals/page-030-icons-conditions-tags-symbols-v1.md`](proposals/page-030-icons-conditions-tags-symbols-v1.md): complete page proposal drafted after p.30 PDF↔Viewer review; the title fit in a temporary PT PageRenderer preview. Inline symbol placement, remaining copyfit, terminology, and export review remain pending.
- [`pages/page-031.md`](pages/page-031.md): p.31 reviewed against the official PDF in the normal Viewer; it is a full-page illustration with no editorial prose to translate. Folio geometry remains outside the scope of the visual composition check.
- [`proposals/page-032-discipline-trees-v2.md`](proposals/page-032-discipline-trees-v2.md): 15 PT-BR copy targets prepared after p.32 PDF↔Viewer review; one pre-existing saved example translation is recorded and protected. A real PT Editor click exposed a nested span key, so key reconciliation, copyfit, terminology, and export remain pending.
- [`proposals/page-033-conviction-casting-v1.md`](proposals/page-033-conviction-casting-v1.md): 16 editorial copy targets drafted after p.33 source-PDF↔normal-Viewer review; the three card-art overlays remain English and need their own localization step. Copyfit, Editor key reconciliation, and PT export remain pending.
- [`proposals/page-050-flanking-rules-proposal-2026-10-15-v2.md`](proposals/page-050-flanking-rules-proposal-2026-10-15-v2.md): cinco regras de Flanqueio/BACKSTAB em snapshot isolado com os cinco símbolos semânticos; revisão terminológica e do peso visual pendente, e duas unidades excedem a borda superior do frame-fonte em menos de 0,9 pt. Nenhuma escrita no Payload.
- [`pages/page-085.md`](pages/page-085.md): draft piloto para prosa densa, dados inline e legenda A/B/C; o PDF mostra dados branco/laranja sem placement no sidecar atual, então a prévia integrada está bloqueada até reconciliar esses símbolos.
- [`source-pages/`](source-pages/): raw line-level English transcript for every PDF page, with per-span font/size/flags/bbox evidence. This generated transcript deliberately keeps artwork text and questionable reading order visible; it is not approved semantic copy or a translation.
- [`../../scripts/extract_translation_markdown.py`](../../scripts/extract_translation_markdown.py): reproducibly regenerates those raw per-page transcripts from the official 102-page PDF.
- [`../../scripts/audit_translation_copyfit.py`](../../scripts/audit_translation_copyfit.py): read-only EN/PT character-expansion report for curated drafts; alerts are not layout-fit judgments.
- [`page-status.csv`](page-status.csv): page-by-page extraction, English fidelity, and translation gate.
- [`../../.agents/skills/middara-translation-copyfit/SKILL.md`](../../.agents/skills/middara-translation-copyfit/SKILL.md): reusable translation and copyfitting workflow.
- [`editorial-casebook.md`](editorial-casebook.md): compact record of scoped human patterns, p.13 experimental evidence, failures, pending terminology, and the skill discovery/use smoke test.
- [`../../.agents/skills/middara-terminology-decisions/SKILL.md`](../../.agents/skills/middara-terminology-decisions/SKILL.md) and [`../../.agents/skills/middara-editorial-style-ptbr/SKILL.md`](../../.agents/skills/middara-editorial-style-ptbr/SKILL.md): terminology decision process and evidence-based PT-BR editorial patterns.

Curated `pages/page-NNN.md` files contain semantic translation units and their layout/style notes. `source-pages/page-NNN.md` files are a lower-level extraction aid and must not be mistaken for reviewed editorial text. Draft Markdown is not saved to the Payload database.

## Existing material

The sibling `C:\Users\bruno\Middara\Rulebook 1.2\_page_extraction\` contains older extracted/translated Markdown for pages 1–10. These files are preserved as historical drafts and terminology clues. Their grouping, 20% rule, and translation quality must be checked against the PDF and current project decisions before reuse. They are not copied over this maintained set.
