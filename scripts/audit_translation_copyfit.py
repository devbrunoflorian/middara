#!/usr/bin/env python3
"""Report EN→PT-BR character expansion for paired Markdown draft units.

Read-only: this scanner does not rewrite a translation, predict rendered fit,
or approve a page. Twenty percent is only a review alert, especially for short
labels and headings with available negative space.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIR = ROOT / "docs" / "translations" / "pages"
EN_MARKER = re.compile(r"\*\*EN(?:\s+\([^)]*\))?:\*\*")
PT_MARKER = re.compile(r"\*\*PT-BR(?:\s+\([^)]*\))?:\*\*")
HEADING_PAIR = re.compile(
    r"^(?P<level>#{2,4})\s+(?:(?P<number>\d+)\s+—\s+)?(?P<en>[^\n]+?)\s*\n+"
    r"\*\*PT-BR \(título\):\*\*\s*(?P<pt>[^\n]+)",
    re.MULTILINE,
)
ICON_PLACEHOLDER = re.compile(r"\[(?:ícone|pictograma)[^\]]*\]", re.IGNORECASE)
MARKDOWN_DECORATION = re.compile(r"[*_`]")


@dataclass(frozen=True)
class Unit:
    source_file: str
    kind: str
    english: str
    portuguese: str
    english_chars: int
    portuguese_chars: int
    expansion_pct: float

def plain_text(value: str) -> str:
    value = ICON_PLACEHOLDER.sub("", value)
    value = re.sub(r"<br\s*/?>", " ", value, flags=re.IGNORECASE)
    value = MARKDOWN_DECORATION.sub("", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def paired_units(path: Path) -> list[Unit]:
    text = path.read_text(encoding="utf-8")
    result: list[Unit] = []
    en_markers = list(EN_MARKER.finditer(text))
    for index, english_marker in enumerate(en_markers):
        next_english = en_markers[index + 1].start() if index + 1 < len(en_markers) else len(text)
        portuguese_marker = PT_MARKER.search(text, english_marker.end(), next_english)
        if portuguese_marker is None:
            continue
        english = plain_text(text[english_marker.end() : portuguese_marker.start()])
        next_paragraph = text.find("\n\n", portuguese_marker.end(), next_english)
        portuguese_end = next_english if next_paragraph < 0 else next_paragraph
        portuguese = plain_text(text[portuguese_marker.end() : portuguese_end])
        if not english or not portuguese:
            continue
        english_len = len(english)
        portuguese_len = len(portuguese)
        expansion = ((portuguese_len - english_len) / english_len * 100) if english_len else 0.0
        result.append(
            Unit(
                source_file=path.name,
                kind="paired_text",
                english=english,
                portuguese=portuguese,
                english_chars=english_len,
                portuguese_chars=portuguese_len,
                expansion_pct=expansion,
            )
        )

    # Headings have an EN label in the Markdown heading and a separate localized
    # line; include them as their own units without merging them into body text.
    for match in HEADING_PAIR.finditer(text):
        english = plain_text(match.group("en"))
        portuguese = plain_text(match.group("pt"))
        english_len = len(english)
        portuguese_len = len(portuguese)
        expansion = ((portuguese_len - english_len) / english_len * 100) if english_len else 0.0
        result.append(
            Unit(
                source_file=path.name,
                kind="heading",
                english=english,
                portuguese=portuguese,
                english_chars=english_len,
                portuguese_chars=portuguese_len,
                expansion_pct=expansion,
            )
        )
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path, help="Markdown files; defaults to curated page drafts")
    parser.add_argument("--threshold", type=float, default=20.0)
    parser.add_argument("--output", type=Path, help="Optional CSV output path")
    args = parser.parse_args()
    paths = args.paths or sorted(DEFAULT_DIR.glob("page-*.md"))
    if not paths:
        parser.error("No curated Markdown page drafts found")
    missing = [path for path in paths if not path.is_file()]
    if missing:
        parser.error("Files not found: " + ", ".join(str(path) for path in missing))

    units = [unit for path in paths for unit in paired_units(path)]
    if not args.output and hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", newline="")
    writer = csv.writer(sys.stdout, lineterminator="\n")
    fields = ["file", "kind", "english_chars", "ptbr_chars", "expansion_pct", "alert", "english_text"]
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        stream = args.output.open("w", encoding="utf-8", newline="")
        writer = csv.writer(stream, lineterminator="\n")
    else:
        stream = None
    writer.writerow(fields)
    for unit in units:
        writer.writerow(
            [
                unit.source_file,
                unit.kind,
                unit.english_chars,
                unit.portuguese_chars,
                f"{unit.expansion_pct:.1f}",
                "review" if unit.expansion_pct > args.threshold else "",
                unit.english,
            ]
        )
    if stream:
        stream.close()
        print(f"Wrote {len(units)} unit measurements to {args.output}", file=sys.stderr)
    else:
        alerts = sum(unit.expansion_pct > args.threshold for unit in units)
        print(
            f"# {len(units)} paired units; {alerts} exceed the {args.threshold:g}% alert. "
            "This is a character-count signal, not a layout-fit result.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
