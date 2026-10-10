"""Generate the Middara Rulebook web icon set from its canonical transparent PNG."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps" / "web" / "public"
SOURCE = PUBLIC / "brand" / "middara-emblem-source.png"
BRAND = PUBLIC / "brand"


def export_png(image: Image.Image, path: Path, size: int) -> None:
    resized = image.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(path, format="PNG", optimize=True)


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Canonical emblem not found: {SOURCE}")

    with Image.open(SOURCE) as opened:
        image = opened.convert("RGBA")

    if image.size[0] != image.size[1]:
        raise ValueError(f"Expected a square emblem, got {image.size}")
    if image.getchannel("A").getextrema()[0] != 0:
        raise ValueError("Expected the canonical source to retain transparent pixels")

    BRAND.mkdir(parents=True, exist_ok=True)
    ui = image.resize((256, 256), Image.Resampling.LANCZOS)
    ui.save(BRAND / "middara-emblem-256.webp", format="WEBP", lossless=True, method=6)

    sizes = {
        "favicon-16x16.png": 16,
        "favicon-32x32.png": 32,
        "apple-touch-icon.png": 180,
        "android-chrome-192x192.png": 192,
        "android-chrome-512x512.png": 512,
    }
    for filename, size in sizes.items():
        export_png(image, PUBLIC / filename, size)

    image.save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f"Generated {len(sizes)} PNGs, favicon.ico, and {BRAND / 'middara-emblem-256.webp'}")


if __name__ == "__main__":
    main()
