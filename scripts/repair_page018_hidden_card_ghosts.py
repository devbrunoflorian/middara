"""Hide three p.18 spans that escape over the finished hidden-card artwork.

Two name spans are painted before the large Hidden Card image in the source
PDF and are fully covered in the final page. A third, rotated UM3 label is
already present diagonally in the page background; LineRenderer redraws its
extracted span horizontally. Keep all three JSON lines for Admin inspection,
but suppress their duplicate/occluded page paint outside Admin.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path(
    r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
)
DOM_PATH = ROOT / "apps/web/public/pages/page_018/page_018_dom.json"
PAGE_NUMBER = 18
AUDIT_ID = "page18-hidden-card-art-overprint-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-04-page18-hidden-card-ghosts.md"

TARGETS = {
    "line_49_0": {
        "text": "Shayliss",
        "bbox": (571.2086791992, 350.2957763672, 593.4161987305, 359.4892578125),
        "region": "large Hidden Card face; hidden name fragment",
        "reason": "source paint order covers this name with the large Hidden Card image",
    },
    "line_50_0": {
        "text": " Arsen",
        "bbox": (582.6431884766, 356.6070251465, 600.3349609375, 365.8005065918),
        "region": "large Hidden Card face; hidden name fragment",
        "reason": "source paint order covers this name with the large Hidden Card image",
    },
    "line_190_0": {
        "text": "UM3",
        "bbox": (449.5716247559, 358.2257690430, 466.7733154297, 375.4274597168),
        "region": "diagonal UM3 label on the square card artwork",
        "reason": "the background already contains the rotated UM3 label; the extracted span is rendered horizontally",
    },
}

SOURCE_NAME_TRACE_BBOX = (571.21, 352.21, 600.33, 365.27)
SOURCE_NAME_TRACE_SEQNO = 211
SOURCE_NAME_COVER_SEQNO = 248
SOURCE_NAME_COVER_BBOX = (562.38, 342.50, 663.41, 427.33)
SOURCE_ROTATED_UM3_BBOX = (450.3188, 358.9730, 466.5534, 375.2076)
SOURCE_ROTATED_UM3_SEQNO = 483
SOURCE_ROTATED_UM3_DIR = (0.70710677, -0.70710677)


def close_bbox(actual: tuple[float, ...] | list[float], expected: tuple[float, ...], tolerance: float = 0.03) -> bool:
    return len(actual) == 4 and all(abs(a - e) <= tolerance for a, e in zip(actual, expected))


def validate_pdf(pdf_path: Path) -> None:
    if not pdf_path.is_file():
        raise FileNotFoundError(pdf_path)
    with pymupdf.open(pdf_path) as document:
        if document.page_count < PAGE_NUMBER:
            raise ValueError(f"Source PDF has only {document.page_count} pages")
        page = document[PAGE_NUMBER - 1]
        traces = page.get_texttrace()
        name_matches = [
            trace
            for trace in traces
            if "".join(chr(char[0]) for char in trace.get("chars", ())) == "Shayliss Arsen"
        ]
        if len(name_matches) != 1:
            raise ValueError(f"Expected one source trace for the hidden name, found {len(name_matches)}")
        name = name_matches[0]
        if (
            name.get("seqno") != SOURCE_NAME_TRACE_SEQNO
            or name.get("type") != 0
            or name.get("font") != "EsmeraldaPro"
            or abs(name.get("size", 0) - 6.75) > 0.01
            or not close_bbox(name.get("bbox", ()), SOURCE_NAME_TRACE_BBOX, 0.04)
        ):
            raise ValueError("The source PDF name trace changed; refusing a stale suppression")

        bboxlog = page.get_bboxlog()
        if len(bboxlog) <= SOURCE_NAME_COVER_SEQNO:
            raise ValueError("Source PDF is missing the expected later Hidden Card cover event")
        event_type, event_bbox, *_ = bboxlog[SOURCE_NAME_COVER_SEQNO]
        if event_type != "fill-image" or not close_bbox(event_bbox, SOURCE_NAME_COVER_BBOX, 0.06):
            raise ValueError("The source PDF no longer paints the expected card image over the hidden name")

        um3_matches = [
            trace
            for trace in traces
            if "".join(chr(char[0]) for char in trace.get("chars", ())) == "UM3"
            and trace.get("seqno") == SOURCE_ROTATED_UM3_SEQNO
        ]
        if len(um3_matches) != 1:
            raise ValueError(f"Expected the one rotated source UM3 trace, found {len(um3_matches)}")
        um3 = um3_matches[0]
        direction = um3.get("dir", (0, 0))
        if (
            not close_bbox(um3.get("bbox", ()), SOURCE_ROTATED_UM3_BBOX, 0.04)
            or any(abs(a - e) > 0.002 for a, e in zip(direction, SOURCE_ROTATED_UM3_DIR))
        ):
            raise ValueError("The source PDF rotated UM3 trace changed; refusing a stale suppression")


def apply(*, pdf_path: Path, write: bool) -> int:
    validate_pdf(pdf_path)
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    lines = {
        line.get("id"): line
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
    }
    if set(TARGETS) - set(lines):
        raise ValueError(f"Missing target lines: {sorted(set(TARGETS) - set(lines))}")

    for line_id, target in TARGETS.items():
        line = lines[line_id]
        text = "".join(span.get("text", "") for span in line.get("spans", []))
        if text != target["text"] or not close_bbox(line.get("bbox", []), target["bbox"]):
            raise ValueError(f"Stale p.18 target {line_id}: {text!r} {line.get('bbox')!r}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression")

    if write:
        for line_id, target in TARGETS.items():
            line = lines[line_id]
            line["rasterizedDuplicate"] = True
            line["rasterizedDuplicateReason"] = target["reason"]
            line["rasterizedDuplicateEvidence"] = {
                "auditId": AUDIT_ID,
                "sourcePdfPage": PAGE_NUMBER,
                "region": target["region"],
                "rule": "hide only the exact extracted line whose visible source appearance is already covered by card artwork",
                "evidenceRef": EVIDENCE_REF,
            }
        DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return len(TARGETS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--apply", action="store_true", help="mark the three exact lines in page_018_dom.json")
    args = parser.parse_args()
    count = apply(pdf_path=args.pdf, write=args.apply)
    mode = "marked" if args.apply else "validated; preview only"
    print(f"p.18: {mode} {count} exact lines ({', '.join(TARGETS)})")


if __name__ == "__main__":
    main()
