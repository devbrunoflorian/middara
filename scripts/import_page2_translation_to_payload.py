#!/usr/bin/env python3
"""Restore the authored page-2 PT-BR story blocks into the active Payload DB.

The source is the older project's curated page_002_translated.md. Existing
Payload records are never overwritten unless --force is supplied; page-2
credit records are outside the import map.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "Rulebook 1.2" / "_page_extraction" / "page_002" / "page_002_translated.md"
DOM = ROOT / "apps" / "web" / "public" / "pages" / "page_002" / "page_002_dom.json"
API = "http://127.0.0.1:3000/api/translations"

# The current extractor combines these authored Markdown blocks into the
# following visual blocks. The source PDF still supplies the block styles.
BLOCK_MAP = {
    0: [1],
    1: [2, 3, 4, 5],
    2: [6, 7, 8],
    3: [9, 10],
    4: [11, 12],
    5: [13, 14, 15],
    6: [16],
}


def parse_markdown(path: Path) -> dict[int, str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    result: dict[int, str] = {}
    current: int | None = None
    collecting = False
    collected: list[str] = []
    for line in lines:
        block_match = re.match(r"<!-- BLOCK (\d+):", line)
        if block_match:
            current = int(block_match.group(1))
            collecting = False
            collected = []
            continue
        if current is None:
            continue
        if line.startswith("**[PT-BR]:**"):
            collecting = True
            continue
        if collecting and line.strip() == "---":
            result[current] = " ".join(part.strip() for part in collected if part.strip())
            collecting = False
            continue
        if collecting:
            collected.append(line)
    if collecting and current is not None:
        result[current] = " ".join(part.strip() for part in collected if part.strip())
    return result


def source_segment(block: dict) -> dict:
    span = next(
        span
        for line in block.get("lines", [])
        for span in line.get("spans", [])
        if str(span.get("text", "")).strip()
    )
    font = str(span.get("font") or "OptimaLTStd")
    flags = int(span.get("flags", 0) or 0)
    return {
        "font": font,
        "size": float(span.get("size") or 10),
        "color": span.get("color") or "#231f20",
        "weight": 700 if flags & 16 else 400,
        "style": "italic" if "Italic" in font or flags & 2 else "normal",
        "disableLigatures": True,
    }


def api_json(url: str, method: str = "GET", payload: dict | None = None) -> dict:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=body, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {url} -> HTTP {exc.code}: {detail}") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write missing page-2 story records")
    parser.add_argument("--force", action="store_true", help="replace existing mapped records")
    args = parser.parse_args()

    translated = parse_markdown(SOURCE)
    page = json.loads(DOM.read_text(encoding="utf-8"))
    targets: list[dict] = []
    for current_index, source_blocks in BLOCK_MAP.items():
        missing = [block for block in source_blocks if block not in translated]
        if missing:
            raise SystemExit(f"Missing PT-BR Markdown blocks: {missing}")
        block = page["blocks"][current_index]
        text = " ".join(translated[source_block] for source_block in source_blocks)
        segment = source_segment(block)
        segment["text"] = text
        targets.append({
            "spanKey": f"page_2_block_{current_index}__pt-BR",
            "language": "pt-BR",
            "data": {"schemaVersion": 2, "segments": [segment], "textAlign": "center"},
            "sourceBlocks": source_blocks,
            "chars": len(text),
        })

    existing = api_json(API + "?" + urlencode({"where[language][equals]": "pt-BR", "limit": "5000"}))
    existing_by_key = {doc["spanKey"]: doc for doc in existing.get("docs", [])}
    actions = []
    for target in targets:
        doc = existing_by_key.get(target["spanKey"])
        if doc and not args.force:
            actions.append({**target, "action": "skip-existing", "id": doc["id"]})
            continue
        if args.apply:
            if doc:
                api_json(f"{API}/{doc['id']}", "PATCH", {"language": "pt-BR", "data": target["data"]})
                action = "patched"
            else:
                created = api_json(API, "POST", {
                    "spanKey": target["spanKey"],
                    "language": target["language"],
                    "data": target["data"],
                })
                target = {**target, "id": created.get("doc", created).get("id")}
                action = "created"
        else:
            action = "would-create" if not doc else "would-patch"
        actions.append({**target, "action": action})
    print(json.dumps({
        "source": str(SOURCE),
        "apply": args.apply,
        "force": args.force,
        "targets": actions,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, RuntimeError) as exc:
        raise SystemExit(f"Payload request failed: {exc}")
