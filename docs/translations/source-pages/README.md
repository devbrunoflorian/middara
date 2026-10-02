# Raw PDF text extraction

The 102 Markdown files in this directory are generated from the official 102-page PDF by `scripts/extract_translation_markdown.py`.

Each file keeps PyMuPDF's text-block/line stream and prints the text plus each run's font, nominal point size, flags, and PDF bounding box. This makes source details reviewable and leaves mixed styles visible. It does **not** determine semantic paragraph boundaries, intended reading order across columns, editorial versus artwork text, or whether an app page faithfully renders the source. The per-line PT field is a placeholder, not a translation.

Regenerate all pages with:

```powershell
python scripts/extract_translation_markdown.py
```

Regenerate selected PDF pages with:

```powershell
python scripts/extract_translation_markdown.py --pages 5,13
```

Use the corresponding curated file under `docs/translations/pages/` for reviewed English-to-Portuguese semantic units. Never copy raw lines into production without checking the source page and relevant art regions.
