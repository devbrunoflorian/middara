#!/usr/bin/env python3
"""Create p.33 v5 from v4 with meaning-preserving copyfit revisions."""
from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path


ROOT = Path.cwd()
V4 = ROOT / "output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v4"
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v5"
BLOCKED_KEY = "page_33_block_22__pt-BR"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


if not V4.is_dir():
    raise SystemExit(f"Missing p.33 v4 proof: {V4}")
if PROOF.exists():
    raise SystemExit(f"Refusing to replace existing proof: {PROOF}")

PROOF.mkdir(parents=True)
shutil.copytree(V4 / "snapshot", PROOF / "snapshot")
for filename in ("source-hashes.json", "artwork-scope.json"):
    shutil.copy2(V4 / filename, PROOF / filename)

proposal = read_json(V4 / "proposal-candidates.json")
snapshot_path = PROOF / "snapshot/snapshot.json"
snapshot = read_json(snapshot_path)
candidates = proposal["candidates"]
records = {item["spanKey"]: item for item in candidates}
translations = {item["spanKey"]: item for item in snapshot["translations"]}

# The first sentence is shorter while keeping the default dice source and both
# roll contexts. The two rich purple-die markers and emphasis remain intact.
key = "page_33_unit_p33-block-35-default-dice-paragraph__pt-BR"
candidate = records[key]
candidate["data"]["segments"][0]["text"] = (
    "Por padrão, o Aventureiro usa os dados da Carta de Aventureiro ao Conjurar ou fazer Testes de Convicção. "
    "Em geral, rola "
)
candidate["proposalText"] = "".join(segment.get("text", "") for segment in candidate["data"]["segments"])
translations[key]["data"] = copy.deepcopy(candidate["data"])

# Tighten the explanation while preserving the red-dot cost and zero-SP cases.
key = "page_33_block_9__pt-BR"
candidate = records[key]
candidate["data"]["segments"][1]["text"] = (
    "\nPontos vermelhos indicam o custo de SP. Algumas Disciplinas custam "
)
candidate["proposalText"] = "".join(segment.get("text", "") for segment in candidate["data"]["segments"])
translations[key]["data"] = copy.deepcopy(candidate["data"])

# Preserve the upgrade caps and the choice rule with a shorter sentence.
key = "page_33_block_24__pt-BR"
candidate = records[key]
segments = candidate["data"]["segments"]
segments[0]["text"] = "Um Aventureiro tem limite de "
segments[2]["text"] = " Aprimoramento na rolagem de Conjuração e "
segments[4]["text"] = (
    " no Teste de Convicção. Se uma Habilidade conceder mais do que pode usar, "
    "deve escolher quais aproveitar."
)
candidate["proposalText"] = "".join(segment.get("text", "") for segment in segments)
translations[key]["data"] = copy.deepcopy(candidate["data"])

proposal["version"] = 5
proposal["status"] = "p033_v5_copyfit_revisions_prepared_one_whole_unit_diagnostic_blank_fixed_die_overlap_pending_export"
proposal["revisionHistory"] = [{
    "from": "v4",
    "copyfitV3Findings": {
        "page_33_unit_p33-block-35-default-dice-paragraph__pt-BR": {"rightExcessPt": 0.211},
        "page_33_block_9__pt-BR": {"rightExcessPt": 1.734},
        "page_33_block_24__pt-BR": {"rightExcessPt": 2.039},
    },
    "changes": [
        "Shortened the default-dice introduction while retaining the source of the dice and both roll contexts.",
        "Shortened the SP-cost explanation while retaining the red-dot key and zero-cost/other-condition cases.",
        "Rephrased the upgrade limits while retaining both caps and the choice rule.",
    ],
}]
proposal["counts"]["copyfitV3Status"] = "revised_candidates_prepared_for_rerun"
proposal["counts"]["visibleCandidateUnitsInV5"] = 18
proposal["counts"]["wholeUnitDiagnosticBlanks"] = 1
write_json(PROOF / "proposal-candidates.json", proposal)
write_json(snapshot_path, snapshot)

with (PROOF / "README.md").open("w", encoding="utf-8", newline="") as stream:
    stream.write(
        "# p.33 editable prose proposal — v5 Copyfit V3 iteration\n\n"
        "V5 carries forward the whole-unit diagnostic blank for block_38. It revises the default-dice paragraph, SP-cost explanation, and upgrade-cap paragraph after v4 Copyfit V3 measured right-edge excesses in those units. Full text remains in `proposal-candidates.json`. Re-export this snapshot and rerun Copyfit V3 before treating the copy as fitted. No Payload writes or canonical page changes were made for this snapshot.\n"
    )

print(json.dumps({
    "status": proposal["status"],
    "candidateCount": len(candidates),
    "updatedSpanKeys": [
        "page_33_unit_p33-block-35-default-dice-paragraph__pt-BR",
        "page_33_block_9__pt-BR",
        "page_33_block_24__pt-BR",
    ],
    "blockedSpanKey": BLOCKED_KEY,
    "proofDir": PROOF.relative_to(ROOT).as_posix(),
}, ensure_ascii=False, indent=2))
