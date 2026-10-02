"""Apply page-local heading weight overrides after PDF visual confirmation.

The allowlist is intentionally explicit. A matching font/size signature alone
is not sufficient evidence to change weight across the rulebook.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"
MANIFEST = ROOT / "docs/project-progress/cinzel-heading-weight-manifest.csv"

# Each item is the exact span text in the production JSON, not normalized line
# text. Page 6 has two visually continuous headings split across PDF lines.
AUDITED_HEADINGS: dict[int, set[str]] = {
    4: {"Adventure Book"},
    5: {
        "Terrain tokens", "Combatant tokens", "Effect tokens",
        "Special Effect tokens", "Ability tokens", "Damage tokens",
        "Initiative Cards", "Story Cards", "Exalted Esper cards",
        "Abraxis Cards", "Quick Reference cards", "Tiles",
    },
    6: {
        "Stamina Point (SP)", "tokens", "Encounter tokens", "Urgency tokens",
        "Tracker Tokens", "Cardboard Figure", "Standups",
        "Adventurer Tuck Bags", "Hidden Card Decks", "Red Reveal Decoder",
    },
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write allowlisted overrides")
    args = parser.parse_args()
    changed = 0
    pages: dict[int, tuple[Path, dict, bool]] = {}

    for page_number, expected_texts in AUDITED_HEADINGS.items():
        path = PAGE_DIR / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        original = path.read_text(encoding="utf-8")
        had_trailing_newline = original.endswith("\n")
        page = json.loads(original)
        pages[page_number] = (path, page, had_trailing_newline)
        found: dict[str, list[dict]] = {text: [] for text in expected_texts}
        for block in page.get("blocks", []):
            for line in block.get("lines", []):
                ghost = bool(line.get("suspectedGhost", block.get("suspectedGhost", False)))
                duplicate = bool(line.get("rasterizedDuplicate", False))
                for span in line.get("spans", []):
                    text = span.get("text", "")
                    target_text = text.strip()
                    if target_text not in found:
                        continue
                    # The PDF may also contain tiny artwork text with the same
                    # string; the allowlist is for the confirmed 12 pt heading.
                    if abs(float(span.get("size", 0)) - 12) > 0.03:
                        continue
                    if span.get("font") != "Cinzel-Regular":
                        raise SystemExit(f"p.{page_number} {target_text!r}: unexpected font {span.get('font')!r}")
                    if int(span.get("flags", 0)) != 4:
                        raise SystemExit(f"p.{page_number} {target_text!r}: expected 12pt flags=4")
                    if ghost or duplicate:
                        raise SystemExit(f"p.{page_number} {target_text!r}: ghost/duplicate requires separate review")
                    found[target_text].append(span)

        missing = [text for text, spans in found.items() if len(spans) != 1]
        if missing:
            raise SystemExit(f"p.{page_number}: expected one exact span per allowlist item; unresolved: {missing}")
        for text, spans in found.items():
            span = spans[0]
            if span.get("renderWeightOverride") != 700:
                print(f"p.{page_number}: {text} -> 700 ({'apply' if args.apply else 'dry run'})")
                if args.apply:
                    span["renderWeightOverride"] = 700
                    changed += 1

    with MANIFEST.open(encoding="utf-8-sig", newline="") as handle:
        manifest_rows = list(csv.DictReader(handle))
    for row in manifest_rows:
        page_number = int(row["page"])
        if page_number not in pages:
            path = PAGE_DIR / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
            original = path.read_text(encoding="utf-8")
            pages[page_number] = (path, json.loads(original), original.endswith("\n"))
        path, page, _ = pages[page_number]
        try:
            line = page["blocks"][int(row["blockIndex"])]["lines"][int(row["lineIndex"])]
            span = line["spans"][int(row["spanIndex"])]
        except (IndexError, KeyError, TypeError) as error:
            raise SystemExit(f"Manifest target no longer exists: p.{page_number} {row}") from error
        if span.get("text") != row["spanText"] or span.get("font") != "Cinzel-Regular":
            raise SystemExit(f"Manifest target drifted: p.{page_number} {row['lineText']!r}")
        expected_size = float(row["sizePt"])
        if abs(float(span.get("size", 0)) - expected_size) > 0.03 or int(span.get("flags", 0)) != 4:
            raise SystemExit(f"Manifest signature drifted: p.{page_number} {row['lineText']!r}")
        if line.get("suspectedGhost", page["blocks"][int(row["blockIndex"])].get("suspectedGhost", False)) or line.get("rasterizedDuplicate", False):
            raise SystemExit(f"Manifest target is now ghost/duplicate: p.{page_number} {row['lineText']!r}")
        if span.get("renderWeightOverride") != 700:
            span["renderWeightOverride"] = 700
            changed += 1
            print(f"p.{page_number}: {row['lineText']} -> 700 ({'apply' if args.apply else 'dry run'})")

    if args.apply:
        for path, page, had_trailing_newline in pages.values():
            rendered = json.dumps(page, ensure_ascii=False, indent=2)
            path.write_text(rendered + ("\n" if had_trailing_newline else ""), encoding="utf-8")

    print(f"Validated {sum(map(len, AUDITED_HEADINGS.values())) + len(manifest_rows)} exact spans; {'updated '+str(changed) if args.apply else 'no files written'}.")


if __name__ == "__main__":
    main()
