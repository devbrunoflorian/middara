# Middara Rulebook Translation & Digitization

This project aims to digitize the "Middara Rulebook 1.2" PDF into an interactive, translatable Web App while maintaining strict typographic and layout fidelity to the original book.

## Local development

Run both services from the repository root:

```powershell
npm run dev
```

The launcher starts the viewer at `http://127.0.0.1:8080/` and Payload at `http://localhost:3000/admin` concurrently on Windows, macOS and Linux. Ctrl+C stops both process trees. For one service, use `npm run dev:web` or `npm run dev:api`.

Payload opens SQLite directly; there is no separate database server to launch. The current local `.env` points to `apps/admin/apps-admin.db`. Preserve that database and saved translations when restarting or reinstalling dependencies.

## Architecture

The project consists of three main pillars:
1. **Extraction (Python)**: Scripts in `/scripts` extract raw DOM data (text, bounding boxes, fonts, colors) directly from the PDF using `PyMuPDF` (`fitz`). The output is stored in JSON files per page.
2. **Translation/Overrides (Payload/SQLite)**: Saved translations and custom translation frames are persisted by Payload in the local SQLite database. Browser drafts remain separate from saved records. See `docs/architecture/translation-data-schema-and-symbol-catalog.md` for the current contract.
3. **Rendering (React)**: The `PageRenderer.tsx` takes the PDF DOM + Overrides and renders HTML that sits pixel-perfect over the original page images.

## Core Principles (Constraints over Freedom)

Through trial and error, we discovered that giving the translation editor "too much freedom" (free font choice, line-by-line formatting, arbitrary CSS properties) breaks the rigid layout of a PDF.

We operate under **Constraints**:
1. **Semantic Styling:** A text block is identified by its purpose (e.g., "Body Text", "Title", "Stat"). The editor assigns a semantic class, and the App enforces the correct font, weight, and size.
2. **Block-Level Rendering:** Instead of rendering text line-by-line absolutely (which causes translated text to shoot out of the page bounds), text is rendered as contiguous paragraph blocks (`<p>`) with a fixed width, allowing the browser to handle natural line breaks (`word-wrap`) and justification.

## Typography & PUA

The rulebook heavily utilizes custom typography, particularly swash variants and special ornaments (from fonts like Esmeralda Pro and Cinzel).
To support this without breaking browser rendering, we map special characters to the Private Use Area (PUA) of a custom font. The `create_pua_font_all.py` script manages this generation.

## Documentation Index

- `docs/project-progress/2026-10-04-restart-recovery-and-live-qa.md`: restart recovery, parallel dev startup, database checks and the current visual-review gate.
- `docs/project-progress/2026-10-04-page29-fixed-artwork.md`: source-confirmed artwork and numeric paint corrections with before/PDF/after evidence.
- `docs/architecture_v3_constraints.md`: Deep dive into the block-level rendering and constraint-based editor architecture.
- `docs/architecture/text-layout-frames.md`: Accepted page 2 frame pilot separating printed ink bounds from translation space, with audit findings and the plan for generalization.
- `docs/project-progress/CONTINUE-HERE.md`: mandatory handoff for developers and AI agents resuming project work.
- `docs/project-progress/2026-10-01-book-wide-typographic-units.md`: active plan to identify editable typography units and style hierarchy across all 102 pages before geometry audits.
- `docs/project-progress/README.md`: Per-task work log with methods, results, corrections, checks, and next steps.
- `docs/translation-editor-save-and-line-breaks.md`: Save point for the docked editor, live text preview, line-height, and local-first draft persistence.
- `docs/payload-database-recovery.md`: Payload database diagnosis, clone-only API verification, and the safe migration checkpoint.
- `icebox/README.md`: Index and archival policy for superseded versions and retired project items.
- `docs/QA/`: Spot checks and transcription analyses for specific pages.

---
*Note: This project strictly adheres to continuous documentation. Check `.agents/rules/doc_maintenance.md` for the documentation protocol.*
