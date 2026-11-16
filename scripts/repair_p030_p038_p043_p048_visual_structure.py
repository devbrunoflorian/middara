"""Apply source-measured flow geometry and classify physical card artwork.

The p.30/p.38 line flags opt into exact PDF span advances; the p.43/p.48
artwork metadata keeps printed physical cards outside the text editor. The four
p.48 crops are exact source-PDF reconstructions, not re-typeset card content.
"""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_ROOT = ROOT / "apps/web/public/pages"
AUDIT_ID = "2026-10-07-source-structure-review-through-p48-v1"
EVIDENCE = "docs/project-progress/2026-10-07-source-structure-review-through-p48.md"

SOURCE_LINES = {
    30: {
        "line_41_5": "they will be printed with numbers in them. For example, ( 3 ) means that an ",
    },
    38: {
        "line_35_4": " is rolled during this Spell, the Spell automatically fails to affect the target. Immediately deal 3 IRREDUCIBLE DMG to the ",
    },
}

P43_ARTWORK_BLOCKS = ["block_46", "block_47", "block_48", "block_50", "block_52"]

P48_CARDS = [
    {
        "name": "false-idol",
        "bbox": [116.992, 215.031, 236.480, 389.284],
        "blocks": ["block_95", "block_96", "block_97", "block_98", "block_99", "block_101"],
    },
    {
        "name": "war-axe",
        "bbox": [251.751, 214.783, 369.549, 389.520],
        "blocks": ["block_30", "block_85", "block_86", "block_87", "block_88", "block_90"],
    },
    {
        "name": "abbadons-subtlety",
        "bbox": [148.460, 585.380, 342.311, 718.958],
        "blocks": ["block_108", "block_110", "block_111", "block_115", "block_116"],
    },
    {
        "name": "hammer-helm",
        "bbox": [478.534, 583.108, 671.120, 715.501],
        "blocks": ["block_20", "block_21", "block_22", "block_23", "block_24"],
    },
]


def dom_path(page_number: int) -> Path:
    folder = PAGE_ROOT / f"page_{page_number:03d}"
    return folder / f"page_{page_number:03d}_dom.json"


def load_dom(page_number: int) -> tuple[Path, dict]:
    path = dom_path(page_number)
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("page_number") != page_number:
        raise ValueError(f"Stale page signature in {path}")
    return path, data


def close(a: float, b: float, tolerance: float = 0.03) -> bool:
    return abs(float(a) - float(b)) <= tolerance


def set_source_geometry_flags() -> list[str]:
    changed = []
    for page_number, targets in SOURCE_LINES.items():
        path, data = load_dom(page_number)
        lines = {line["id"]: line for block in data["blocks"] for line in block.get("lines", [])}
        for line_id, expected_text in targets.items():
            line = lines.get(line_id)
            if not line:
                raise ValueError(f"Missing source line p.{page_number} {line_id}")
            text = "".join(span.get("text", "") for span in line.get("spans", []))
            if text != expected_text:
                raise ValueError(f"Changed text at p.{page_number} {line_id}: {text!r}")
            if not line.get("spans") or any(len(span.get("bbox", [])) != 4 for span in line["spans"]):
                raise ValueError(f"Missing source span geometry at p.{page_number} {line_id}")
            line["renderSourceSpanGeometry"] = True
            changed.append(f"p.{page_number}:{line_id}")
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def mark_artwork_blocks(page_number: int, block_ids: list[str], region: str, evidence_ref: str) -> None:
    path, data = load_dom(page_number)
    blocks = {block["id"]: block for block in data["blocks"]}
    missing = set(block_ids) - set(blocks)
    if missing:
        raise ValueError(f"Missing physical-artwork blocks p.{page_number}: {sorted(missing)}")
    for block_id in block_ids:
        block = blocks[block_id]
        block["artworkOnly"] = True
        block["artworkOnlyEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": page_number,
            "region": region,
            "rule": "the extracted lines are printed inside a physical card and are not rulebook prose units",
            "evidenceRef": evidence_ref,
        }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def assert_exact_card_regions(page_data: dict) -> None:
    blocks = page_data["blocks"]
    for target in P48_CARDS:
        x0, y0, x1, y1 = target["bbox"]
        intersects = set()
        for block in blocks:
            bx0, by0, bx1, by1 = block["bbox"]
            if bx0 < x1 and bx1 > x0 and by0 < y1 and by1 > y0:
                intersects.add(block["id"])
        if intersects != set(target["blocks"]):
            raise ValueError(
                f"Card crop {target['name']} overlaps unexpected page text: "
                f"expected={sorted(target['blocks'])}, actual={sorted(intersects)}"
            )


def render_card_overlays(source_pdf: pymupdf.Document) -> int:
    page_number = 48
    page_dir = PAGE_ROOT / f"page_{page_number:03d}"
    overlay_path = page_dir / "fidelity_overlays.json"
    overlays_data = json.loads(overlay_path.read_text(encoding="utf-8")) if overlay_path.exists() else {"overlays": []}
    if not isinstance(overlays_data.get("overlays"), list):
        raise ValueError(f"Invalid fidelity overlay sidecar: {overlay_path}")
    page_data = json.loads(dom_path(page_number).read_text(encoding="utf-8"))
    assert_exact_card_regions(page_data)
    pdf_page = source_pdf[page_number - 1]
    if abs(pdf_page.rect.width - page_data["width"]) > 0.02 or abs(pdf_page.rect.height - page_data["height"]) > 0.02:
        raise ValueError("The source PDF page box no longer matches the page DOM.")

    existing = {item.get("url"): item for item in overlays_data["overlays"]}
    count = 0
    for target in P48_CARDS:
        bbox = [float(value) for value in target["bbox"]]
        asset = page_dir / f"fidelity-overlay-component-physical-card-{target['name']}.png"
        pix = pdf_page.get_pixmap(matrix=pymupdf.Matrix(4, 4), clip=pymupdf.Rect(*bbox), alpha=False)
        pix.save(str(asset))
        url = f"/pages/page_{page_number:03d}/{asset.name}"
        existing[url] = {
            "url": url,
            "bbox": bbox,
            "widthPx": pix.width,
            "heightPx": pix.height,
            "language": "en",
            "languageInvariant": True,
            "zIndex": 2,
            "auditId": AUDIT_ID,
            "category": "physical-card-artwork",
            "sourcePdfPage": page_number,
            "region": target["name"],
            "artworkOnlyBlockIds": target["blocks"],
        }
        count += 1
    overlays_data["overlays"] = list(existing.values())
    overlay_path.write_text(json.dumps(overlays_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return count


def main() -> None:
    source_pdf = pymupdf.open(PDF_PATH)
    try:
        if source_pdf.page_count < 48:
            raise ValueError("The official source PDF has fewer than 48 pages.")
        p30_p38 = set_source_geometry_flags()
        mark_artwork_blocks(43, P43_ARTWORK_BLOCKS, "Living Bulwark physical card", EVIDENCE)
        mark_artwork_blocks(48, [block for card in P48_CARDS for block in card["blocks"]], "four physical cards", EVIDENCE)
        overlays = render_card_overlays(source_pdf)
    finally:
        source_pdf.close()
    print(json.dumps({"sourceGeometryLines": p30_p38, "artworkOnlyP43": P43_ARTWORK_BLOCKS,
        "artworkOnlyP48": sum((card["blocks"] for card in P48_CARDS), []), "p48SourceCardOverlays": overlays}, ensure_ascii=False))


if __name__ == "__main__":
    main()
