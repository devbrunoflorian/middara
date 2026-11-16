#!/usr/bin/env python3
"""Build isolated EN snapshots for the two p.74 white-die source slots.

This only reads existing proof snapshots and page assets. It writes a new,
versioned proof directory under output/proofs and never touches canonical data.
"""

from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT_ROOT = ROOT / "output/proofs/symbol-activation-2026-10-13/batch-95/pending-50-proof-2026-10-14/snapshots"
OUTPUT_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/p074-original-position-reproof-v1"
SOURCE_IDS = ("p074-v195-198-n4", "p074-v203-206-n4")
ASSET_SUFFIXES = (
    "audit-source-p074-v195-198-n4.svg",
    "audit-source-p074-v203-206-n4.svg",
)
APPEARANCE_KEY = "f922eb3ea21fad7fb0736645fa6fad858c9972cd0530707d62d2efe71fd392e1"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def find_translation(snapshot: dict) -> dict:
    matches = [
        doc for doc in snapshot.get("translations", [])
        if doc.get("spanKey") == "page_74_block_4" and doc.get("language") == "en"
    ]
    if len(matches) != 1:
        raise ValueError(f"Expected one normalized EN p.74 translation, found {len(matches)}")
    return matches[0]


def build_original_segments(segments: list[dict]) -> list[dict]:
    symbols = [segment for segment in segments if segment.get("symbolId") == "dice.white"]
    if len(symbols) != 2:
        raise ValueError(f"Expected exactly two white dice, found {len(symbols)}")
    tokens_by_asset: dict[str, dict] = {}
    for segment in symbols:
        metrics = segment.get("symbolMetrics", {})
        asset = str(metrics.get("sourceAssetUrl", "")).rsplit("/", 1)[-1]
        if asset not in ASSET_SUFFIXES:
            raise ValueError(f"Unexpected symbol source asset {asset!r}")
        if metrics.get("sourceAppearanceKey") != APPEARANCE_KEY:
            raise ValueError(f"Source appearance key mismatch for {asset}")
        if asset in tokens_by_asset:
            raise ValueError(f"Duplicate source token for {asset}")
        tokens_by_asset[asset] = copy.deepcopy(segment)
    if set(tokens_by_asset) != set(ASSET_SUFFIXES):
        raise ValueError(f"Source token set mismatch: {sorted(tokens_by_asset)}")

    prose = [copy.deepcopy(segment) for segment in segments if not segment.get("symbolId")]
    output: list[dict] = []
    white_count = 0
    i = 0
    while i < len(prose):
        segment = prose[i]
        output.append(segment)
        i += 1
        if segment.get("text") != "WHITE":
            continue
        white_count += 1
        if white_count > 2:
            raise ValueError("Found more than two WHITE labels")
        if i >= len(prose):
            raise ValueError("Expected source whitespace after WHITE label")
        following_text = str(prose[i].get("text", ""))
        if not following_text:
            raise ValueError("Expected non-empty text after WHITE label")
        if following_text.strip():
            # In the first slot, the two spaces before "and" straddle the
            # symbol. Split off exactly one as the pre-symbol source advance.
            if not following_text.startswith((" ", "\t", "\n")):
                raise ValueError("Expected whitespace before first source slot")
            before_symbol = copy.deepcopy(prose[i])
            before_symbol["text"] = following_text[0]
            remainder = copy.deepcopy(prose[i])
            remainder["text"] = following_text[1:]
            output.append(before_symbol)
            output.append(copy.deepcopy(tokens_by_asset[ASSET_SUFFIXES[white_count - 1]]))
            if remainder["text"]:
                output.append(remainder)
            i += 1
            continue
        output.append(prose[i])
        i += 1
        output.append(copy.deepcopy(tokens_by_asset[ASSET_SUFFIXES[white_count - 1]]))
    if white_count != 2:
        raise ValueError(f"Expected two WHITE labels, found {white_count}")
    return output


def prepare_snapshot(source_id: str, mode: str) -> Path:
    source_dir = INPUT_ROOT / source_id
    source_snapshot_path = source_dir / "snapshot.json"
    snapshot = read_json(source_snapshot_path)
    translation = find_translation(snapshot)
    data = translation.get("data", {})
    source_segments = data.get("segments", [])
    original = build_original_segments(source_segments)

    data["spanKey"] = "page_74_block_4"
    data["lineHeight"] = 1.4
    data["lineHeightMode"] = "custom"
    data["managedSourceSymbols"] = ["dice.white"]
    data["segments"] = original if mode == "original" else [
        copy.deepcopy(segment) for segment in original if not segment.get("symbolId")
    ]
    if translation.get("spanKey") != "page_74_block_4" or translation.get("language") != "en":
        raise ValueError("Snapshot translation identity is not normalized EN page_74_block_4")

    # Full target asset set and source page boxes come from the unchanged,
    # isolated proof directory. Each output snapshot owns its copies.
    snapshot_root = OUTPUT_ROOT / "snapshots" / mode
    if snapshot_root.exists():
        raise FileExistsError(f"Refusing to overwrite existing proof snapshot: {snapshot_root}")
    shutil.copytree(source_dir / "pages", snapshot_root / "pages")
    write_json(snapshot_root / "snapshot.json", snapshot)

    # Save a compact manifest with checks that make reconstruction auditable.
    manifest = {
        "schemaVersion": 1,
        "page": 74,
        "language": "en",
        "sourceCandidateSnapshots": list(SOURCE_IDS),
        "sourceSpanKey": "page_74_block_4",
        "mode": mode,
        "lineHeight": 1.4,
        "lineHeightDerivation": "14 pt between source baselines / 10 pt body font = 1.4",
        "managedSourceSymbols": ["dice.white"],
        "symbolAssetOrder": [] if mode == "empty" else list(ASSET_SUFFIXES),
        "symbolCount": sum(bool(segment.get("symbolId")) for segment in data["segments"]),
        "sourceAppearanceKey": APPEARANCE_KEY,
        "canonicalPayloadOrSidecarWrites": 0,
        "translationHumanTextChanged": False,
    }
    write_json(snapshot_root / "snapshot-manifest.json", manifest)
    return snapshot_root / "snapshot.json"


def main() -> None:
    for source_id in SOURCE_IDS:
        if not (INPUT_ROOT / source_id / "snapshot.json").is_file():
            raise FileNotFoundError(f"Missing source proof snapshot for {source_id}")
    original_path = prepare_snapshot(SOURCE_IDS[0], "original")
    empty_path = prepare_snapshot(SOURCE_IDS[0], "empty")
    print(json.dumps({
        "created": [str(original_path.relative_to(ROOT)), str(empty_path.relative_to(ROOT))],
        "sourceCandidateSnapshots": list(SOURCE_IDS),
        "canonicalPayloadOrSidecarWrites": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
