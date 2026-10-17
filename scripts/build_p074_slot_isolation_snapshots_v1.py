#!/usr/bin/env python3
"""Build sibling-preserving empty snapshots for the two p.74 dice slots.

The snapshots are isolated proof inputs. This script only reads versioned
proof data and writes under output/proofs; it does not touch canonical sidecars,
Payload, human translations, or the source PDF.
"""

from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/p074-original-position-reproof-v1"
SOURCE_SNAPSHOT = PROOF_ROOT / "snapshots/original/snapshot.json"
TARGETS = {
    "p074-v195-198-n4": "audit-source-p074-v195-198-n4.svg",
    "p074-v203-206-n4": "audit-source-p074-v203-206-n4.svg",
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def plain_text(snapshot: dict) -> str:
    return "".join(
        str(segment.get("text", ""))
        for translation in snapshot.get("translations", [])
        for segment in translation.get("data", {}).get("segments", [])
        if not segment.get("symbolId")
    )


def main() -> None:
    if not SOURCE_SNAPSHOT.is_file():
        raise FileNotFoundError(SOURCE_SNAPSHOT)
    source = read_json(SOURCE_SNAPSHOT)
    if len(source.get("translations", [])) != 1:
        raise ValueError("Expected one isolated EN translation in the source proof snapshot")
    translation = source["translations"][0]
    if translation.get("spanKey") != "page_74_block_4" or translation.get("language") != "en":
        raise ValueError("Source proof snapshot must use normalized EN page_74_block_4")
    source_symbols = [
        segment
        for segment in translation["data"].get("segments", [])
        if segment.get("symbolId") == "dice.white"
    ]
    assets = {
        str(symbol.get("symbolMetrics", {}).get("sourceAssetUrl", "")).rsplit("/", 1)[-1]
        for symbol in source_symbols
    }
    if len(source_symbols) != 2 or assets != set(TARGETS.values()):
        raise ValueError(f"Expected the two frozen p.74 source assets, got {len(source_symbols)}: {sorted(assets)}")
    original_text = plain_text(source)

    for target_id, asset_name in TARGETS.items():
        output_dir = PROOF_ROOT / "snapshots" / f"empty-preserve-sibling-{target_id}"
        if output_dir.exists():
            raise FileExistsError(f"Refusing to overwrite existing isolated snapshot: {output_dir}")
        snapshot = copy.deepcopy(source)
        data = snapshot["translations"][0]["data"]
        kept = []
        removed = 0
        preserved = 0
        for segment in data.get("segments", []):
            if segment.get("symbolId") != "dice.white":
                kept.append(segment)
                continue
            actual_asset = str(segment.get("symbolMetrics", {}).get("sourceAssetUrl", "")).rsplit("/", 1)[-1]
            if actual_asset == asset_name:
                removed += 1
            else:
                preserved += 1
                kept.append(segment)
        if removed != 1 or preserved != 1:
            raise ValueError(f"Expected to remove {target_id} and preserve exactly one sibling")
        data["segments"] = kept
        if plain_text(snapshot) != original_text:
            raise ValueError(f"Human EN text changed while removing {target_id}")
        shutil.copytree(PROOF_ROOT / "snapshots/original/pages", output_dir / "pages")
        write_json(output_dir / "snapshot.json", snapshot)
        write_json(output_dir / "snapshot-manifest.json", {
            "schemaVersion": 1,
            "page": 74,
            "language": "en",
            "spanKey": "page_74_block_4",
            "mode": "target-removed-sibling-preserved",
            "removedCandidateId": target_id,
            "removedSourceAsset": asset_name,
            "preservedSiblingCandidateId": next(candidate for candidate, asset in TARGETS.items() if asset != asset_name),
            "serializedTargetSymbolCount": 1,
            "canonicalPayloadOrSidecarWrites": 0,
            "humanTranslationTextChanged": False,
        })

    print(json.dumps({
        "created": [
            f"snapshots/empty-preserve-sibling-{target_id}/snapshot.json"
            for target_id in TARGETS
        ],
        "sourceSnapshot": SOURCE_SNAPSHOT.relative_to(ROOT).as_posix(),
        "canonicalPayloadSidecarOrTranslationWrites": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
