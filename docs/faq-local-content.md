# Local FAQ content

The viewer's FAQ drawer uses static TypeScript data from `apps/web/src/faq/faqContent.ts`. Opening the drawer does not fetch the external site and does not read or write translation persistence.

The FAQ control sits at the upper left of the viewer. On desktop, opening it docks the FAQ on the left and shifts the PDF viewport to the right; closing it restores the original viewport. The development badge and its diagnostic panel remain at the upper right. On narrow screens the FAQ uses the full viewport instead of squeezing the PDF into a narrow strip.

## Source and scope

- Canonical source: [Middara FAQ and Errata](https://middara.com/pages/faq)
- Source locale: English.
- Last reviewed: 2026-10-10.
- The bundled content is a small, searchable set of concise English summaries, not a full mirror of the official FAQ/errata catalog. The link in the drawer opens the complete, current source.

## Locale behavior

The rulebook app does not translate FAQ content automatically. English uses the local English summaries. For PT-BR, the drawer uses the same English source and displays a notice that no official PT-BR FAQ was found at review time. Add a Portuguese data set only when an official or manually approved translation is available; keep English as the source of truth.

## Updating

Review the canonical page, update or add structured entries in `faqContent.ts`, change `FAQ_REVIEWED_ON`, and check whether the official site now offers PT-BR. Keep the source URL beside the data. Do not add runtime scraping or silently machine-translate entries.
