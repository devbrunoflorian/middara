#!/usr/bin/env python3
"""Aggregate already-detected SOURCE↔viewer delta regions by reviewed object identity.

This is a post-detection pilot tool. It deliberately does not read or modify the
diff thresholds, masks, captures, viewer, PDF, page sidecars, or application data.
Every raw region must be assigned in the human-reviewed annotation manifest.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EVIDENCE = ROOT / "docs/project-progress/evidence/2026-10-08-delta-driven-viewer-capture"
EXPECTED_CURRENT_RAW_REGIONS = 40
EXPECTED_CONFIRMED_RAW_REGIONS = 39
EXPECTED_RASTER_RAW_REGIONS = 1


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def raw_by_scope(delta_report: dict[str, Any], scope: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    selected: dict[str, dict[str, Any]] = {}
    wanted = {(item["page"], item["state"]) for item in scope}
    for result in delta_report["results"]:
        key = (result["page"], result["state"])
        if key not in wanted:
            continue
        for region in result["regions"]:
            region_id = region["regionId"]
            if region_id in selected:
                raise ValueError(f"Duplicate raw region id in detector output: {region_id}")
            selected[region_id] = {"page": result["page"], "state": result["state"], **region}
    return selected


def union_bbox(regions: list[dict[str, Any]]) -> list[float] | None:
    boxes = [region.get("bboxPt") for region in regions if region.get("bboxPt")]
    if not boxes:
        return None
    return [
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    ]


def add_raw_regions(
    item: dict[str, Any], raw: dict[str, dict[str, Any]], classification: str
) -> dict[str, Any]:
    enriched = dict(item)
    enriched["rawRegions"] = []
    for region_id in item["regionIds"]:
        region = raw[region_id]
        enriched["rawRegions"].append({
            "regionId": region_id,
            "bboxPt": region["bboxPt"],
            "structuralAreaPx": region["structuralAreaPx"],
            "rawThresholdPixelsInBBox": region["rawThresholdPixelsInBBox"],
            "meanMaxChannelDelta": region["meanMaxChannelDelta"],
            "peakMaxChannelDelta": region["peakMaxChannelDelta"],
        })
    enriched["deltaRegionUnionBboxPt"] = union_bbox(enriched["rawRegions"])
    enriched["classification"] = classification
    return enriched


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence-dir", type=Path, default=DEFAULT_EVIDENCE)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    evidence_dir: Path = args.evidence_dir
    output_dir: Path = args.output_dir or evidence_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    delta_report = load_json(evidence_dir / "delta-report.json")
    annotations = load_json(evidence_dir / "aggregation-annotations.json")
    raw = raw_by_scope(delta_report, annotations["scope"])

    instance_annotations = annotations["instances"]
    expected_annotations = annotations["expectedDifferences"]
    all_region_ids = [
        region_id
        for item in [*instance_annotations, *expected_annotations]
        for region_id in item["regionIds"]
    ]
    if len(all_region_ids) != len(set(all_region_ids)):
        raise ValueError("A raw region is assigned more than once")
    if set(all_region_ids) != set(raw):
        missing = sorted(set(raw) - set(all_region_ids))
        stale = sorted(set(all_region_ids) - set(raw))
        raise ValueError(f"Annotation coverage mismatch; missing={missing}; stale={stale}")

    confirmed = [item for item in instance_annotations if item["classification"] == "CONFIRMED_DEFECT"]
    expected_raw_count = sum(len(item["regionIds"]) for item in expected_annotations)
    confirmed_raw_count = sum(len(item["regionIds"]) for item in confirmed)
    if len(raw) != EXPECTED_CURRENT_RAW_REGIONS:
        raise ValueError(f"Expected {EXPECTED_CURRENT_RAW_REGIONS} current raw regions; found {len(raw)}")
    if confirmed_raw_count != EXPECTED_CONFIRMED_RAW_REGIONS:
        raise ValueError(f"Expected {EXPECTED_CONFIRMED_RAW_REGIONS} confirmed raw regions; found {confirmed_raw_count}")
    if expected_raw_count != EXPECTED_RASTER_RAW_REGIONS:
        raise ValueError(f"Expected {EXPECTED_RASTER_RAW_REGIONS} expected raster region; found {expected_raw_count}")

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    region_to_instance: dict[str, dict[str, Any]] = {}
    for item in instance_annotations:
        if item["classification"] != "CONFIRMED_DEFECT":
            raise ValueError(f"Unsupported instance classification: {item['classification']}")
        enriched = add_raw_regions(item, raw, item["classification"])
        grouped[item["family"]].append(enriched)
        for region_id in item["regionIds"]:
            region_to_instance[region_id] = {
                "instanceId": item["id"],
                "classification": item["classification"],
                "family": item["family"],
                "objectType": item["objectType"],
            }
    expected = [add_raw_regions(item, raw, item["classification"]) for item in expected_annotations]
    for item in expected:
        for region_id in item["regionIds"]:
            region_to_instance[region_id] = {
                "expectedDifferenceId": item["id"],
                "classification": item["classification"],
                "family": "EXPECTED_RASTERIZATION_DIFFERENCE",
                "objectType": item["objectType"],
            }

    historical_region_id = "067-historical-no-pill-002"
    historical_results = raw_by_scope(delta_report, [{"page": 67, "state": "historical-no-pill"}])
    if historical_region_id not in historical_results:
        raise ValueError("Historical no-pill capsule control region is missing")
    controls = []
    for control in annotations["controls"]:
        enriched = dict(control)
        enriched["rawRegions"] = [
            {
                "regionId": region_id,
                "bboxPt": historical_results[region_id]["bboxPt"],
                "structuralAreaPx": historical_results[region_id]["structuralAreaPx"],
                "rawThresholdPixelsInBBox": historical_results[region_id]["rawThresholdPixelsInBBox"],
            }
            for region_id in control["regionIds"]
        ]
        controls.append(enriched)

    family_rows = []
    for family in annotations["families"]:
        members = grouped.get(family["id"], [])
        if not members:
            continue
        family_rows.append({
            **family,
            "pages": sorted({item["page"] for item in members}),
            "defectInstanceCount": len(members),
            "defectInstanceIds": [item["id"] for item in members],
        })

    result = {
        "schema": "post-detection-object-aggregation/v1",
        "input": "delta-report.json; detector output is read-only",
        "scope": annotations["scope"],
        "rawRegionCount": len(raw),
        "confirmedDefectRegionCount": confirmed_raw_count,
        "defectInstanceCount": len(confirmed),
        "expectedRasterDifferenceRegionCount": expected_raw_count,
        "expectedRasterDifferenceInstanceCount": len(expected),
        "families": family_rows,
        "instances": [
            add_raw_regions(item, raw, item["classification"])
            for item in confirmed
        ],
        "expectedDifferences": expected,
        "regionToInstance": [
            {"regionId": region_id, **region_to_instance[region_id]}
            for region_id in sorted(region_to_instance)
        ],
        "controls": controls,
    }
    (output_dir / "object-aggregation.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    with (output_dir / "region-instance-map.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "regionId", "page", "state", "classification", "instanceId",
            "expectedDifferenceId", "family", "objectType", "bboxPt",
            "structuralAreaPx", "rawThresholdPixelsInBBox", "sourceObjects",
        ])
        writer.writeheader()
        for region_id in sorted(raw):
            raw_row = raw[region_id]
            assignment = region_to_instance[region_id]
            annotation = next(
                item for item in [*instance_annotations, *expected_annotations]
                if region_id in item["regionIds"]
            )
            writer.writerow({
                "regionId": region_id,
                "page": raw_row["page"],
                "state": raw_row["state"],
                "classification": assignment["classification"],
                "instanceId": assignment.get("instanceId", ""),
                "expectedDifferenceId": assignment.get("expectedDifferenceId", ""),
                "family": assignment["family"],
                "objectType": assignment["objectType"],
                "bboxPt": json.dumps(raw_row["bboxPt"], separators=(",", ":")),
                "structuralAreaPx": raw_row["structuralAreaPx"],
                "rawThresholdPixelsInBBox": raw_row["rawThresholdPixelsInBBox"],
                "sourceObjects": " | ".join(annotation["sourceObjects"]),
            })

    print(json.dumps({
        "rawRegionCount": result["rawRegionCount"],
        "confirmedDefectRegionCount": result["confirmedDefectRegionCount"],
        "defectInstanceCount": result["defectInstanceCount"],
        "expectedRasterDifferenceInstanceCount": result["expectedRasterDifferenceInstanceCount"],
        "familyCounts": {family["id"]: family["defectInstanceCount"] for family in family_rows},
        "historicalControlRegionCount": len(controls[0]["rawRegions"]),
        "outputs": [
            str(output_dir / "object-aggregation.json"),
            str(output_dir / "region-instance-map.csv"),
        ],
    }, indent=2))


if __name__ == "__main__":
    main()
