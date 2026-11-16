"""Correct verified lines where a large inline asterisk distorts browser layout.

The source PDF positions ordinary prose correctly, but a single oversized
asterisk/space expands the extracted line bbox and shifts the browser flex
baseline. This is an explicit allowlist: the mixed-font heading on p.77 is
intentionally excluded. Original span sizes and boxes remain available for
editing; renderSizeOverridePt affects only the web rendering.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from normalize_pdf_line_geometry import dominant_text_box


ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "apps/web/public/pages"
TARGETS = {
    72: {
        "line_49_0": "If the stat in question is a Force Value",
        "line_69_0": "Some Icons, numbers, or Combat Dice",
        "line_102_0": "FU: PULL 3, FORCE",
    },
    77: {"line_196_33": "determine the Scaling Icons"},
    89: {"line_16_5": "Some Combatants will have a"},
    91: {"line_16_1": "When calculating the total"},
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write verified rendering-only corrections")
    args = parser.parse_args()
    changed_lines = 0

    for page_number, expected_lines in TARGETS.items():
        path = PAGES / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        page_changed = False
        for block in data.get("blocks", []):
            for line in block.get("lines", []):
                line_id = line.get("id")
                expected_fragment = expected_lines.get(line_id)
                if not expected_fragment:
                    continue
                joined = "".join(str(span.get("text", "")) for span in line.get("spans", []))
                if expected_fragment not in joined:
                    raise SystemExit(f"p.{page_number} {line_id}: expected text fragment changed: {joined!r}")
                candidate = dominant_text_box(line)
                if candidate is None:
                    raise SystemExit(f"p.{page_number} {line_id}: no dominant prose spans")
                dominant_size, text_box, _ = candidate
                corrected = []
                for span in line.get("spans", []):
                    size = float(span.get("size", 0))
                    text = str(span.get("text", ""))
                    oversized_glyph_or_gap = text.strip() in {"", "*"} and size > dominant_size * 1.25
                    if oversized_glyph_or_gap:
                        old_override = span.get("renderSizeOverridePt")
                        if old_override is None or abs(float(old_override) - dominant_size) > 0.01:
                            corrected.append((text, size, dominant_size))
                        if args.apply:
                            span["renderSizeOverridePt"] = dominant_size
                bbox = line.get("bbox")
                if not isinstance(bbox, list) or len(bbox) != 4:
                    raise SystemExit(f"p.{page_number} {line_id}: invalid line bbox")
                bbox_changed = abs(float(bbox[1]) - text_box[1]) > 0.01 or abs(float(bbox[3]) - text_box[3]) > 0.01
                if not corrected and not bbox_changed:
                    continue
                if args.apply:
                    bbox[1] = text_box[1]
                    bbox[3] = text_box[3]
                    page_changed = True
                changed_lines += 1
                changes = ", ".join(f"{text!r} {old:g}pt->{new:g}pt" for text, old, new in corrected) or "no oversized spans left"
                print(f"p.{page_number} {line_id}: prose bbox y={text_box[1]:.3f}..{text_box[3]:.3f}; {changes}")
        if args.apply and page_changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"verifiedLines={changed_lines} applied={args.apply}")


if __name__ == "__main__":
    main()
