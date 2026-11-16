# Middara app emblem and icons

`middara-emblem-source.png` remains the shell mark source. `middara-favicon-source.png` is the cleaner M emblem supplied on 2026-10-10 for browser and installed-app icons. Both are square RGBA PNGs with transparent pixels; neither needed background removal.

Install the small build-time dependency with `python -m pip install -r scripts/requirements-brand-icons.txt`, then run `python scripts/generate-middara-brand-icons.py` from the repository root to regenerate the shell WebP and favicon/app icon files. The shell mark is exported from its existing source; browser/app icons use the cleaner icon source. All variants are direct Lanczos reductions with transparency preserved, including 16×16 and 32×32; no alternate symbol or crop is used.

The source files are retained unchanged. Shell rendering uses `middara-emblem-256.webp`; browser and installed-app icons are generated at the conventional sizes and referenced from `apps/web/index.html` and `apps/web/public/site.webmanifest`.
