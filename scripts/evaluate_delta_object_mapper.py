#!/usr/bin/env python3
"""Evaluate a saved blind mapper result against the reviewed pilot ground truth.

Run only after `map_delta_regions.py` has written its output. The annotations
are consumed here, never by the mapper.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def expected_source_id(page: int, source_objects: list[str]) -> str | None:
    joined = " | ".join(source_objects)
    line = re.search(r"(block_\d+)\s*/\s*(line_\d+_\d+)", joined)
    if line:
        return f"sidecar:p{page}:block:{line.group(1)}:line:{line.group(2)}"
    backing = re.search(r"PDF drawing (\d+) black-circle backing", joined, flags=re.IGNORECASE)
    if backing:
        return f"pdf:p{page}:drawing-group:backing-{backing.group(1)}"
    drawing = re.search(r"PDF drawing (\d+)", joined, flags=re.IGNORECASE)
    if drawing:
        return f"pdf:p{page}:drawing:{drawing.group(1)}"
    return None


def pair_counts(predicted: dict[str, str], gold: dict[str, str]) -> tuple[int, int, int]:
    ids = sorted(set(predicted) & set(gold))
    tp = fp = fn = 0
    for index, left in enumerate(ids):
        for right in ids[index + 1:]:
            same_pred = predicted[left] == predicted[right]
            same_gold = gold[left] == gold[right]
            if same_pred and same_gold:
                tp += 1
            elif same_pred and not same_gold:
                fp += 1
            elif not same_pred and same_gold:
                fn += 1
    return tp, fp, fn


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mapper-output", type=Path, required=True)
    parser.add_argument("--ground-truth", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    mapped = load(args.mapper_output)
    truth = load(args.ground_truth)
    if mapped.get("annotationInputUsed") is not False:
        raise ValueError("Expected a mapper artifact explicitly marked annotationInputUsed=false")

    gold_region_instance: dict[str, str] = {}
    gold_region_source: dict[str, str | None] = {}
    for item in [*truth.get("instances", []), *truth.get("expectedDifferences", [])]:
        gold_key = item["id"]
        source_id = expected_source_id(item["page"], item.get("sourceObjects", []))
        for region_id in item["regionIds"]:
            if region_id in gold_region_instance:
                raise ValueError(f"Ground-truth region is assigned more than once: {region_id}")
            gold_region_instance[region_id] = gold_key
            gold_region_source[region_id] = source_id

    predicted_region_instance = {}
    predicted_region_source = {}
    statuses = defaultdict(int)
    errors = []
    region_items = {item["regionId"]: item for item in mapped.get("regions", [])}
    for region_id, region in region_items.items():
        association = region.get("association", {})
        statuses[association.get("status", "UNKNOWN")] += 1
        predicted_region_instance[region_id] = association.get("candidateInstanceId") or f"unassigned:{region_id}"
        predicted_region_source[region_id] = (association.get("sourceObject") or {}).get("id")
        expected = gold_region_source.get(region_id)
        actual = predicted_region_source[region_id]
        if expected != actual:
            errors.append({"regionId": region_id, "expectedSourceObjectId": expected, "actualSourceObjectId": actual, "status": association.get("status")})

    missing_from_map = sorted(set(gold_region_instance) - set(region_items))
    unmapped_to_truth = sorted(set(region_items) - set(gold_region_instance))
    if missing_from_map or unmapped_to_truth:
        errors.append({"coverageMismatch": {"missingFromMap": missing_from_map, "unmappedToTruth": unmapped_to_truth}})

    gold_ids = set(gold_region_instance.values())
    predicted_ids = set(predicted_region_instance.values())
    predicted_to_gold: dict[str, set[str]] = defaultdict(set)
    gold_to_predicted: dict[str, set[str]] = defaultdict(set)
    for region_id in set(gold_region_instance) & set(predicted_region_instance):
        predicted_to_gold[predicted_region_instance[region_id]].add(gold_region_instance[region_id])
        gold_to_predicted[gold_region_instance[region_id]].add(predicted_region_instance[region_id])
    over_merges = [
        {"predictedInstanceId": pid, "goldInstances": sorted(gids)}
        for pid, gids in sorted(predicted_to_gold.items()) if len(gids) > 1
    ]
    under_merges = [
        {"goldInstanceId": gid, "predictedInstances": sorted(pids)}
        for gid, pids in sorted(gold_to_predicted.items()) if len(pids) > 1
    ]
    exact_groups = 0
    for gid in gold_ids:
        gold_members = {rid for rid, gold_value in gold_region_instance.items() if gold_value == gid}
        predicted_groups_for_members = {predicted_region_instance[rid] for rid in gold_members if rid in predicted_region_instance}
        if len(predicted_groups_for_members) == 1:
            pid = next(iter(predicted_groups_for_members))
            if predicted_to_gold.get(pid) == {gid} and gold_members <= set(region_items):
                exact_groups += 1
    tp, fp, fn = pair_counts(predicted_region_instance, gold_region_instance)
    precision = tp / (tp + fp) if tp + fp else 1.0
    recall = tp / (tp + fn) if tp + fn else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    associated = sum(predicted_region_source.get(rid) is not None for rid in gold_region_instance)
    exact_object_matches = sum(predicted_region_source.get(rid) == gold_region_source.get(rid) for rid in gold_region_instance)

    result = {
        "schema": "delta-object-mapper-ground-truth-evaluation/v1",
        "mapperOutput": str(args.mapper_output),
        "groundTruthUsedAfterBlindReplay": str(args.ground_truth),
        "mapperAnnotationInputUsed": False,
        "pilotRawRegions": len(gold_region_instance),
        "objectAssociation": {
            "correctSourceObjectAssignments": exact_object_matches,
            "goldRegions": len(gold_region_instance),
            "accuracy": round(exact_object_matches / len(gold_region_instance), 6) if gold_region_instance else 0.0,
            "coverage": round(associated / len(gold_region_instance), 6) if gold_region_instance else 0.0,
            "errors": errors,
        },
        "instanceGrouping": {
            "expectedGroundTruthInstances": len(gold_ids),
            "predictedInstanceCandidates": len(predicted_ids),
            "exactGroupsReproduced": exact_groups,
            "exactGroupAccuracy": round(exact_groups / len(gold_ids), 6) if gold_ids else 0.0,
            "pairwisePrecision": round(precision, 6),
            "pairwiseRecall": round(recall, 6),
            "pairwiseF1": round(f1, 6),
            "overMerges": over_merges,
            "underMerges": under_merges,
        },
        "associationLevelCounts": dict(statuses),
        "unknownRate": round(statuses["UNKNOWN"] / len(region_items), 6) if region_items else 0.0,
        "ambiguousRate": round(statuses["AMBIGUOUS"] / len(region_items), 6) if region_items else 0.0,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "objectAssociationAccuracy": result["objectAssociation"]["accuracy"],
        "objectAssociationCoverage": result["objectAssociation"]["coverage"],
        "instanceGrouping": result["instanceGrouping"],
        "levels": result["associationLevelCounts"],
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
