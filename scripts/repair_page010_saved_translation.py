#!/usr/bin/env python3
"""Apply source-verified copy/style fixes to saved p. 10 PT-BR.

Dry-run is the default. --apply snapshots affected Payload records, makes only
the declared edits, and verifies exact read-back; it rolls the records back if
verification fails. All unrelated text and style metadata are preserved.
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
TARGETS = {
    "page_10_block_6__pt-BR",
    "page_10_block_9__pt-BR",
    "page_10_block_11__pt-BR",
    "page_10_block_12__pt-BR",
    "page_10_block_18__pt-BR",
}


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


def update_text(data: dict[str, Any], key: str, old: str, new: str) -> str:
    segments = data.get("segments", [])
    matching = [segment for segment in segments if old in segment.get("text", "")]
    if len(matching) == 1 and matching[0]["text"].count(old) == 1:
        matching[0]["text"] = matching[0]["text"].replace(old, new, 1)
        return "copyedit applied"
    already = [segment for segment in segments if new in segment.get("text", "")]
    if len(already) == 1 and len(matching) == 0:
        return "copyedit already applied"
    raise ValueError(f"Expected exactly one source text segment in {key}; no change made")


def split_cross_reference(data: dict[str, Any], key: str, reference: str) -> str:
    """Keep inserted comma/final punctuation regular and italicize only the page reference."""
    segments = data.get("segments", [])
    comma = ", "
    terminal = "."
    split_runs = [
        i for i in range(len(segments) - 2)
        if segments[i].get("text") == comma
        and segments[i + 1].get("text") == reference
        and segments[i + 2].get("text") == terminal
    ]
    if split_runs:
        if len(split_runs) != 1:
            raise ValueError(f"Ambiguous split reference runs in {key}")
        i = split_runs[0]
        if segments[i].get("style") != "normal" or segments[i + 1].get("style") != "italic" or segments[i + 2].get("style") != "normal":
            raise ValueError(f"Split reference styles do not match the source in {key}")
        return "reference runs already match source"

    whole = f", {reference}."
    matches = [i for i, segment in enumerate(segments) if segment.get("text") == whole]
    if len(matches) != 1:
        raise ValueError(f"Expected one unsplit {whole!r} reference in {key}")
    i = matches[0]
    base = segments[i]
    if base.get("weight") != 400 or base.get("style") not in {"normal", "italic"}:
        raise ValueError(f"Unexpected base style on {whole!r} in {key}")
    comma_run = copy.deepcopy(base)
    comma_run.update({"text": comma, "style": "normal"})
    italic_run = copy.deepcopy(base)
    italic_run.update({"text": reference, "style": "italic"})
    period_run = copy.deepcopy(base)
    period_run.update({"text": terminal, "style": "normal"})
    segments[i : i + 1] = [comma_run, italic_run, period_run]
    return "reference split to match source styles"


def propose_changes(records: dict[str, dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], list[dict[str, str]], list[str]]:
    missing = sorted(TARGETS - records.keys())
    if missing:
        raise ValueError(f"Missing expected saved p. 10 records: {missing}")

    original = {key: copy.deepcopy(data_of(records[key])) for key in TARGETS}
    updated = copy.deepcopy(original)
    actions: list[dict[str, str]] = []
    changed: set[str] = set()

    key = "page_10_block_11__pt-BR"
    result = update_text(
        updated[key], key,
        "A Ficha de Aventura é usada para registrar as informações necessárias para que os jogadores continuem a Aventura em outro momento. Recomenda-se atualizar a Ficha de Aventura fim da sessão de cada jogo.",
        "A Ficha de Aventura é usada para registrar as informações necessárias para que os jogadores continuem a Aventura em outro momento. Recomenda-se atualizar a Ficha de Aventura ao fim da sessão de cada jogo.",
    )
    actions.append({"spanKey": key, "result": result, "reason": "grammatical omission: add 'ao'"})
    if result == "copyedit applied":
        changed.add(key)

    key = "page_10_block_12__pt-BR"
    result = update_text(
        updated[key], key,
        'Há também uma Bolsa do Grupo, chamada no jogo de "reserva do grupo", para guardar Itens que não estejam equipados por nenhum Aventureiro.',
        'Há também uma Bolsa do Grupo, chamada no jogo de "Estoque do Grupo", para guardar Itens que não estejam equipados por nenhum Aventureiro.',
    )
    actions.append({"spanKey": key, "result": result, "reason": "use official glossary term for Party Stash"})
    if result == "copyedit applied":
        changed.add(key)

    key = "page_10_block_6__pt-BR"
    result = split_cross_reference(updated[key], key, "pág. 14")
    if result != "reference runs already match source":
        changed.add(key)
    actions.append({"spanKey": key, "result": result, "reason": "source PDF prints Pg. 14 in italic"})

    key = "page_10_block_9__pt-BR"
    spans = updated[key].get("segments", [])
    candidates = [i for i, segment in enumerate(spans) if "1 a 4" in segment.get("text", "")]
    if candidates == [0] and spans[0]["text"].count("1 a 4") == 1:
        old_span = spans[0]
        prefix, suffix = old_span["text"].split("1 a 4", 1)
        number = copy.deepcopy(old_span)
        number.update({"text": "1 a 4", "size": 9, "weight": 700, "style": "normal"})
        replacement = []
        if prefix:
            before = copy.deepcopy(old_span)
            before["text"] = prefix
            replacement.append(before)
        replacement.append(number)
        if suffix:
            after = copy.deepcopy(old_span)
            after["text"] = suffix
            replacement.append(after)
        spans[0:1] = replacement
        result = "bold 9 pt range restored"
        changed.add(key)
    elif len(candidates) == 1 and spans[candidates[0]].get("text") == "1 a 4":
        range_spans = [segment for segment in spans if segment.get("text") == "1 a 4"]
        if len(range_spans) != 1 or range_spans[0].get("size") != 9 or range_spans[0].get("weight") != 700:
            raise ValueError("Unexpected split range segment in block 9")
        result = "bold 9 pt range already present"
    else:
        raise ValueError("Could not safely locate the unique '1 a 4' range in block 9")
    actions.append({"spanKey": key, "result": result, "reason": "source PDF prints 1-4 in bold 9 pt"})

    key = "page_10_block_18__pt-BR"
    result = split_cross_reference(updated[key], key, "pág. 46")
    if result != "reference runs already match source":
        changed.add(key)
    actions.append({"spanKey": key, "result": result, "reason": "source PDF prints Pg. 46. in italic"})

    for key in TARGETS:
        delta = 2 if key in changed and key in {"page_10_block_6__pt-BR", "page_10_block_9__pt-BR", "page_10_block_18__pt-BR"} else 0
        expected_count = len(original[key].get("segments", [])) + delta
        if len(updated[key].get("segments", [])) != expected_count:
            raise AssertionError(f"Segment count changed in {key}")
    return updated, actions, sorted(changed)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="snapshot and apply the verified p. 10 edits")
    args = parser.parse_args()

    records = get_records()
    updated, actions, keys = propose_changes(records)
    print(json.dumps({"apply": args.apply, "actions": actions}, ensure_ascii=False, indent=2))
    if not keys:
        print("All p. 10 translation targets are already corrected; no records changed.")
        return
    if not args.apply:
        print("Dry-run only: no Payload data changed.")
        return

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = BACKUP_DIR / f"page-010-pt-BR-before-copyedit-{stamp}.json"
    snapshot = {key: records[key] for key in keys}
    backup.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Backup: {backup.relative_to(ROOT)}")

    applied: list[str] = []
    try:
        for key in keys:
            api_json(f"{API}/{records[key]['id']}", "PATCH", {"data": updated[key]})
            applied.append(key)
        refreshed = get_records()
        for key in keys:
            if data_of(refreshed[key]) != updated[key]:
                raise AssertionError(f"Payload read-back differs for {key}")
    except Exception:
        refreshed = get_records()
        for key in applied:
            api_json(f"{API}/{refreshed[key]['id']}", "PATCH", {"data": original[key]})
        raise
    print(f"Applied and read-verified {len(keys)} records; backup: {backup.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, RuntimeError, ValueError, AssertionError) as exc:
        raise SystemExit(f"Page 10 saved translation repair failed: {exc}")
