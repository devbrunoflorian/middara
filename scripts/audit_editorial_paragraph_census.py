#!/usr/bin/env python3
"""Create a read-only, source-baseline census of paragraph-boundary candidates.

This inventories geometry candidates; it does not split PDF lines into edit
units, edit page JSON, or choose a translation persistence model.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import fitz


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
DEFAULT_OUT = ROOT / "docs" / "project-progress" / "evidence" / "2026-10-06-editorial-paragraph-census"
TOLERANCE_PT = 0.35
GAP_MIN_PT = 12.5
GAP_EXCESS_PT = 1.5
LEADING_MARKER = re.compile(r"^\s*(Example(?:\s+\d+)?|Note|Tip|Important|Exception|Warning|Remember|For example)\s*:", re.I)
LIST_MARKER = re.compile(r"^\s*(?:[•·▪◦]|\d+[.)](?:\s|$)|[A-Za-z][.)](?:\s|$))")
SENTENCE_END = re.compile(r"[.!?][\"'”’)]*$")


def norm_bbox(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        return tuple(float(x) for x in value)  # type: ignore[return-value]
    except (TypeError, ValueError):
        return None


def source_indexes(page: fitz.Page) -> tuple[dict[tuple[str, float, str], list[dict[str, Any]]], dict[tuple[float, str], list[dict[str, Any]]], int]:
    exact: dict[tuple[str, float, str], list[dict[str, Any]]] = defaultdict(list)
    loose: dict[tuple[float, str], list[dict[str, Any]]] = defaultdict(list)
    count = 0
    text_flags = fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES
    for block in page.get_text("dict", flags=text_flags).get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = str(span.get("text", ""))
                if not text:
                    continue
                size = round(float(span.get("size", 0.0)), 2)
                font = str(span.get("font", ""))
                exact[(font, size, text)].append(span)
                loose[(size, text)].append(span)
                count += 1
    return exact, loose, count


def match_source_span(
    dom_span: dict[str, Any],
    exact: dict[tuple[str, float, str], list[dict[str, Any]]],
    loose: dict[tuple[float, str], list[dict[str, Any]]],
) -> tuple[dict[str, Any] | None, float | None, str]:
    text = str(dom_span.get("text", ""))
    if not text.strip():
        return None, None, ""
    size = round(float(dom_span.get("size", 0.0)), 2)
    font = str(dom_span.get("font", ""))
    dom_box = norm_bbox(dom_span.get("bbox"))
    candidates = exact.get((font, size, text), [])
    method = "pdf_exact_text_font_size_bbox"
    if not candidates:
        candidates = loose.get((size, text), [])
        method = "pdf_exact_text_size_bbox_font_variant"
    if candidates and dom_box:
        candidate = min(
            candidates,
            key=lambda item: sum(abs(float(item["bbox"][i]) - dom_box[i]) for i in range(4)),
        )
        error = sum(abs(float(candidate["bbox"][i]) - dom_box[i]) for i in range(4))
        if error <= 0.20:
            return candidate, float(candidate["origin"][1]), method
    origin = dom_span.get("origin")
    if isinstance(origin, (list, tuple)) and len(origin) >= 2:
        return None, float(origin[1]), "dom_origin_unmatched_to_pdf_span"
    return None, None, "unmatched"


def weighted_median(values: list[tuple[float, float]]) -> float | None:
    if not values:
        return None
    items = sorted(values)
    total = sum(weight for _, weight in items)
    midpoint = total / 2
    acc = 0.0
    for value, weight in items:
        acc += weight
        if acc >= midpoint:
            return value
    return items[-1][0]


def block_rows(
    block: dict[str, Any],
    exact: dict[tuple[str, float, str], list[dict[str, Any]]],
    loose: dict[tuple[float, str], list[dict[str, Any]]],
) -> tuple[list[dict[str, Any]], Counter[str], int]:
    line_rows: list[dict[str, Any]] = []
    source_methods: Counter[str] = Counter()
    mapped_text_spans = 0
    for line in block.get("lines", []):
        bbox = norm_bbox(line.get("bbox"))
        if not bbox:
            continue
        span_parts: list[dict[str, Any]] = []
        baseline_weights: list[tuple[float, float]] = []
        size_weights: Counter[float] = Counter()
        font_weights: Counter[str] = Counter()
        for span in line.get("spans", []):
            text = str(span.get("text", ""))
            if not text.strip():
                continue
            source_span, baseline, method = match_source_span(span, exact, loose)
            source_methods[method] += 1
            if source_span is not None:
                mapped_text_spans += 1
            chars = max(1, len(re.sub(r"\s+", "", text)))
            size = round(float(span.get("size", 0.0)), 2)
            font = str(span.get("font", ""))
            if baseline is not None:
                baseline_weights.append((baseline, float(chars)))
            size_weights[size] += chars
            font_weights[font] += chars
            span_parts.append({
                "x": float((norm_bbox(span.get("bbox")) or bbox)[0]),
                "text": text,
                "size": size,
                "font": font,
                "baseline": baseline,
                "chars": chars,
            })
        if not span_parts:
            continue
        line_rows.append({
            "top": bbox[1],
            "bbox": bbox,
            "line_id": str(line.get("id", "")),
            "parts": span_parts,
            "baseline": weighted_median(baseline_weights),
            "size": size_weights.most_common(1)[0][0] if size_weights else None,
            "font": font_weights.most_common(1)[0][0] if font_weights else "",
            "leading_newline": str(line.get("spans", [{}])[0].get("text", "")).startswith("\n"),
            "raw_text": "".join(str(s.get("text", "")) for s in line.get("spans", [])),
        })

    # DOM line fragments on one visual source row have nearly identical top Y.
    line_rows.sort(key=lambda row: (row["top"], row["bbox"][0]))
    groups: list[list[dict[str, Any]]] = []
    for item in line_rows:
        if groups and abs(item["top"] - statistics.mean(r["top"] for r in groups[-1])) <= TOLERANCE_PT:
            groups[-1].append(item)
        else:
            groups.append([item])

    rows: list[dict[str, Any]] = []
    for group in groups:
        parts = sorted((part for item in group for part in item["parts"]), key=lambda part: part["x"])
        baseline_weights = [(part["baseline"], float(part["chars"])) for part in parts if part["baseline"] is not None]
        size_weights = Counter()
        font_weights = Counter()
        for part in parts:
            size_weights[part["size"]] += part["chars"]
            font_weights[part["font"]] += part["chars"]
        baselines = [value for value, _ in baseline_weights]
        rows.append({
            "top": statistics.mean(item["top"] for item in group),
            "baseline": weighted_median(baseline_weights),
            "text": "".join(part["text"] for part in parts).strip(),
            "line_ids": [item["line_id"] for item in group],
            "size": size_weights.most_common(1)[0][0] if size_weights else None,
            "font": font_weights.most_common(1)[0][0] if font_weights else "",
            "x0": min(item["bbox"][0] for item in group),
            "x1": max(item["bbox"][2] for item in group),
            "leading_newline": any(item["leading_newline"] for item in group),
            "baseline_spread": (max(baselines) - min(baselines)) if baselines else None,
        })
    rows.sort(key=lambda row: (row["baseline"] if row["baseline"] is not None else row["top"], row["x0"]))
    return rows, source_methods, mapped_text_spans


def classify_candidate(prev: dict[str, Any], nxt: dict[str, Any], symbols: list[dict[str, Any]], block: dict[str, Any]) -> tuple[str, str, str, str]:
    prev_text = prev["text"].strip()
    next_text = nxt["text"].strip()
    marker_match = LEADING_MARKER.match(next_text)
    explicit_break = bool(nxt["leading_newline"])
    tall_symbols = [s for s in symbols if s.get("line_id") in set(prev["line_ids"] + nxt["line_ids"]) and float(s.get("height_em", 0.0)) >= 1.2]
    same_style = prev.get("size") == nxt.get("size") and prev.get("font") == nxt.get("font")

    if block.get("suspectedGhost") or block.get("rasterizedDuplicate"):
        return ("artifact/duplicate text candidate", "low", "Exclude from paragraph changes until source artwork status is confirmed.", "Block is marked ghost or rasterized duplicate.")
    if max(float(prev.get("size") or 0), float(nxt.get("size") or 0)) < 6.0:
        return ("tiny-print/artwork geometry candidate", "low", "Do not treat as an editorial paragraph candidate without separate source-artwork review.", "Both adjacent text rows are below the 6 pt editable-content threshold and may belong to card/artwork detail.")
    if tall_symbols and not SENTENCE_END.search(prev_text):
        return ("same paragraph; tall inline-symbol/linebox effect", "medium", "Keep in the same editorial paragraph. Investigate the inline symbol placement separately.", "A tall semantic inline symbol is anchored on one of the two source rows while sentence text continues.")
    if marker_match:
        marker = marker_match.group(1).title()
        confidence = "high" if explicit_break else "medium"
        return (f"editorial paragraph start: {marker}", confidence, "Treat as an editorial paragraph boundary within the current translation identity; keep persistence representation undecided.", "Next text has an explicit semantic marker" + (" and a leading source break token." if explicit_break else "."))
    if LIST_MARKER.match(next_text):
        return ("numbered/bulleted list item boundary", "medium", "Keep the marker attached to its editorial item and preserve its relationship to the parent lead-in.", "The next source row begins with an explicit list marker.")
    if prev_text.endswith(":"):
        if re.match(r"^(?:While|When|If|Each|Any|All|You|The)\b", next_text, re.I):
            return ("rule lead-in → first item/body", "medium", "Preserve the lead-in and following editorial unit as related; keep any bullet/list ownership attached to its item.", "A colon-ended lead-in precedes prose typical of a rule/list item.")
        if len(prev_text) <= 100:
            return ("heading/label → explanatory prose", "medium", "Classify as a label/body relationship; preserve current block identity and relationship pending the model decision.", "A short colon-ended label precedes explanatory prose.")
    size_delta = abs(float(prev.get("size") or 0) - float(nxt.get("size") or 0))
    short_label = len(prev_text) <= 100 and (prev_text.endswith(":") or len(prev_text.split()) <= 12)
    if short_label and size_delta >= 0.75 and float(prev.get("size") or 0) > float(nxt.get("size") or 0):
        return ("heading/label → explanatory prose", "medium", "Classify as a possible heading/body or label/body boundary; preserve the current block relationship and IDs pending the model decision.", "Short preceding label with a font or size transition.")
    if explicit_break and SENTENCE_END.search(prev_text) and next_text and next_text[0].isupper():
        return ("probable new editorial paragraph", "medium", "Treat as a paragraph-boundary candidate inside the current translation identity; confirm the editorial scope before modeling it.", "The source has an explicit break token, the preceding sentence ends, and the following text begins a new sentence.")
    if SENTENCE_END.search(prev_text) and next_text and next_text[0].isupper():
        return ("completed sentence → probable paragraph transition", "medium", "Review whether this is a new editorial paragraph; keep both passages under their current translation identity until that scope is confirmed.", "A complete preceding sentence is followed by a new capitalized sentence at a source-baseline gap candidate. This is evidence, not an automatic split.")
    if not SENTENCE_END.search(prev_text) and next_text and next_text[0].islower():
        return ("same paragraph; likely wrapped continuation", "medium", "Keep as one editorial paragraph; do not split at the physical PDF line.", "Sentence continues syntactically across the geometric gap.")
    if explicit_break and not same_style:
        return ("explicit source break; editorial role unresolved", "low", "Review the surrounding PDF context. Do not create a line-level unit or change persistence yet.", "Source line begins with a break token, but no decisive paragraph marker or hierarchy was found.")
    return ("unresolved geometric candidate", "low", "Manual PDF/source review. Geometry alone does not justify a paragraph boundary.", "No unambiguous semantic marker, list structure, or typography transition was detected.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path, help="Original 102-page source PDF")
    parser.add_argument("--out", default=DEFAULT_OUT, type=Path)
    args = parser.parse_args()
    if not args.pdf.is_file():
        raise SystemExit(f"Source PDF not found: {args.pdf}")

    pdf = fitz.open(args.pdf)
    page_dirs = sorted(PAGE_ROOT.glob("page_[0-9][0-9][0-9]"))
    candidate_rows: list[dict[str, Any]] = []
    skipped_blocks: list[dict[str, Any]] = []
    bbox_candidate_keys: set[tuple[int, str, str, str]] = set()
    all_block_count = 0
    coverage = Counter()
    class_counts = Counter()

    for page_dir in page_dirs:
        page_number = int(page_dir.name.split("_")[1])
        if page_number > len(pdf):
            continue
        dom_path = page_dir / f"{page_dir.name}_dom.json"
        if not dom_path.is_file():
            continue
        dom = json.loads(dom_path.read_text(encoding="utf-8"))
        exact, loose, source_span_count = source_indexes(pdf[page_number - 1])
        coverage["pdf_source_spans"] += source_span_count
        elements_path = page_dir / "inline_elements.json"
        elements_data = json.loads(elements_path.read_text(encoding="utf-8")) if elements_path.is_file() else {}
        symbols_by_block: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for element in elements_data.get("elements", []):
            anchor = element.get("anchor", element)
            metrics = element.get("metrics", anchor.get("metrics", {}))
            symbols_by_block[str(anchor.get("blockId", element.get("blockId", "")))].append({
                "line_id": str(anchor.get("lineId", element.get("lineId", ""))),
                "symbol_id": str(element.get("symbolId", "")),
                "height_em": float(metrics.get("heightEm", 0.0) or 0.0),
            })

        for block in dom.get("blocks", []):
            all_block_count += 1
            # Retain the earlier bbox-top candidate count for comparison. The
            # final inventory below uses matched PDF text baselines instead.
            bbox_rows: list[dict[str, Any]] = []
            for line in block.get("lines", []):
                text = "".join(str(span.get("text", "")) for span in line.get("spans", []))
                line_box = norm_bbox(line.get("bbox"))
                if not text.strip() or not line_box:
                    continue
                row = next((item for item in bbox_rows if abs(item["top"] - line_box[1]) <= 0.25), None)
                if row is None:
                    row = {"top": line_box[1], "line_ids": []}
                    bbox_rows.append(row)
                row["line_ids"].append(str(line.get("id", "")))
            bbox_rows.sort(key=lambda row: row["top"])
            bbox_gaps = [bbox_rows[i]["top"] - bbox_rows[i - 1]["top"] for i in range(1, len(bbox_rows))]
            if len(bbox_rows) >= 3 and len(bbox_gaps) >= 2:
                bbox_median = statistics.median(bbox_gaps)
                for i, gap in enumerate(bbox_gaps, start=1):
                    if gap >= GAP_MIN_PT and gap - bbox_median >= GAP_EXCESS_PT:
                        bbox_candidate_keys.add((page_number, str(block.get("id", "")), "|".join(bbox_rows[i - 1]["line_ids"]), "|".join(bbox_rows[i]["line_ids"])))

            rows, match_counts, mapped_count = block_rows(block, exact, loose)
            coverage["dom_text_spans"] += sum(match_counts.values())
            coverage["dom_text_spans_mapped_to_pdf"] += mapped_count
            if len(rows) < 2:
                continue
            baselines = [row["baseline"] for row in rows]
            if any(value is None for value in baselines):
                # Preserve a useful census row list, but do not mix guessed Y with source baselines.
                coverage["blocks_skipped_unmatched_baseline"] += 1
                skipped_blocks.append({
                    "page": page_number,
                    "block_id": str(block.get("id", "")),
                    "reason": "At least one nonempty text row had no matched original-PDF baseline; excluded rather than mixing estimated and source Y values.",
                    "text_preview": " ".join(row["text"] for row in rows)[:300],
                })
                continue
            gaps = [float(rows[i]["baseline"]) - float(rows[i - 1]["baseline"]) for i in range(1, len(rows))]
            positive = [gap for gap in gaps if gap > 0]
            if not positive:
                continue
            if len(positive) >= 2:
                pitch_reference = statistics.median(positive)
                pitch_reference_kind = "block median of source baseline intervals"
            else:
                dominant_size = statistics.mode([float(row["size"] or 0) for row in rows])
                if dominant_size <= 0:
                    continue
                pitch_reference = dominant_size * 1.10
                pitch_reference_kind = "single-interval font-size estimate; candidate only"
            for index, gap in enumerate(gaps, start=1):
                if gap < GAP_MIN_PT or gap - pitch_reference < GAP_EXCESS_PT:
                    continue
                prev, nxt = rows[index - 1], rows[index]
                symbols = symbols_by_block.get(str(block.get("id", "")), [])
                structural_class, confidence, recommendation, basis = classify_candidate(prev, nxt, symbols, block)
                class_counts[structural_class] += 1
                candidate_rows.append({
                    "page": page_number,
                    "block_id": str(block.get("id", "")),
                    "previous_line_ids": "|".join(prev["line_ids"]),
                    "next_line_ids": "|".join(nxt["line_ids"]),
                    "previous_baseline_pt": round(float(prev["baseline"]), 3),
                    "next_baseline_pt": round(float(nxt["baseline"]), 3),
                    "observed_gap_pt": round(gap, 3),
                    "pitch_reference_pt": round(pitch_reference, 3),
                    "pitch_reference_kind": pitch_reference_kind,
                    "excess_over_reference_pt": round(gap - pitch_reference, 3),
                    "geometry_confidence": "medium" if pitch_reference_kind.startswith("single-interval") else "high",
                    "previous_text": re.sub(r"\s+", " ", prev["text"]).strip()[:240],
                    "next_text": re.sub(r"\s+", " ", nxt["text"]).strip()[:240],
                    "previous_font_size_pt": prev["size"],
                    "next_font_size_pt": nxt["size"],
                    "previous_font": prev["font"],
                    "next_font": nxt["font"],
                    "next_has_leading_source_break": str(bool(nxt["leading_newline"])).lower(),
                    "structural_class": structural_class,
                    "confidence": confidence,
                    "classification_basis": basis,
                    "recommended_action": recommendation,
                    "editorial_unit_note": "Candidate is an interval between source baselines, not a proposed physical-line split or persistence key.",
                    "pages_1_12_status": "preserve approved content" if page_number <= 12 else "outside protected range",
                })
        if page_number % 10 == 0:
            print(f"Processed p.{page_number}; candidates={len(candidate_rows)}", flush=True)

    candidate_rows.sort(key=lambda row: (row["page"], row["block_id"], row["previous_baseline_pt"]))
    args.out.mkdir(parents=True, exist_ok=True)
    csv_path = args.out / "editorial-paragraph-geometry-candidates.csv"
    if candidate_rows:
        with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(candidate_rows[0].keys()))
            writer.writeheader()
            writer.writerows(candidate_rows)
    skipped_path = args.out / "blocks-skipped-unmatched-baselines.csv"
    with skipped_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["page", "block_id", "reason", "text_preview"])
        writer.writeheader()
        writer.writerows(skipped_blocks)

    page_counts = Counter(row["page"] for row in candidate_rows)
    count_by_confidence = Counter(row["confidence"] for row in candidate_rows)
    count_by_recommendation = Counter(row["recommended_action"] for row in candidate_rows)
    summary = {
        "source_pdf": str(args.pdf.resolve()),
        "pdf_pages": len(pdf),
        "dom_page_directories": len(page_dirs),
        "dom_blocks_scanned": all_block_count,
        "geometric_candidate_intervals": len(candidate_rows),
        "source_baseline_candidates_using_multi_interval_median": sum(not row["pitch_reference_kind"].startswith("single-interval") for row in candidate_rows),
        "source_baseline_candidates_using_single_interval_estimate": sum(row["pitch_reference_kind"].startswith("single-interval") for row in candidate_rows),
        "earlier_bbox_top_candidate_intervals": len(bbox_candidate_keys),
        "prior_user_reported_bbox_candidate_count": 373,
        "source_baseline_candidate_delta_vs_bbox_top": len(candidate_rows) - len(bbox_candidate_keys),
        "candidate_pages": len(page_counts),
        "candidate_page_counts": dict(sorted(page_counts.items())),
        "structural_class_counts": dict(class_counts.most_common()),
        "confidence_counts": dict(count_by_confidence),
        "source_text_span_match_coverage": {
            "dom_nonempty_text_spans": coverage["dom_text_spans"],
            "matched_to_original_pdf_span": coverage["dom_text_spans_mapped_to_pdf"],
            "ratio": round(coverage["dom_text_spans_mapped_to_pdf"] / max(1, coverage["dom_text_spans"]), 6),
        },
        "candidate_rule": f"Within-block consecutive source-text baselines, at least {GAP_MIN_PT:.1f} pt apart and at least {GAP_EXCESS_PT:.1f} pt above the local reference pitch. Use the block median when it has multiple intervals; otherwise use a 1.10× dominant-font estimate for the single interval. This generates review candidates only; it is not a paragraph rule.",
        "blocks_skipped_due_to_unmatched_baselines": coverage["blocks_skipped_unmatched_baseline"],
        "skipped_blocks_csv": str(skipped_path.resolve()),
        "translation_unit_principle": "Candidate rows are evidence around an editorial paragraph/unit; EN and PT-BR should retain the same semantic identity while PT-BR reflows. No physical PDF line is proposed as a translation unit.",
        "persistence_model": "Not decided. No source page JSON, database, translation key, or viewer state was changed.",
        "pages_1_12": "Included for census context; recommended action preserves the approved content as-is.",
        "csv": str(csv_path.resolve()),
    }
    summary_path = args.out / "summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    md = [
        "# Editorial paragraph census — 102-page source review",
        "",
        "## Scope",
        "",
        "This is a read-only census of geometric intervals between source-PDF text baselines inside existing DOM blocks. It identifies places that deserve editorial classification; it does not propose one translation unit per physical PDF line and does not select a persistence model.",
        "",
        f"- Original PDF pages: {len(pdf)}",
        f"- DOM blocks scanned: {all_block_count}",
        f"- Geometry candidate intervals: {len(candidate_rows)} across {len(page_counts)} pages",
        f"- Earlier bbox-top scan with the same numeric screen: {len(bbox_candidate_keys)} intervals; prior investigation reported 373 using a nearby first-pass scan. Those counts are not a repair backlog.",
        f"- Source-baseline candidates using multiple intervals as the local reference: {sum(not row['pitch_reference_kind'].startswith('single-interval') for row in candidate_rows)}; single-interval font-size estimates: {sum(row['pitch_reference_kind'].startswith('single-interval') for row in candidate_rows)}",
        f"- Exact/near-exact text-span mapping back to the source PDF: {coverage['dom_text_spans_mapped_to_pdf']}/{coverage['dom_text_spans']} ({summary['source_text_span_match_coverage']['ratio']:.1%})",
        "- Pages 1–12 remain approved and are marked preserve-as-is in the CSV.",
        "",
        "## What a row means",
        "",
        "Each CSV row is the measured gap between two neighboring source text baselines within one existing block. A row is a review candidate, not a paragraph decision. Blocks with multiple intervals use their local median pitch as a geometric reference; a two-row block uses a 1.10× dominant-font estimate and is explicitly labeled in the CSV with medium geometry confidence. The classification and confidence use text markers, source-break tokens, typography, list cues, sentence continuation, and tall inline-symbol anchors. Geometry alone remains low-confidence and carries no split recommendation. Tiny text under 6 pt is surfaced as an artwork/detail false-positive class rather than a paragraph candidate.",
        "",
        "The design constraint is one editorially translatable paragraph/unit with a stable EN ↔ PT-BR identity. The Portuguese text may reflow; PDF line wraps are source evidence only.",
        "",
        "## Classification counts",
        "",
    ]
    for label, count in class_counts.most_common():
        md.append(f"- {label}: {count}")
    md += [
        "",
        "## Representative confirmed cases",
        "",
        "- p. 78, blocks 16, 18, and 20: each Example starts at a baseline 14 pt after the preceding body row, with ordinary body pitch 11 pt. The `Example:` marker and leading source break identify three editorial paragraph starts inside existing list items. The bullet remains associated with its parent list item.",
        "- p. 78, block 25: a similarly large baseline jump occurs inside a continuing sentence around a tall hand symbol. It is a same-paragraph inline-symbol/linebox case, not a paragraph start. This is a direct counterexample to any gap-only rule.",
        "- p. 13, `New Story Flag:` → `Mark the Story Flag...`: 13.835 pt, same-size 10 pt text; the colon label and body are one current source block but distinct editorial roles.",
        "- p. 28: four title/body candidates include `The Cost of Item Upgrades` → body at 21 pt; this is a typographic heading/body class, independent of line wrapping.",
        "- p. 57: `Unique Loot:`, `Monster Loot:`, and `Item Loot:` each lead into a body paragraph in the same source block; all three are label/body class candidates.",
        "- p. 50: the Flanking and Backstab example column repeats `Example 1:` through `Example 10:`. These are numbered editorial examples, not line-wrap boundaries; the label matcher accepts numbered examples.",
        "- p. 34: visual review shows the page is a Game Table Setup diagram made from card, token, and board artwork. Its many tiny extracted text intervals are artwork/detail candidates and should not enter the editorial paragraph workflow.",
        "- Earlier source audit cases remain structurally distinct: p. 13 callout label→body; p. 37 numbered phase heading→prose; p. 97 rule introduction→first list item; p. 41 numbered step→lettered substep; p. 85 comparison label→prose. Counts and source notes are in `2026-10-06-inline-symbol-linebox-family-audit.md`.",
        "- Full-page source visual review of nine representatives is recorded in `visual-review-notes.md`; the remaining candidates have not all received individual visual review.",
        "",
        "## Decision status",
        "",
        "No global paragraph threshold is approved. Do not close block/subblock/segment persistence design from this census. First adjudicate the candidate classes against editorial meaning and translation ownership; then decide the storage representation together. No edits to page JSON, Payload, or viewer state were performed.",
        "",
        f"Two blocks whose baselines could not be matched were excluded instead of estimated; see `blocks-skipped-unmatched-baselines.csv` (n={len(skipped_blocks)}).",
        "",
        "Full candidate inventory: `editorial-paragraph-geometry-candidates.csv`.",
    ]
    report_path = args.out / "README.md"
    report_path.write_text("\n".join(md) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
