#!/usr/bin/env python3
"""Build a source-vector ornament overlay in an isolated p.26 snapshot."""
from __future__ import annotations

import hashlib
import json
import math
import shutil
import xml.sax.saxutils as xml
from pathlib import Path

import cairosvg
import pymupdf

ROOT = Path.cwd()
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1"
SOURCE_PDF = Path("C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
SNAPSHOT_IN = PROOF / "snapshot-diagnostic-v4"
SNAPSHOT_OUT = PROOF / "snapshot-diagnostic-v5"
SOURCE_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def num(value: float) -> str:
    return f"{float(value):.6f}".rstrip("0").rstrip(".")


def point(value) -> tuple[float, float]:
    return float(value.x), float(value.y)


def drawing_path_d(drawing: dict) -> str:
    commands: list[str] = []
    cursor: tuple[float, float] | None = None
    for item in drawing["items"]:
        op = item[0]
        if op == "c":
            p0, p1, p2, p3 = (point(p) for p in item[1:5])
            if cursor is None or abs(cursor[0] - p0[0]) > 0.01 or abs(cursor[1] - p0[1]) > 0.01:
                if cursor is not None:
                    commands.append("Z")
                commands.append(f"M {num(p0[0])} {num(p0[1])}")
            commands.append(
                f"C {num(p1[0])} {num(p1[1])} {num(p2[0])} {num(p2[1])} {num(p3[0])} {num(p3[1])}"
            )
            cursor = p3
        elif op == "l":
            p0, p1 = (point(p) for p in item[1:3])
            if cursor is None or abs(cursor[0] - p0[0]) > 0.01 or abs(cursor[1] - p0[1]) > 0.01:
                if cursor is not None:
                    commands.append("Z")
                commands.append(f"M {num(p0[0])} {num(p0[1])}")
            commands.append(f"L {num(p1[0])} {num(p1[1])}")
            cursor = p1
        elif op == "re":
            if cursor is not None:
                commands.append("Z")
            rect = item[1]
            x0, y0, x1, y1 = rect.x0, rect.y0, rect.x1, rect.y1
            commands.append(f"M {num(x0)} {num(y0)} L {num(x1)} {num(y0)} L {num(x1)} {num(y1)} L {num(x0)} {num(y1)} Z")
            cursor = None
        elif op == "qu":
            if cursor is not None:
                commands.append("Z")
            quad = item[1]
            pts = [quad.ul, quad.ur, quad.lr, quad.ll]
            x0, y0 = point(pts[0])
            commands.append(f"M {num(x0)} {num(y0)}")
            for p in pts[1:]:
                x, y = point(p)
                commands.append(f"L {num(x)} {num(y)}")
            commands.append("Z")
            cursor = None
        else:
            raise ValueError(f"Unsupported source vector operation {op!r}")
    if cursor is not None:
        commands.append("Z")
    return " ".join(commands)


def make_svg(drawings: list[dict], bbox: tuple[float, float, float, float]) -> bytes:
    x0, y0, x1, y1 = bbox
    paths = []
    for drawing in drawings:
        assert tuple(round(v, 2) for v in drawing["fill"]) == (1.0, 1.0, 1.0)
        paths.append(f'<path d="{xml.escape(drawing_path_d(drawing))}" fill="#ffffff" fill-rule="nonzero"/>')
    path_markup = "".join(paths)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{num(x1-x0)}" height="{num(y1-y0)}" '
        f'viewBox="{num(x0)} {num(y0)} {num(x1-x0)} {num(y1-y0)}">{path_markup}</svg>'
    ).encode("utf-8")


def main() -> None:
    assert sha256(SOURCE_PDF) == SOURCE_SHA256, "Official source PDF changed."
    assert not SNAPSHOT_OUT.exists(), f"Refusing to overwrite {SNAPSHOT_OUT}"
    shutil.copytree(SNAPSHOT_IN, SNAPSHOT_OUT)

    source = pymupdf.open(SOURCE_PDF)
    page = source[25]
    drawings = page.get_drawings()
    regions = [
        ("top", [186, 188]),
        ("breakdown", [190, 192]),
    ]
    overlay_dir = SNAPSHOT_OUT / "pages/page_026"
    sidecar_path = overlay_dir / "fidelity_overlays.json"
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
    before = len(sidecar.get("overlays", []))
    scale = 1710 / float(page.rect.width)
    created = []
    for region, indices in regions:
        selected = [drawings[index] for index in indices]
        for drawing in selected:
            assert len(drawing["items"]) == 60
            assert drawing.get("type") == "f"
            assert tuple(round(v, 2) for v in drawing["fill"]) == (1.0, 1.0, 1.0)
        bbox = (
            min(d["rect"].x0 for d in selected), min(d["rect"].y0 for d in selected),
            max(d["rect"].x1 for d in selected), max(d["rect"].y1 for d in selected),
        )
        width_px, height_px = math.ceil((bbox[2] - bbox[0]) * scale), math.ceil((bbox[3] - bbox[1]) * scale)
        filename = f"fidelity-overlay-title-banner-ornaments-{region}-v1.png"
        image_path = overlay_dir / filename
        cairosvg.svg2png(bytestring=make_svg(selected, bbox), write_to=str(image_path), output_width=width_px, output_height=height_px)
        created.append({
            "url": f"/pages/page_026/{filename}",
            "bbox": [round(v, 6) for v in bbox],
            "widthPx": width_px,
            "heightPx": height_px,
            "languageInvariant": True,
            "zIndex": 10001,
            "auditId": "2026-10-16-p026-source-vector-banner-ornaments-v1",
            "category": "source-vector-page-furniture-restoration",
            "sourcePdfPage": 26,
            "region": f"title-banner-ornaments-{region}",
        })
    assert before == 3
    sidecar["overlays"].extend(created)
    sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    receipt = {
        "status": "prepared_isolated_source_vector_ornament_overlay",
        "page": 26,
        "sourcePdf": str(SOURCE_PDF),
        "sourcePdfSha256": SOURCE_SHA256,
        "sourceDrawingIndices": [index for _, indices in regions for index in indices],
        "sourceDrawingFill": "#ffffff",
        "sourcePathItemCounts": [len(drawings[index]["items"]) for _, indices in regions for index in indices],
        "canonicalAssetsModified": False,
        "snapshotBeforeOverlayCount": before,
        "snapshotAfterOverlayCount": len(sidecar["overlays"]),
        "overlays": created,
        "imageSha256": {Path(item["url"]).name: sha256(overlay_dir / Path(item["url"]).name) for item in created},
        "sidecarSha256": sha256(sidecar_path),
    }
    (PROOF / "ornament-overlay-receipt-v1.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
