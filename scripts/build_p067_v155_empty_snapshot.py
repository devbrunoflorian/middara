#!/usr/bin/env python3
"""Build an immutable, isolated empty-state EN snapshot for p.67 candidate proof."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p067-v155-pending-proof-v1/p067-v155-158-n4"
SOURCE_SNAPSHOT = PROOF / "snapshot/original-position-snapshot.json"
EMPTY_STATE = PROOF / "empty-state.json"
OUTPUT = PROOF / "snapshot/empty-position-snapshot.json"
TARGET_ID = "p067-v155-158-n4"
TARGET_SYMBOL = "dice.white"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(document: dict) -> bytes:
    return (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def main() -> None:
    snapshot = json.loads(SOURCE_SNAPSHOT.read_text(encoding="utf-8"))
    empty = json.loads(EMPTY_STATE.read_text(encoding="utf-8"))
    assert snapshot["page"] == empty["page"] == 67
    assert len(snapshot["translations"]) == 1
    assert len(empty["records"]) == 1

    translation = snapshot["translations"][0]
    record = empty["records"][0]
    assert translation["spanKey"] == record["key"] == "page_67_block_13"
    assert translation["language"] == empty["language"] == "en"
    assert not translation["spanKey"].endswith("__en")
    original_targets = [
        segment for segment in translation["data"]["segments"]
        if segment.get("symbolId") == TARGET_SYMBOL
    ]
    empty_targets = [
        segment for segment in record["segments"]
        if segment.get("symbolId") == TARGET_SYMBOL
    ]
    assert len(original_targets) == 1, f"{TARGET_ID}: source-position snapshot must contain one target."
    assert len(empty_targets) == 0, f"{TARGET_ID}: empty override must contain no target symbol."
    assert record["managedSourceSymbols"] == translation["data"]["managedSourceSymbols"]

    result = json.loads(json.dumps(snapshot))
    result["translations"][0]["data"]["segments"] = record["segments"]
    result["translations"][0]["data"]["managedSourceSymbols"] = record["managedSourceSymbols"]
    payload = encode(result)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists():
        assert OUTPUT.read_bytes() == payload, f"Refusing to overwrite different evidence: {OUTPUT}"
    else:
        OUTPUT.write_bytes(payload)

    print(json.dumps({
        "candidateId": TARGET_ID,
        "snapshot": str(OUTPUT.relative_to(ROOT)),
        "snapshotSha256": digest(OUTPUT),
        "sourceSnapshotSha256": digest(SOURCE_SNAPSHOT),
        "sourceTargetOccurrences": len(original_targets),
        "emptyTargetOccurrences": len(empty_targets),
        "spanKey": translation["spanKey"],
        "language": translation["language"],
        "lineHeight": translation["data"]["lineHeight"],
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
