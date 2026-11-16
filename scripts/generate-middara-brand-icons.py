"""Generate the shell emblem and clean Middara favicon/app icon set."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps" / "web" / "public"
BRAND = PUBLIC / "brand"
SHELL_SOURCE = BRAND / "middara-emblem-source.png"
ICON_SOURCE = BRAND / "middara-favicon-source.png"


def export_png(image: Image.Image, path: Path, size: int) -> None:
    resized = image.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(path, format="PNG", optimize=True)


def load_source(path: Path) -> Image.Image:
    if not path.is_file():
        raise FileNotFoundError(f"Brand source not found: {path}")

    with Image.open(path) as opened:
        image = opened.convert("RGBA")

    if image.size[0] != image.size[1]:
        raise ValueError(f"Expected a square emblem in {path.name}, got {image.size}")
    if image.getchannel("A").getextrema()[0] != 0:
        raise ValueError(f"Expected transparent pixels in {path.name}")
    return image


def main() -> None:
    shell_image = load_source(SHELL_SOURCE)
    icon_image = load_source(ICON_SOURCE)

    BRAND.mkdir(parents=True, exist_ok=True)
    ui = shell_image.resize((256, 256), Image.Resampling.LANCZOS)
    ui.save(BRAND / "middara-emblem-256.webp", format="WEBP", lossless=True, method=6)

    sizes = {
        "favicon-16x16.png": 16,
        "favicon-32x32.png": 32,
        "apple-touch-icon.png": 180,
        "android-chrome-192x192.png": 192,
        "android-chrome-512x512.png": 512,
    }
    for filename, size in sizes.items():
        export_png(icon_image, PUBLIC / filename, size)

    icon_image.save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f"Generated {len(sizes)} PNGs and favicon.ico from {ICON_SOURCE}; shell emblem remains {BRAND / 'middara-emblem-256.webp'}")


if __name__ == "__main__":
    main()
