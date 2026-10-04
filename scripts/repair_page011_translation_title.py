#!/usr/bin/env python3
"""Improve the saved Portuguese continuation heading on PDF page 11.

Dry-run is the default. --apply snapshots one guarded Payload record, changes
only the 11 pt continuation run, and verifies an exact read-back. The source
heading remains a large title followed by a smaller continuation label.
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
KEY = "page_11_block_12__pt-BR"
OLD_TEXT = " Continuação"
NEW_TEXT = " — Continuação"


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
    query = urlencode({"where[language][equals]": "pt-BR", "limit": "5000"})
    response = api_json(f"{API}?{query}")
    matches = [doc for doc in response.get("docs", []) if doc.get("spanKey") == KEY]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one saved record for {KEY}; found {len(matches)}")
    return matches[0]


def data_of(doc: dict[str, Any]) -> dict[str, Any]:
    value = doc["data"]
    return json.loads(value) if isinstance(value, str) else value


def propose(data: dict[str, Any]) -> tuple[dict[str, Any], str]:
    original = copy.deepcopy(data)
    segments = data.get("segments", [])
    matches = [i for i, segment in enumerate(segments) if segment.get("text") in {OLD_TEXT, NEW_TEXT}]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one continuation segment in {KEY}; found {len(matches)}")
    index = matches[0]
    segment = segments[index]
    expected_style = ("Cinzel-Regular", 11, 700, "normal")
    actual_style = (segment.get("font"), segment.get("size"), segment.get("weight"), segment.get("style"))
    if actual_style != expected_style:
        raise ValueError(f"Unexpected continuation styling in {KEY}: {actual_style!r}")
    if segment["text"] == NEW_TEXT:
        return original, "already corrected"
    updated = copy.deepcopy(original)
    updated["segments"][index]["text"] = NEW_TEXT
    return updated, "replace bare adjacency with Portuguese continuation punctuation"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="snapshot and apply the verified heading edit")
    args = parser.parse_args()

    record = get_record()
    original = data_of(record)
    updated, action = propose(original)
    changed = updated != original
    print(json.dumps({"apply": args.apply, "spanKey": KEY, "action": action, "changed": changed}, ensure_ascii=False, indent=2))
    if not changed:
        print("The p. 11 continuation title is already corrected; no records changed.")
        return
    if not args.apply:
        print("Dry-run only: no Payload data changed.")
        return

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = BACKUP_DIR / f"page-011-pt-BR-before-title-copyedit-{stamp}.json"
    backup.write_text(json.dumps({KEY: record}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Backup: {backup.relative_to(ROOT)}")

    applied = False
    try:
        api_json(f"{API}/{record['id']}", "PATCH", {"data": updated})
        applied = True
        refreshed = get_record()
        if data_of(refreshed) != updated:
            raise AssertionError(f"Payload read-back differs for {KEY}")
    except Exception:
        if applied:
            refreshed = get_record()
            api_json(f"{API}/{refreshed['id']}", "PATCH", {"data": original})
        raise
    print(f"Applied and read-verified {KEY}; backup: {backup.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, RuntimeError, ValueError, AssertionError) as exc:
        raise SystemExit(f"Page 11 saved translation repair failed: {exc}")
