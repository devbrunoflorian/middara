#!/usr/bin/env python3
"""Promote the source-vector p.26 banner ornaments after isolated proof."""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path.cwd()
PAGE_DIR = ROOT / "apps/web/public/pages/page_026"
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1"
SNAPSHOT_PAGE = PROOF / "snapshot-diagnostic-v5/pages/page_026"
SIDECAR = PAGE_DIR / "fidelity_overlays.json"
SIDECAR_BACKUP = PROOF / "fidelity-overlays-canonical-before-v1.json"
RECEIPT = PROOF / "ornament-overlay-canonical-application-v1.json"
EXPECTED_BEFORE_SHA256 = "e745781b762c6ce65642ba0d5fa582b1837481b431edbf5457c81c62a25a2092"
SOURCE_PDF_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
IMAGE_NAMES = [
    "fidelity-overlay-title-banner-ornaments-top-v1.png",
    "fidelity-overlay-title-banner-ornaments-breakdown-v1.png",
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    before_hash = digest(SIDECAR)
    assert before_hash == EXPECTED_BEFORE_SHA256, "Canonical p.26 overlay sidecar changed; refusing to overwrite."
    assert not SIDECAR_BACKUP.exists(), f"Refusing to overwrite {SIDECAR_BACKUP}"
    assert not RECEIPT.exists(), f"Refusing to overwrite {RECEIPT}"
    snapshot_sidecar = json.loads((SNAPSHOT_PAGE / "fidelity_overlays.json").read_text(encoding="utf-8"))
    source_sidecar = json.loads(SIDECAR.read_text(encoding="utf-8"))
    additions = snapshot_sidecar["overlays"][-2:]
    assert len(source_sidecar["overlays"]) == 3 and len(snapshot_sidecar["overlays"]) == 5
    assert [entry["auditId"] for entry in additions] == [
        "2026-10-16-p026-source-vector-banner-ornaments-v1",
        "2026-10-16-p026-source-vector-banner-ornaments-v1",
    ]
    assert all(entry["url"].startswith("/pages/page_026/") for entry in additions)
    for name in IMAGE_NAMES:
        source = SNAPSHOT_PAGE / name
        target = PAGE_DIR / name
        assert source.is_file() and not target.exists(), f"Overlay asset is missing or already exists: {target}"

    shutil.copy2(SIDECAR, SIDECAR_BACKUP)
    for name in IMAGE_NAMES:
        shutil.copy2(SNAPSHOT_PAGE / name, PAGE_DIR / name)
    source_sidecar["overlays"].extend(additions)
    SIDECAR.write_text(json.dumps(source_sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    after = json.loads(SIDECAR.read_text(encoding="utf-8"))
    assert len(after["overlays"]) == 5
    assert after["overlays"][-2:] == additions
    receipt = {
        "status": "applied_and_rollback_preserved",
        "page": 26,
        "sourcePdfSha256": SOURCE_PDF_SHA256,
        "sidecar": "apps/web/public/pages/page_026/fidelity_overlays.json",
        "sidecarSha256Before": before_hash,
        "sidecarSha256After": digest(SIDECAR),
        "sidecarBackup": "output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1/fidelity-overlays-canonical-before-v1.json",
        "sidecarBackupSha256": digest(SIDECAR_BACKUP),
        "addedOverlays": additions,
        "addedOverlayImageSha256": {name: digest(PAGE_DIR / name) for name in IMAGE_NAMES},
        "unchangedCanonicalSourceFiles": {
            name: digest(PAGE_DIR / name)
            for name in ("page_026_dom.json", "background.webp", "layout_frames.json")
        },
        "payloadWrites": 0,
        "rollback": "restore the backed-up fidelity_overlays.json and remove the two new PNGs named in addedOverlayImageSha256",
    }
    RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
