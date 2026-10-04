#!/usr/bin/env python3
"""Copyfit the p. 9 SHOP AND TRAIN PT-BR body without changing meaning.

Dry-run is the default. --apply snapshots the record before writing, preserves
all rich-style fields and references, and verifies the exact proposed text.
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
KEY = "page_9_block_12__pt-BR"
BACKUP_DIR = ROOT / "tmp" / "translation-style-backups"
OLD = [
    "COMPRAR E TREINAR:",
    " Os Aventureiros podem gastar quanto Ouro quiserem em Itens e quanto ",
    "XP",
    " quiserem em Disciplinas. Os Itens disponíveis na Loja estarão listados na Preparação do Cenário que estiver sendo jogado.\nVeja ",
    "Comprar e Treinar",
    ", na seção ",
    "Rodadas de História",
    ", pág. 13.",
]
NEW = [
    "COMPRAR E TREINAR:",
    " Os Aventureiros podem gastar qualquer quantidade de Ouro em Itens e de ",
    "XP",
    " em Disciplinas. Os Itens disponíveis na Loja constam na Preparação do Cenário em jogo.\nVeja ",
    "Comprar e Treinar",
    ", na seção ",
    "Rodadas de História",
    ", pág. 13.",
]


def api_json(url: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=body, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {url} -> HTTP {exc.code}: {detail}") from exc


def get_record() -> dict[str, Any]:
    query = urlencode({"where[spanKey][equals]": KEY, "limit": "1"})
    result = api_json(f"{API}?{query}")
    docs = result.get("docs", [])
    if len(docs) != 1:
        raise ValueError(f"Expected exactly one record for {KEY}; got {len(docs)}")
    return docs[0]


def get_data(doc: dict[str, Any]) -> dict[str, Any]:
    value = doc["data"]
    return json.loads(value) if isinstance(value, str) else value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="snapshot and apply copyfit wording")
    args = parser.parse_args()

    record = get_record()
    original = copy.deepcopy(get_data(record))
    current_segments = original.get("segments", [])
    current = [part.get("text", "") for part in current_segments]
    if current == NEW:
        print(json.dumps({"apply": args.apply, "spanKey": KEY, "status": "already-copyfit"}, ensure_ascii=False))
        return
    if current != OLD or len(current_segments) != len(NEW):
        raise ValueError("Saved wording or segment structure differs from the reviewed source; no write attempted")
    if current_segments[0].get("size") != 9 or current_segments[1].get("size") != 10:
        raise ValueError("Expected 9 pt label and 10 pt body after the typography repair")
    if current_segments[2].get("size") != 9 or current_segments[2].get("weight") != 700:
        raise ValueError("Expected inline XP to remain bold 9 pt")

    updated = copy.deepcopy(original)
    for segment, text in zip(updated["segments"], NEW, strict=True):
        segment["text"] = text
    if "".join(part["text"] for part in updated["segments"]) != "".join(NEW):
        raise AssertionError("Copyfit text assembly mismatch")

    print(json.dumps({"apply": args.apply, "spanKey": KEY, "oldChars": sum(map(len, OLD)), "newChars": sum(map(len, NEW)), "text": "".join(NEW)}, ensure_ascii=False, indent=2))
    if not args.apply:
        print("Dry-run only: Payload wording is unchanged.")
        return

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = BACKUP_DIR / f"page-009-shop-and-train-before-copyfit-{stamp}.json"
    backup.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    api_json(f"{API}/{record['id']}", "PATCH", {"data": updated})
    try:
        saved = get_data(get_record())
        if saved != updated:
            raise AssertionError("Read-back differs from the requested copyfit")
    except Exception:
        api_json(f"{API}/{record['id']}", "PATCH", {"data": original})
        raise
    print(f"Applied and read-verified; backup: {backup.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, RuntimeError, ValueError, AssertionError) as exc:
        raise SystemExit(f"Page 9 SHOP AND TRAIN copyfit failed: {exc}")
