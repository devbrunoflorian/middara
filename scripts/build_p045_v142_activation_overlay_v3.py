#!/usr/bin/env python3
"""Package the proven p.45 mask as an isolated page overlay, preserving v2."""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PAGE_DIR = ROOT / "output/proofs/full-symbol-integrity-2026-10-13/patches/pages/page_045"
PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p045-v142-proof-v3"
CLEAN_MASK = PROOF_ROOT / "p045-v142-145-n4/native-vector-clean-mask.png"
INPUT_JSON = PROOF_ROOT / "p045-v142-145-n4/candidate-input.json"
OUT = PROOF_ROOT / "activation-overlay"
PAGE_OUT = OUT / "pages/page_045"
MANIFEST = OUT / "overlay-manifest.json"
TARGET_ID = "p045-v142-145-n4"
SOURCE_PDF_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    if OUT.exists():
        raise SystemExit(f"Refusing to overwrite existing isolated overlay: {OUT}")
    candidate = json.loads(INPUT_JSON.read_text(encoding="utf-8"))
    assert candidate["candidateId"] == TARGET_ID
    assert candidate["sourcePdfSha256"] == SOURCE_PDF_SHA256
    sidecar_path = SOURCE_PAGE_DIR / "inline_elements.json"
    original_sidecar_sha = sha(sidecar_path)
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
    matches = [entry for entry in sidecar["elements"] if (entry.get("provenance") or {}).get("candidateId") == TARGET_ID]
    assert len(matches) == 1
    element = matches[0]
    mask_name = Path(element["mask"]["url"]).name
    original_mask = SOURCE_PAGE_DIR / mask_name
    original_mask_sha = sha(original_mask)
    clean_mask_sha = sha(CLEAN_MASK)
    assert original_mask_sha == candidate["originalMaskSha256"]
    assert clean_mask_sha == candidate["exactCleanMaskSha256"]

    shutil.copytree(SOURCE_PAGE_DIR, PAGE_OUT)
    shutil.copyfile(CLEAN_MASK, PAGE_OUT / mask_name)
    assert sha(PAGE_OUT / "inline_elements.json") == original_sidecar_sha

    changed_files = []
    source_files = sorted(path for path in SOURCE_PAGE_DIR.rglob("*") if path.is_file())
    for source_file in source_files:
        relative = source_file.relative_to(SOURCE_PAGE_DIR)
        output_file = PAGE_OUT / relative
        assert output_file.exists()
        if sha(source_file) != sha(output_file):
            changed_files.append(relative.as_posix())
    assert changed_files == [mask_name], changed_files

    manifest = {
        "schemaVersion": 1,
        "generatedAt": date.today().isoformat(),
        "status": "isolated candidate overlay prepared; full activation-v2 archive and canonical files unchanged",
        "candidateId": TARGET_ID,
        "page": 45,
        "symbolId": "dice.white",
        "sourcePdfSha256": SOURCE_PDF_SHA256,
        "sourceSidecarPath": str(sidecar_path.relative_to(ROOT)).replace("\\", "/"),
        "sourceSidecarSha256": original_sidecar_sha,
        "overlaySidecarSha256": sha(PAGE_OUT / "inline_elements.json"),
        "sidecarMetadataChanged": False,
        "targetAssetPath": str((PAGE_OUT / mask_name).relative_to(ROOT)).replace("\\", "/"),
        "targetAssetUrl": element["mask"]["url"],
        "originalMaskSha256": original_mask_sha,
        "replacementMaskSha256": clean_mask_sha,
        "changedFilesWithinPageOverlay": changed_files,
        "copiedPageAssetCount": len(source_files),
        "originalPrepared111PackageModified": False,
        "canonicalSidecarModified": False,
        "payloadWritten": False,
        "humanTranslationWritten": False,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(MANIFEST), "manifestSha256": sha(MANIFEST), "changedFiles": changed_files, "copiedPageAssetCount": len(source_files), "originalMaskSha256": original_mask_sha, "replacementMaskSha256": clean_mask_sha}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
