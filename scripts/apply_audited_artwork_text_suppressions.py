"""Apply only visually audited, page-local rasterized-text suppressions.

The source lines remain in JSON and in the Admin editor. The viewer skips
painting them in English mode where the same text is already baked into the
unchanged background artwork. Region extents were checked against the source
PDF and equal-scale app/PDF crops; do not generalize these boxes to other pages.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"

# (x0, y0, x1, y1) in source PDF points. These cover only audited raster
# artwork; surrounding explanatory text stays as live page text. Page 16's
# region is the embedded miniature Adventure Book page, whose printed text
# survives in a nested PDF form in background.webp.
AUDITED_REGIONS = {
    16: [
        (80.0, 98.0, 490.0, 660.0),  # embedded "Bombing the Sickles" page
    ],
    56: [
        (482.0, 160.0, 586.0, 301.0),
        (585.0, 160.0, 688.0, 303.0),
    ],
    74: [
        (35.0, 99.0, 422.0, 424.0),    # Nightingale Adventurer card
        (418.0, 315.0, 584.0, 429.0),  # Summoning
        (594.0, 315.0, 760.0, 430.0),  # Nirvana's Mark
    ],
}

# These letters label the explanatory callout arrows and are not part of the
# card text itself. Preserve the vector labels while suppressing duplicated
# card copy around them.
EXCLUDED_MARKER_BBOXES = {
    16: [
        (476.2434, 172.5366, 483.2454, 183.2646),  # D callout, mini-page
        (231.7111, 172.2480, 237.7141, 182.9760),  # C callout, mini-page
        (351.9911, 445.5312, 358.9931, 456.2592),  # G callout, mini-page
        (353.2149, 422.4461, 357.7149, 433.1741),  # E callout, mini-page
    ],
    74: [
        (171.3, 284.3, 178.3, 295.0),  # G
        (113.8, 324.6, 118.3, 335.4),  # F
        (339.5, 348.0, 345.5, 358.7),  # C
        (366.8, 348.0, 373.8, 358.7),  # G
        (744.5, 369.8, 751.5, 380.6),  # D
    ],
}


def center_in_region(bbox: list[float], region: tuple[float, ...]) -> bool:
    x0, y0, x1, y1 = bbox
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx0, ry0, rx1, ry1 = region
    return rx0 <= cx <= rx1 and ry0 <= cy <= ry1


def bbox_matches(a: list[float], b: tuple[float, ...], tolerance: float = 1.2) -> bool:
    return all(abs(x - y) <= tolerance for x, y in zip(a, b))


def main() -> None:
    total = 0
    for page_number, regions in AUDITED_REGIONS.items():
        path = PAGE_DIR / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        changed = []
        reason = f"text already embedded in audited page {page_number} card artwork"
        if page_number == 16:
            reason = (
                "text already embedded in page 16 miniature Adventure Book artwork; "
                "keep overlay selectable for editing"
            )
        for block_index, block in enumerate(data.get("blocks", [])):
            for line_index, line in enumerate(block.get("lines", [])):
                # Make reruns idempotent and remove flags from an earlier
                # geometry revision of this same audit only.
                if page_number == 16 and line.get("rasterizedDuplicateReason") == reason:
                    line.pop("rasterizedDuplicate", None)
                    line.pop("rasterizedDuplicateReason", None)
                excluded = any(
                    bbox_matches(line["bbox"], marker)
                    for marker in EXCLUDED_MARKER_BBOXES.get(page_number, [])
                )
                line_text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
                inside_region = any(center_in_region(line["bbox"], box) for box in regions)
                if page_number == 16:
                    should_mark = (
                        line_text
                        and not line.get("suspectedGhost")
                        and not excluded
                        and inside_region
                    )
                else:
                    # Preserve the previously audited page 56/74 manifest
                    # behavior; only page 16 adds the confirmed ghost-safe gate.
                    should_mark = not excluded and inside_region
                if should_mark:
                    line["rasterizedDuplicate"] = True
                    line["rasterizedDuplicateReason"] = reason
                    changed.append((block_index, line_index, line_text))
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        total += len(changed)
        print(f"Page {page_number}: marked {len(changed)} lines")
        for block_index, line_index, text in changed:
            if text:
                safe_text = text.encode("ascii", "backslashreplace").decode("ascii")
                print(f"  block[{block_index}].line[{line_index}]: {safe_text[:110]}")
    print(f"Total lines marked: {total}")


if __name__ == "__main__":
    main()
