"""Share approved source-art overlays with PT-BR without copying translations."""

from __future__ import annotations

import json
from pathlib import Path


PAGES_ROOT = Path("apps/web/public/pages")
SHARED_SOURCE_OVERLAYS = {
    "page_004": {
        "fidelity-overlay-book-covers.png",
        "fidelity-overlay-miniatures-dice.png",
        "fidelity-overlay-adventurer-cards.png",
        "fidelity-overlay-right-card-groups.png",
    },
    "page_005": {
        "fidelity-overlay-left-image-groups.png",
        "fidelity-overlay-right-image-groups.png",
    },
    "page_006": {
        "fidelity-overlay-left-image-groups.png",
        "fidelity-overlay-right-image-groups.png",
        "fidelity-overlay-character-art.png",
    },
    "page_007": {"fidelity-overlay-component-checkboxes.svg"},
    "page_047": {"fidelity-overlay-discard-tag-x-symbol.png"},
    "page_066": {
        "fidelity-overlay-component-inline-callout-i-tile.png",
        "fidelity-overlay-component-inline-callout-k-tile.png",
    },
    "page_072": {
        "fidelity-overlay-component-inline-scaling-star.png",
        "fidelity-overlay-component-inline-force-star.png",
    },
    "page_077": {
        "fidelity-overlay-component-conduit-summoning-card.png",
        "fidelity-overlay-component-rook-gevaudan-overlapping-card-diagram.png",
    },
    "page_078": {
        "fidelity-overlay-component-scythe-example-card.png",
        "fidelity-overlay-component-rhamsted-knight-shield-example-card.png",
    },
    "page_079": {
        "fidelity-overlay-component-cave-sickle-card-and-loot-level-scale.png",
        "fidelity-overlay-component-base-and-variation-combatant-card-pair.png",
        "fidelity-overlay-component-variation-tag-card-header.png",
    },
    "page_081": {
        "fidelity-overlay-component-alternate-combatant-card-pair.png",
        "fidelity-overlay-component-cave-sickle-variation-card-header.png",
    },
}

KEEP_LANGUAGE_SCOPED = {
    "page_016": {"fidelity-overlay-exit-tokens.png"},
}


def main() -> None:
    changed = 0
    for page_name, expected_assets in SHARED_SOURCE_OVERLAYS.items():
        path = PAGES_ROOT / page_name / "fidelity_overlays.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        overlays = data.get("overlays", [])
        found = {
            Path(overlay.get("url", "")).name: overlay
            for overlay in overlays
            if overlay.get("language") == "en"
        }
        missing = expected_assets - found.keys()
        if missing:
            raise ValueError(f"{page_name} is missing expected English image overlays: {sorted(missing)}")

        for name in expected_assets:
            overlay = found[name]
            if not overlay.get("languageInvariant"):
                overlay["languageInvariant"] = True
                changed += 1

        if page_name == "page_007":
            checkbox = found["fidelity-overlay-component-checkboxes.svg"]
            duplicate = [
                overlay for overlay in overlays
                if overlay is not checkbox
                and overlay.get("language") == "pt-BR"
                and overlay.get("url") == checkbox.get("url")
                and overlay.get("bbox") == checkbox.get("bbox")
            ]
            if duplicate:
                data["overlays"] = [overlay for overlay in overlays if overlay not in duplicate]
                changed += len(duplicate)

        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    # These source crops overlap live prose, so their PT-BR variants use
    # transparent holes and the English originals must remain locale-scoped.
    for page_name, scoped_assets in KEEP_LANGUAGE_SCOPED.items():
        path = PAGES_ROOT / page_name / "fidelity_overlays.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        for overlay in data.get("overlays", []):
            if (
                overlay.get("language") == "en"
                and Path(overlay.get("url", "")).name in scoped_assets
                and overlay.pop("languageInvariant", None) is not None
            ):
                changed += 1
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(f"Shared {changed} audited English image-overlay entries with PT-BR; no translation records were changed.")


if __name__ == "__main__":
    main()
