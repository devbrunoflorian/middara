# Middara app emblem

`middara-emblem-source.png` is the canonical attached emblem supplied on 2026-10-10. It is a 1254×1254 RGBA PNG with transparent background pixels; no background removal or artwork edits were needed.

Install the small build-time dependency with `python -m pip install -r scripts/requirements-brand-icons.txt`, then run `python scripts/generate-middara-brand-icons.py` from the repository root to regenerate the UI WebP and favicon/app icon files. The export downsamples the exact source with Lanczos filtering. The 16×16 and 32×32 favicons remain direct emblem reductions; no alternate symbol or crop is used.

The original source is retained unchanged. Shell rendering uses `middara-emblem-256.webp`; browser and installed-app icons are generated at the conventional sizes and referenced from `apps/web/index.html` and `apps/web/public/site.webmanifest`.
