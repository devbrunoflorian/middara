# Middara Rulebook Translation & Digitization

This project aims to digitize the "Middara Rulebook 1.2" PDF into an interactive, translatable Web App while maintaining strict typographic and layout fidelity to the original book.

## Architecture

The project consists of three main pillars:
1. **Extraction (Python)**: Scripts in `/scripts` extract raw DOM data (text, bounding boxes, fonts, colors) directly from the PDF using `PyMuPDF` (`fitz`). The output is stored in JSON files per page.
2. **Translation/Overrides (Database/Local)**: Users can edit text spans (e.g., to translate them). These edits are saved as "Overrides" (currently `localStorage`, later a DB).
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
- `docs/architecture_v3_constraints.md`: Deep dive into the block-level rendering and constraint-based editor architecture.
- `docs/architecture/text-layout-frames.md`: Accepted page 2 frame pilot separating printed ink bounds from translation space, with audit findings and the plan for generalization.
- `docs/project-progress/CONTINUE-HERE.md`: mandatory handoff for developers and AI agents resuming project work.
- `docs/project-progress/README.md`: Per-task work log with methods, results, corrections, checks, and next steps.
- `docs/translation-editor-save-and-line-breaks.md`: Save point for the docked editor, live text preview, line-height, and local-first draft persistence.
- `docs/payload-database-recovery.md`: Payload database diagnosis, clone-only API verification, and the safe migration checkpoint.
- `icebox/README.md`: Index and archival policy for superseded versions and retired project items.
- `docs/QA/`: Spot checks and transcription analyses for specific pages.

---
*Note: This project strictly adheres to continuous documentation. Check `.agents/rules/doc_maintenance.md` for the documentation protocol.*
