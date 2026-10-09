#!/usr/bin/env python3
"""Build a bounded detector input without overwriting the accepted pilot."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pilot-manifest", type=Path, default=Path("docs/project-progress/evidence/2026-10-08-delta-driven-viewer-capture/capture-manifest.json"))
    parser.add_argument("--mapper-manifest", type=Path, default=Path("docs/project-progress/evidence/2026-10-08-delta-object-association-mapper/object-mapper-capture-manifest.json"))
    parser.add_argument("--output", type=Path, default=Path("docs/project-progress/evidence/2026-10-08-delta-object-association-mapper/object-mapper-detector-input-manifest.json"))
    args = parser.parse_args()
    pilot_path = args.pilot_manifest.resolve()
    mapper_path = args.mapper_manifest.resolve()
    output_path = args.output.resolve()
    pilot = load(pilot_path)
    mapper = load(mapper_path)
    pilot_keep = {(49, "current"), (56, "current"), (67, "current"), (67, "historical-no-pill")}
    captures = []
    for capture in pilot.get("captures", []):
        if (capture["page"], capture["state"]) not in pilot_keep:
            continue
        captures.append({
            **capture,
            "file": f"../2026-10-08-delta-driven-viewer-capture/{capture['file']}",
            "provenance": "reused accepted pilot screenshot; no recapture",
        })
    for capture in mapper.get("captures", []):
        if capture.get("kind") == "holdout":
            captures.append({**capture, "provenance": "new deterministic holdout screenshot"})
    keys = [(capture["page"], capture["state"]) for capture in captures]
    if len(keys) != len(set(keys)):
        raise ValueError(f"Duplicate (page,state) capture keys in bounded input: {keys}")
    required = pilot_keep | {(page, "current") for page in load(mapper_path.parent / "holdout-selection.json")["selectedPages"]}
    missing = sorted(required - set(keys))
    if missing:
        raise ValueError(f"Required pilot/holdout captures missing: {missing}")
    result = {
        "appUrl": mapper.get("appUrl"),
        "apiOrigin": mapper.get("apiOrigin"),
        "appCommit": pilot.get("appCommit"),
        "appWorktreeDirty": pilot.get("appWorktreeDirty"),
        "browser": pilot.get("browser"),
        "mode": "viewer",
        "locale": "en",
        "viewport": mapper.get("viewport"),
        "deviceScaleFactor": mapper.get("deviceScaleFactor"),
        "capture": "bounded detector input: pilot controls reused + five preselected holdout pages; source/viewer pixel detector itself is unchanged",
        "sourcePdfPath": pilot.get("pdfPath"),
        "selectionFile": "holdout-selection.json",
        "captures": captures,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(output_path), "captureCount": len(captures), "pages": keys}, indent=2))


if __name__ == "__main__":
    main()
