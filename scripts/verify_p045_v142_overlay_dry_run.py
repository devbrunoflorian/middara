#!/usr/bin/env python3
"""Dry-run, repeat, and rollback the isolated p.45 clean-mask overlay."""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "output/proofs/full-symbol-integrity-2026-10-13/patches/pages/page_045"
OVERLAY = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p045-v142-proof-v2/activation-overlay"
PAGE_OVERLAY = OVERLAY / "pages/page_045"
OUT = OVERLAY / "dry-run"
SOURCE_PDF_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
TARGET_MASK = "audit-mask-p045-v142-145-n4.png"


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tree_hashes(root: Path) -> dict[str, str]:
    return {path.relative_to(root).as_posix(): sha(path) for path in sorted(root.rglob("*")) if path.is_file()}


def main() -> None:
    if OUT.exists():
        raise SystemExit(f"Refusing to overwrite existing dry-run: {OUT}")
    manifest = json.loads((OVERLAY / "overlay-manifest.json").read_text(encoding="utf-8"))
    assert manifest["sourcePdfSha256"] == SOURCE_PDF_SHA256
    assert manifest["sidecarMetadataChanged"] is False
    assert manifest["originalPrepared111PackageModified"] is False
    before = tree_hashes(BASE)
    assert TARGET_MASK in before
    assert sha(BASE / TARGET_MASK) == manifest["originalMaskSha256"]
    assert sha(PAGE_OVERLAY / TARGET_MASK) == manifest["replacementMaskSha256"]

    working = OUT / "working/pages/page_045"
    shutil.copytree(BASE, working)
    shutil.copyfile(PAGE_OVERLAY / TARGET_MASK, working / TARGET_MASK)
    after_first = tree_hashes(working)
    changed = sorted(key for key in before if before[key] != after_first.get(key))
    assert changed == [TARGET_MASK], changed

    shutil.copyfile(PAGE_OVERLAY / TARGET_MASK, working / TARGET_MASK)
    after_second = tree_hashes(working)
    assert after_second == after_first

    shutil.copyfile(BASE / TARGET_MASK, working / TARGET_MASK)
    after_rollback = tree_hashes(working)
    assert after_rollback == before
    assert tree_hashes(BASE) == before

    receipt = {
        "schemaVersion": 1,
        "generatedAt": date.today().isoformat(),
        "candidateId": manifest["candidateId"],
        "status": "PASS candidate-overlay dry-run, idempotence, and rollback",
        "sourcePdfSha256": SOURCE_PDF_SHA256,
        "basePageAssetCount": len(before),
        "diff": [
            {
                "path": TARGET_MASK,
                "beforeSha256": before[TARGET_MASK],
                "afterSha256": after_first[TARGET_MASK],
            }
        ],
        "firstApplicationChangedOnlyTargetAsset": True,
        "secondApplicationIdempotent": after_second == after_first,
        "rollbackRestoredExactBaseTree": after_rollback == before,
        "originalPrepared111PackageModified": False,
        "canonicalSidecarsModified": False,
        "payloadWritten": False,
        "humanTranslationWritten": False,
        "sourcePdfWrittenOrModified": False,
    }
    receipt_path = OUT / "dry-run-receipt.json"
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"receipt": str(receipt_path), "diff": receipt["diff"], "idempotent": receipt["secondApplicationIdempotent"], "rollback": receipt["rollbackRestoredExactBaseTree"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
