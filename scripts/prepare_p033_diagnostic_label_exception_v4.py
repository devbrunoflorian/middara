#!/usr/bin/env python3
"""Fork the p.33 v3 proof and blank the one label that collides with a fixed die."""
from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path


ROOT = Path.cwd()
BASE = ROOT / "output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v3"
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4"
SNAPSHOT_PATH = PROOF / "snapshot/snapshot.json"
PROPOSAL_PATH = PROOF / "proposal-candidates.json"
BLOCKED_KEY = "page_33_block_22__pt-BR"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_new_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


if not BASE.is_dir():
    raise SystemExit(f"Missing verified v3 proof: {BASE}")
if PROOF.exists():
    raise SystemExit(f"Refusing to replace existing proof: {PROOF}")

PROOF.mkdir(parents=True)
shutil.copytree(BASE / "snapshot", PROOF / "snapshot")
for filename in ("source-hashes.json", "artwork-scope.json"):
    shutil.copy2(BASE / filename, PROOF / filename)

snapshot = read_json(SNAPSHOT_PATH)
snapshot_records = [item for item in snapshot.get("translations", []) if item.get("spanKey") == BLOCKED_KEY]
if len(snapshot_records) != 1:
    raise SystemExit(f"Expected exactly one snapshot record for {BLOCKED_KEY}; found {len(snapshot_records)}")

proposal = read_json(BASE / "proposal-candidates.json")
candidate_records = [item for item in proposal.get("candidates", []) if item.get("spanKey") == BLOCKED_KEY]
if len(candidate_records) != 1:
    raise SystemExit(f"Expected exactly one full proposal for {BLOCKED_KEY}; found {len(candidate_records)}")

full_proposal = copy.deepcopy(candidate_records[0]["data"])
blank_diagnostic = {
    "schemaVersion": 2,
    "segments": [],
    "textAlign": full_proposal.get("textAlign", "left"),
    "lineHeight": full_proposal.get("lineHeight", 1.1),
    "lineHeightMode": full_proposal.get("lineHeightMode", "source"),
    "managedSourceSymbols": [],
}
snapshot_records[0]["data"] = blank_diagnostic
write_new_json(SNAPSHOT_PATH, snapshot)

candidate_records[0]["diagnosticData"] = blank_diagnostic
candidate_records[0]["status"] = "full_proposal_preserved_whole_unit_blank_in_v4_snapshot_due_to_fixed_source_die_overlap"
candidate_records[0]["diagnosticRendering"] = "The entire translated Casting label is blank only in this isolated diagnostic; the source purple die remains at its original background position."

proposal["status"] = "18_of_19_units_visible_in_v4_diagnostic_one_whole_unit_blank_due_to_fixed_source_die_overlap_artwork_pending_human_review_pending"
proposal["scope"] = (
    "19 editable prose proposals. The full proposal for block_38 is preserved, but its whole label is blank only in v4 "
    "because the longer Portuguese label collides with a purple source die that has no semantic placement. Three English "
    "card overlays remain unchanged; this is not a fully localized physical page."
)
proposal["counts"] = {
    "candidateUnits": 19,
    "snapshotRecords": 19,
    "visibleCandidateUnitsInV4": 18,
    "diagnosticWholeUnitBlanks": 1,
    "payloadWrites": 0,
    "humanReviewStatus": "pending",
}
proposal["diagnosticExceptions"] = [{
    "id": "p033-casting-label-fixed-source-die-overlap",
    "page": 33,
    "sourceBlockId": "block_38",
    "spanKey": BLOCKED_KEY,
    "sourceBboxPt": [91.5789, 217.7640, 140.2989, 231.2440],
    "sourceSymbol": "purple die printed immediately after the Casting label",
    "finding": "Conjuração: is wider than the English Casting: source label and visibly collides with the fixed purple die in the v3 Viewer/PDF raster.",
    "diagnosticTreatment": "Keep the entire block_38 translation blank in the v4 Viewer/PDF snapshot. Preserve the complete proposal in this candidate record. Leave the source die in the original background position.",
    "requiredAction": "Trace the source die as a semantic placement or approve a shorter label that fits before it; then rerun Viewer, Copyfit and PDF review.",
}]
write_new_json(PROPOSAL_PATH, proposal)

README = """# p.33 editable prose proposal — v4 diagnostic correction

V4 is copied from the isolated v3 page snapshot. The full proposal text remains in `proposal-candidates.json`. Only `block_38` (the translated `Casting:` label) is blank in this diagnostic because the v3 Viewer/PDF visibly showed the longer `Conjuração:` label colliding with its fixed source purple die. The source background and die stay in their original positions.

The other 18 text units and the three source English card overlays match v3. No Payload writes or canonical page changes were made to create this diagnostic. The collision exception remains open, and the proposal is not approved.
"""
with (PROOF / "README.md").open("x", encoding="utf-8", newline="") as stream:
    stream.write(README)

print(json.dumps({
    "status": proposal["status"],
    "page": 33,
    "candidateUnits": 19,
    "visibleCandidateUnitsInV4": 18,
    "diagnosticWholeUnitBlanks": 1,
    "blockedKey": BLOCKED_KEY,
    "proofDir": PROOF.relative_to(ROOT).as_posix(),
}, ensure_ascii=False, indent=2))
