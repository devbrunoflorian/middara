#!/usr/bin/env python3
"""Align only saved p. 9 PT-BR style metadata to the official PDF.

Dry-run is the default. --apply first snapshots affected Payload records, then
PATCHes their rich-text styles and verifies that every text character is
unchanged. The script never translates or edits wording.
"""

from __future__ import annotations

import argparse
import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:3000/api/translations"
BACKUP_DIR = ROOT / "tmp" / "translation-style-backups"


def api_json(url: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=body, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {url} -> HTTP {exc.code}: {detail}") from exc


def get_records() -> dict[str, dict[str, Any]]:
    query = urlencode({"where[language][equals]": "pt-BR", "limit": "5000"})
    response = api_json(f"{API}?{query}")
    return {doc["spanKey"]: doc for doc in response.get("docs", [])}


def data_of(doc: dict[str, Any]) -> dict[str, Any]:
    value = doc["data"]
    return json.loads(value) if isinstance(value, str) else value


def text_of(data: dict[str, Any]) -> str:
    return "".join(segment.get("text", "") for segment in data.get("segments", []))


def require_segments(data: dict[str, Any], key: str, expected: list[str]) -> list[dict[str, Any]]:
    segments = data.get("segments", [])
    actual = [part.get("text", "") for part in segments]
    if actual != expected:
        raise ValueError(f"Unexpected segment boundaries for {key}: {actual!r}")
    return segments


def edit_records(
    records: dict[str, dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]], list[str]]:
    targets = {
        "page_9_block_0__pt-BR",
        "page_9_block_3__pt-BR",
        "page_9_block_10__pt-BR",
        "page_9_block_11__pt-BR",
        "page_9_block_12__pt-BR",
        "page_9_block_13__pt-BR",
    }
    missing = sorted(targets - records.keys())
    if missing:
        raise ValueError(f"Missing expected saved p. 9 records: {missing}")

    original = {key: copy.deepcopy(data_of(records[key])) for key in targets}
    updated = copy.deepcopy(original)
    actions: list[dict[str, Any]] = []
    changed: list[str] = []

    # The scenario name is bold italic in the source PDF.
    key = "page_9_block_0__pt-BR"
    spans = updated[key]["segments"]
    named = [s for s in spans if s.get("text") == "Unintentional Malum: Act 1"]
    if len(named) != 1 or named[0].get("weight") != 700 or named[0].get("style") not in {"normal", "italic"}:
        raise ValueError("Expected one bold scenario-name segment in block 0")
    if named[0].get("style") == "normal":
        named[0]["style"] = "italic"
        changed.append(key)
        result = "italic applied"
    else:
        result = "already italic"
    actions.append({"spanKey": key, "result": result})

    # The source prints these XP runs at 9 pt inside 10 pt prose.
    key = "page_9_block_3__pt-BR"
    xp = [s for s in updated[key]["segments"] if s.get("text") == "XP"]
    if len(xp) != 2 or any(s.get("weight") != 700 or s.get("size") not in {9, 10} for s in xp):
        raise ValueError("Expected exactly two bold 9/10 pt XP spans in block 3")
    if any(s["size"] == 10 for s in xp):
        for span in xp:
            span["size"] = 9
        changed.append(key)
        result = "both XP spans set to 9 pt"
    else:
        result = "both XP spans already 9 pt"
    actions.append({"spanKey": key, "result": result})

    # Reward bullets keep their fixed bullet glyph outside the editable text.
    # Each label is 9 pt, the prose/reference is 10 pt, and inline XP is 9 pt.
    key = "page_9_block_10__pt-BR"
    spans = require_segments(
        updated[key], key,
        ["RESTAURAR AVENTUREIROS:", " Cada Aventureiro é Restaurado.\nVeja ",
         "Restaurando Aventureiros", ", pág. 18."],
    )
    if spans[0].get("size") != 9 or any(s.get("size") not in {9, 10} for s in spans[1:]):
        raise ValueError("Unexpected label/body sizes in block 10")
    if any(s["size"] == 9 for s in spans[1:]):
        for span in spans[1:]:
            span["size"] = 10
        changed.append(key)
        result = "body/reference set to 10 pt"
    else:
        result = "body/reference already 10 pt"
    actions.append({"spanKey": key, "result": result})

    key = "page_9_block_11__pt-BR"
    spans = updated[key].get("segments", [])
    old_segments = ["GANHAR XP", ": Cada Aventureiro Ganha o ", "XP", " da recompensa."]
    split_segments = ["GANHAR XP", ":", " Cada Aventureiro Ganha o ", "XP", " da recompensa."]
    texts = [s.get("text", "") for s in spans]
    if texts not in (old_segments, split_segments):
        raise ValueError(f"Unexpected segment boundaries for {key}: {texts!r}")
    xp_index = 2 if texts == old_segments else 3
    if spans[0].get("size") != 9 or spans[xp_index].get("size") not in {9, 10}:
        raise ValueError("Expected block 11 label and inline XP at 9 pt")
    if texts == old_segments:
        colon_body = spans[1]
        if colon_body.get("size") != 9 or not colon_body["text"].startswith(": ") or spans[3].get("size") != 9:
            raise ValueError("Unexpected pre-repair sizes in block 11")
        colon = copy.deepcopy(colon_body)
        colon["text"] = ":"
        colon["size"] = 10
        colon_body["text"] = colon_body["text"][1:]
        colon_body["size"] = 10
        spans[1:2] = [colon, colon_body]
        texts = [s.get("text", "") for s in spans]
    desired_sizes = [9, 10, 10, 9, 10]
    if texts == split_segments:
        if any(s.get("size") not in {9, 10} for s in spans):
            raise ValueError("Unexpected post-split size in block 11")
        if [s.get("size") for s in spans] != desired_sizes:
            for span, size in zip(spans, desired_sizes, strict=True):
                span["size"] = size
            if key not in changed:
                changed.append(key)
            result = "split and aligned to 9/10 pt source sizes"
        else:
            result = "colon/body already match 10 pt"
    else:
        raise ValueError("Block 11 did not reach the expected separated colon state")
    actions.append({"spanKey": key, "result": result})

    key = "page_9_block_12__pt-BR"
    spans = updated[key].get("segments", [])
    old_segments = [
        "COMPRAR E TREINAR:", " Os Aventureiros podem gastar quanto Ouro quiserem em Itens e quanto ",
        "XP", " quiserem em Disciplinas. Os Itens disponíveis na Loja estarão listados na Preparação do Cenário que estiver sendo jogado.\nVeja ",
        "Comprar e Treinar", ", na seção ", "Rodadas de História", ", pág. 13.",
    ]
    compact_segments = [
        "COMPRAR E TREINAR:", " Os Aventureiros podem gastar qualquer quantidade de Ouro em Itens e de ",
        "XP", " em Disciplinas. Os Itens disponíveis na Loja constam na Preparação do Cenário em jogo.\nVeja ",
        "Comprar e Treinar", ", na seção ", "Rodadas de História", ", pág. 13.",
    ]
    texts = [s.get("text", "") for s in spans]
    if texts not in (old_segments, compact_segments):
        raise ValueError(f"Unexpected segment boundaries for {key}: {texts!r}")
    if spans[0].get("size") != 9 or spans[2].get("size") != 9:
        raise ValueError("Expected block 12 label and inline XP to remain 9 pt")
    if any(spans[index].get("size") != 10 for index in (1, 3, 4, 5, 6, 7)):
        for index in (1, 3, 4, 5, 6, 7):
            spans[index]["size"] = 10
        changed.append(key)
        result = "prose/reference/title set to 10 pt"
    else:
        result = "prose/reference/title already 10 pt"
    actions.append({"spanKey": key, "result": result})

    key = "page_9_block_13__pt-BR"
    spans = require_segments(
        updated[key], key,
        ["CONTINUAR:", " Os jogadores seguem para o próximo Encontro ou Cena do Cenário, conforme indicado."],
    )
    if spans[0].get("size") != 9 or spans[1].get("size") not in {9, 10}:
        raise ValueError("Unexpected label/body sizes in block 13")
    if spans[1].get("size") == 9:
        spans[1]["size"] = 10
        changed.append(key)
        result = "body set to 10 pt"
    else:
        result = "body already 10 pt"
    actions.append({"spanKey": key, "result": result})

    for record_key in sorted(targets):
        if text_of(original[record_key]) != text_of(updated[record_key]):
            raise AssertionError(f"Proposed change altered text in {record_key}")
    return updated, actions, sorted(set(changed))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="snapshot and write style-only corrections")
    args = parser.parse_args()

    records = get_records()
    updated, actions, keys = edit_records(records)
    print(json.dumps({"apply": args.apply, "actions": actions}, ensure_ascii=False, indent=2))
    if not keys:
        print("All p. 9 PT-BR target styles already match; no records changed.")
        return
    if not args.apply:
        print("Dry-run only: no Payload data changed.")
        return

    snapshot = {key: records[key] for key in keys}
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = BACKUP_DIR / f"page-009-pt-BR-before-style-repair-{stamp}.json"
    backup_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Backup: {backup_path.relative_to(ROOT)}")

    applied: list[str] = []
    try:
        for key in keys:
            doc = records[key]
            api_json(f"{API}/{doc['id']}", "PATCH", {"data": updated[key]})
            applied.append(key)
        refreshed = get_records()
        for key in keys:
            actual = data_of(refreshed[key])
            if text_of(actual) != text_of(original_data(snapshot[key])):
                raise AssertionError(f"Saved wording changed for {key}")
            if actual != updated[key]:
                raise AssertionError(f"Saved style differs from requested patch for {key}")
    except Exception:
        for key in reversed(applied):
            doc = records[key]
            api_json(f"{API}/{doc['id']}", "PATCH", {"data": data_of(doc)})
        raise
    print(f"Applied and read-verified {len(keys)} changed records; each record's text was unchanged by the style operation.")


def original_data(doc: dict[str, Any]) -> dict[str, Any]:
    value = doc["data"]
    return json.loads(value) if isinstance(value, str) else value


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, RuntimeError, ValueError, AssertionError) as exc:
        raise SystemExit(f"Page 9 PT-BR typography repair failed: {exc}")
