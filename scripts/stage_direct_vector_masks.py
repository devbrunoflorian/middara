#!/usr/bin/env python3
"""Stage known-control vector-clean crops into a disposable experiment copy."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/proofs/symbol-activation-2026-10-13"
EXPERIMENT = OUT / "vector-mask-experiment"
IDS = [
    "p085-v96-99-n4", "p085-v108-111-n4",
    "p092-v185-186-187", "p092-v188-189", "p092-v190",
]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    if EXPERIMENT.exists():
        raise SystemExit(f"Refusing to overwrite existing experiment: {EXPERIMENT}")
    shutil.copytree(OUT / "patches", EXPERIMENT / "patches")
    manifest_path = EXPERIMENT / "patches/patch-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    staged = []
    for cid in IDS:
        page = int(cid[1:4])
        folder = EXPERIMENT / "patches/pages" / f"page_{page:03d}"
        side_path = folder / "inline_elements.json"
        side = json.loads(side_path.read_text(encoding="utf-8"))
        matches = [e for e in side["elements"] if (e.get("provenance") or {}).get("candidateId") == cid]
        if len(matches) != 1:
            raise RuntimeError(f"Expected one prepared placement for {cid}")
        source = OUT / "vector-removal-diagnostics" / cid / "vector-removed-crop.png"
        if not source.is_file():
            raise RuntimeError(f"Missing direct vector-removal evidence: {source}")
        # The isolated lab only rewrites patch-local URLs whose filenames carry
        # the audit prefix, so keep the original asset-routing contract.
        name = f"audit-vector-clean-mask-{cid}.png"
        target = folder / name
        shutil.copyfile(source, target)
        element = matches[0]
        element["mask"]["url"] = f"/pages/page_{page:03d}/{name}"
        element["provenance"]["maskSha256"] = sha(target)
        element["provenance"]["maskExperiment"] = "isolated-direct-vector-removal-at-native-background-pixel-width"
        side_path.write_text(json.dumps(side, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        page_plan = next(p for p in manifest["pages"] if p["page"] == page)
        page_plan["preparedSidecarSha256"] = sha(side_path)
        staged.append({"candidateId": cid, "page": page, "maskFile": name,
                       "maskSha256": sha(target), "sourceCrop": str(source.relative_to(ROOT)),
                       "dimensionsPx": list(__import__("PIL.Image", fromlist=["Image"]).open(target).size)})
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {"status": "isolated experiment only; all five remain blocked in authoritative activation status",
              "sourceMasksChanged": False, "canonicalWrites": 0,
              "maskMethod": "source PDF copy; redact graphics only; images=0 and text=0; render at exact background.webp pixel width; crop known mask bounds",
              "placements": staged}
    (EXPERIMENT / "staging-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"experiment": str(EXPERIMENT), "staged": len(staged), "authoritativeStatusChanged": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
