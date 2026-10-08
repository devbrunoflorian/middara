# Middara Rulebook Translation & Digitization

This project digitizes the "Middara Rulebook 1.2" PDF into an interactive, translatable web app. Source-PDF fidelity is an explicit requirement, but the 102-page book is not yet globally certified; current scope, evidence and open work are tracked in the [project handoff](PROJECT-HANDOFF.md).

**Resume work from [`PROJECT-HANDOFF.md`](PROJECT-HANDOFF.md) and [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).** The canonical documentation map is [`docs/README.md`](docs/README.md); dated progress files are scoped evidence, not global status.

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
2. **Translation/Overrides (Payload/SQLite)**: Saved translations and custom translation frames are persisted by Payload in the local SQLite database. Browser drafts remain separate from saved records. The active data invariants are in [rule 02](.agents/rules/02-schema-e-modelagem-de-dados.md); schema proposals and older catalog work are retained as [historical reference](docs/architecture/translation-data-schema-and-symbol-catalog.md).
3. **Rendering (React)**: `PageRenderer.tsx` combines page images, extracted PDF geometry and editable overrides. Untouched English can use source coordinates when the required geometry exists; edited/translated text reflows. The fidelity status is scoped in the handoff rather than assumed pixel-perfect.

## Project contracts and architecture

Mandatory project invariants live in the [active rules](.agents/rules/00-README.md). Procedures live in [skills](.agents/skills/README.md). The current renderer/data model and its rationale are in [docs/architecture/overview.md](docs/architecture/overview.md); read the rules and canonical documentation index before changing behavior.

## Typography & PUA

The rulebook heavily utilizes custom typography, particularly swash variants and special ornaments (from fonts like Esmeralda Pro and Cinzel).
To support this without breaking browser rendering, we map special characters to the Private Use Area (PUA) of a custom font. The `create_pua_font_all.py` script manages this generation.

## Documentation Index

- [`PROJECT-HANDOFF.md`](PROJECT-HANDOFF.md): operational first read and current workspace handoff.
- [`docs/README.md`](docs/README.md): canonical map of architecture, editorial model, symbols, QA, ADRs, history and translation workflow.
- [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md): concise status, open work and invariants.
- [`docs/project-progress/README.md`](docs/project-progress/README.md): dated evidence; status is scoped to each record.
- [`docs/history/documentation-dispositions.md`](docs/history/documentation-dispositions.md): stale, superseded and retained material.

The app remains under development and is not certified across all 102 pages. See the project state and handoff for current scope.
