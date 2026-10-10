# FAQ and Errata local catalog

The viewer reads the static, provenance-aware catalog at `apps/web/src/faq/faqCatalog.json` through `apps/web/src/faq/faqContent.ts`. Opening the panel does not fetch the official site and does not read or write Rulebook translation persistence.

The left-side panel has separate **FAQ** and **ERRATA** tabs. Both support search and category filtering. Errata also filters by Critical, Major, and Minor severity. The panel preserves page references as metadata, labels spoilers, and links back to the current official page. On desktop, it docks left and shifts the PDF viewport right; while open, the FAQ and development controls are hidden behind the panel so their icons cannot overlap it. On narrow screens, the panel fills the viewport.

## Canonical current source

- Page: [Middara FAQ and Errata](https://middara.com/pages/faq)
- Snapshot reviewed: 2026-10-10
- Current source locale: English.
- Snapshot counts: 76 FAQ entries and 46 Errata entries. The site's “Middara 1.1 Errata Notes” preface is stored separately and is not counted as an Errata item.
- Current FAQ categories: Abilities, Combatants, Effects, Encounter Interactions, General, Movement, Terrain, UM1 Encounters. Current Errata severities: 6 Critical, 9 Major, 31 Minor; category spelling/capitalization from the official source is retained.
- The page's client bundle URL and SHA-256 are recorded in the catalog so the snapshot can be traced and updated without runtime scraping.
- Current HTML fields such as `Source FAQ`, `Notes`, example links, affected component, severity, and spoiler flag are retained in `sourceMetadata` or first-class fields where available.

## Historical auxiliary source

The Dropbox archive `1.1 FAQ and Errata.zip` is an official historical snapshot dated 2021-04-12, primarily for Middara 1.1. It supplements the current site; it never replaces or silently overrides it. The archive checksum and the checksums of the included source PDFs are recorded in `faqCatalog.json`.

The catalog contains 76 historical FAQ questions (74 from `FAQ 4-12-21.pdf` and 2 from the spoiler FAQ section) and 47 historical Errata items (35 from `Errata 4-12-21.pdf` and 12 from `Spoiler Errata and FAQ 4-12-21.pdf`). Two text-layer boundary errors were repaired after checking the PDF pages: the p. 3 “Is the damage reduction…” question/answer was split from the preceding Reach answer, and the unheaded paragraph on p. 5 was kept as a continuation of the preceding no-legal-space answer rather than shown as a synthetic question.

The PDFs expose a text/OCR layer, which can contain character and spacing errors. Historical records retain their source document and PDF page, and OCR-derived text is labeled. Two spoiler FAQ answers were visually checked. The Middara Content Guide PDF is retained as provenance/context only; it describes the 1.1 materials and the intent to carry issues into the 1.2 printing.

### Reconciliation counts

The status on each current-site entry describes its relationship to historical material:

- **FAQ:** 72 `CURRENT_MATCH`, 3 `CURRENT_MODIFIED`, 1 `CURRENT_ONLY`; 1 historical-only question.
- **Errata:** 42 `CURRENT_MATCH`, 3 `CURRENT_MODIFIED`, 1 `CURRENT_ONLY`; 1 historical-only item (Blade of Babylon).
- Historical Errata severity totals are 8 Critical, 9 Major, and 30 Minor. These reflect the 2021 documents and are separate from current website severity counts.
- `AMBIGUOUS` is a supported status, but no entry was assigned it in this reconciliation. Similarity alone was not treated as a match.

The historical records remain attached to their current counterpart when a defensible title/content mapping exists. Historical-only records remain visible and clearly labeled. The Rulebook 1.2 incorporation field is independent of site reconciliation status.

## Rulebook 1.2 status

- **Gigas Grip:** marked `VERIFIED_IN_RULEBOOK_1_2`, with evidence at source page 78. The 2021 Errata itself says the revised rule and a worked example were added to the Rule Book, and the checked-in Rulebook 1.2 source page contains the Gigas Grip section and example. It is historical reference, not an outstanding correction.
- **Paralyze / Special Encounter Rules:** verified against source page 95, which states that Paralyze does not affect Actions or Abilities granted by Special Encounter Rules.
- Other historical Rule Book errata covered by the PDF's general 1.2 inclusion statement are labeled `OFFICIAL_1_2_INCLUSION_COMMITMENT`, not individually verified. The UI calls this out as a historical inclusion statement rather than a pending fix.

## Print & Play archive inventory

Large Print & Play PDFs are not imported as text. Their filenames, archive paths, sizes, spoiler flags, and broad relation metadata are recorded under `printAndPlayAssets`. The critical-only PDF is associated with Critical severity; the encounter PDF is associated with encounter categories. These are category-level hints, not claims that each asset maps one-to-one to particular text entries. Card replacement files and the Gatekeeper errata remain metadata-only. `Unintentional Malum Act 1 Visual Manifest.pdf` is at the ZIP root, not inside the Print & Play subfolder, and is catalogued as a visual manifest rather than FAQ/Errata text.

## Local format and locale behavior

Each entry has a stable `id`, `type`, `category`, English title/body, source metadata, page references, spoiler status, and (for Errata) severity. Current website reconciliation uses `status`; historical records preserve their own source and `reconciliationStatus`. `rulebook12Status` and optional evidence describe incorporation separately. `pageReferences` keeps the numeric references, while `pageReferenceDetails` records source provenance and whether the reference is verified as a Rulebook 1.2 page, another book/component, or unverified. This lets a future viewer link avoid sending a PG. 423 card/encounter reference to Rulebook page 423.

English is the source of truth. PT-BR displays an entry only when a reviewed per-entry translation is present; otherwise the UI explicitly marks the English fallback. No automatic translation is performed. Translation metadata includes a place to reference the canonical Rulebook glossary, but this catalog does not translate the entries.

## Updating the snapshot

1. Review the official current page and its structured content; do not make runtime scraping part of the app.
2. Save a dated snapshot, record the page/bundle URL and checksums, and update the local JSON catalog.
3. Reconcile each new or changed entry by title and substantive content; keep `AMBIGUOUS` when evidence is insufficient.
4. Keep historical 1.1 records and their provenance; do not promote them to current status merely because the wording is similar.
5. Check page references, categories, severities, spoiler flags, and known Rulebook 1.2 evidence. Do not label a historical commitment as independently verified.
6. Add PT-BR only after human review, with the canonical glossary available to the translator.
