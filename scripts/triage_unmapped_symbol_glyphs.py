#!/usr/bin/env python3
"""Prioritize the existing 116 unmapped-glyph records; do not rescan or remap."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "output/proofs/full-symbol-integrity-2026-10-13/audit.json"
OUT = ROOT / "output/proofs/symbol-activation-2026-10-13/unmapped-glyph-triage"


def nearby_text(candidate: dict) -> str:
    text = [(s.get("text") or "").replace("\n", " ").strip()
            for s in candidate.get("nearby", []) if (s.get("text") or "").strip()]
    return " | ".join(text[:8])


def classify(c: dict) -> dict:
    page, font, group = c.get("page"), c.get("font"), c.get("shapeGroup")
    if page == 63 and font == "Wingdings-Regular":
        return {"tier": 1, "risk": "alto", "workingClass": "marcador de lista/ícone inline provável",
                "reason": "114 ocorrências na mesma lista; fonte e codepoint estão sem mapa semântico, a extração inclui U+FFFD e o grupo fixo preserva o byte 0x88.",
                "nextStep": "resolver o codepoint pelo PDF/fonte incorporada e validar a família como checkbox/ícone antes de qualquer mapping.",
                "autoMap": False}
    if page == 7 and font == "ZapfDingbatsStd":
        return {"tier": 2, "risk": "médio", "workingClass": "glifo inline/decorativo inconclusivo",
                "reason": "uma ocorrência alinhada ao início de frase; o texto adjacente não decide se é marcador semântico ou ornamento.",
                "nextStep": "comparar o glifo no PDF-fonte e conferir o papel na frase antes de classificar.",
                "autoMap": False}
    if page == 15 and font == "Wingdings3":
        return {"tier": 3, "risk": "baixo para edição; semântica inconclusiva", "workingClass": "ornamento/footer provável",
                "reason": "uma ocorrência adjacente ao rótulo CONTINUED em bloco não editável; risco menor de perda durante edição de prosa.",
                "nextStep": "confirmar visualmente no PDF ao tratar a p.15; preservar como arte até então.",
                "autoMap": False}
    return {"tier": 9, "risk": "indeterminado", "workingClass": "não classificado", "reason": "fora dos três grupos existentes no checkpoint.",
            "nextStep": "revisar inventário original", "autoMap": False}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit", type=Path, default=AUDIT)
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()
    data = json.loads(args.audit.read_text(encoding="utf-8"))
    records = []
    for candidate in data["candidates"]:
        if candidate.get("classification") != "FONTE/GLIFO NÃO MAPEADO":
            continue
        status = classify(candidate)
        records.append({
            "candidateId": candidate["id"], "page": candidate.get("page"), "font": candidate.get("font"),
            "shapeGroup": candidate.get("shapeGroup"), "codepointText": (candidate.get("text") or "").encode("unicode_escape").decode("ascii"),
            "bbox": candidate.get("bbox"), "tier": status["tier"], "risk": status["risk"],
            "workingClass": status["workingClass"], "context": nearby_text(candidate),
            "reason": status["reason"], "nextStep": status["nextStep"], "autoMap": status["autoMap"],
        })
    records.sort(key=lambda r: (r["tier"], r["page"], r["candidateId"]))
    args.output.mkdir(parents=True, exist_ok=True)
    summary = {}
    for record in records:
        key = record["shapeGroup"] or record["font"] or "unknown"
        entry = summary.setdefault(key, {"count": 0, "page": record["page"], "font": record["font"],
                                         "tier": record["tier"], "risk": record["risk"],
                                         "workingClass": record["workingClass"], "reason": record["reason"],
                                         "nextStep": record["nextStep"], "autoMap": False, "examples": []})
        entry["count"] += 1
        if len(entry["examples"]) < 3:
            entry["examples"].append({"candidateId": record["candidateId"], "context": record["context"],
                                      "codepointText": record["codepointText"]})
    (args.output / "triage.json").write_text(json.dumps({"source": str(args.audit), "sourceWasRescanned": False,
        "candidateCount": len(records), "groupCount": len(summary), "groups": summary, "candidates": records},
        ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    with (args.output / "triage.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=["candidateId", "page", "font", "shapeGroup", "codepointText", "bbox",
            "tier", "risk", "workingClass", "context", "reason", "nextStep", "autoMap"])
        writer.writeheader()
        for record in records:
            writer.writerow({**record, "bbox": json.dumps(record["bbox"]), "autoMap": "false"})
    print(json.dumps({"candidateCount": len(records), "groupCount": len(summary), "output": str(args.output)}, ensure_ascii=True))


if __name__ == "__main__":
    main()
