#!/usr/bin/env python3
"""Copy the saved p.13 New Story Flag translation into its editorial units.

The legacy page_13_block_5__pt-BR record is read-only in this migration and
remains in Payload as the compatibility fallback. The single trailing newline
after its label is the reviewed unit separator; all rich runs and both semantic
symbols are carried into their corresponding child records.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API_URL = os.environ.get("MIDDARA_PAYLOAD_API_URL", "http://localhost:3000").rstrip("/")
LANGUAGE = "pt-BR"
SOURCE_KEY = "page_13_block_5__pt-BR"
LABEL_KEY = "page_13_unit_p13-new-story-flag-label__pt-BR"
BODY_KEY = "page_13_unit_p13-new-story-flag-body__pt-BR"


def request_json(method: str, path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = Request(
        f"{API_URL}/api/{path.lstrip('/')}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def find_record(span_key: str) -> list[dict]:
    query = urlencode({
        "where[and][0][spanKey][equals]": span_key,
        "where[and][1][language][equals]": LANGUAGE,
        "limit": "10",
    })
    return request_json("GET", f"translations?{query}").get("docs", [])


def split_saved_record(record: dict) -> tuple[dict, dict]:
    data = record.get("data") or {}
    segments = data.get("segments")
    if record.get("spanKey") != SOURCE_KEY or record.get("language") != LANGUAGE:
        raise ValueError("The source translation key/language does not match the reviewed p.13 record")
    if not isinstance(segments, list) or len(segments) != 7:
        raise ValueError("The saved New Story Flag translation no longer has the reviewed seven-run structure")
    if segments[0].get("symbolId") != "story.pencil":
        raise ValueError("The saved label no longer starts with the semantic pencil symbol")
    label_run = segments[1]
    if label_run.get("text") != "Novo Marcador de História:\n":
        raise ValueError("The reviewed newline after the label changed; refusing to guess a split")
    if [segment.get("symbolId") for segment in segments if segment.get("symbolId")] != [
        "story.pencil", "story.flag",
    ]:
        raise ValueError("The saved translation's semantic-symbol sequence changed")
    if not segments[2].get("text", "").startswith("Marque o Marcador de História "):
        raise ValueError("The saved explanation no longer begins with the reviewed text")
    if segments[-1].get("text") != " na Ficha de Aventura.":
        raise ValueError("The saved explanation no longer ends with the reviewed text")

    label_segments = [copy.deepcopy(segments[0]), copy.deepcopy(label_run)]
    label_segments[1]["text"] = label_segments[1]["text"][:-1]
    body_segments = copy.deepcopy(segments[2:])

    def child_data(child_segments: list[dict], owned_symbol: str) -> dict:
        child = {key: copy.deepcopy(value) for key, value in data.items() if key not in {"segments", "managedSourceSymbols"}}
        child["segments"] = child_segments
        child["managedSourceSymbols"] = [owned_symbol]
        return child

    label_data = child_data(label_segments, "story.pencil")
    body_data = child_data(body_segments, "story.flag")
    return label_data, body_data


def migrate(args: argparse.Namespace) -> dict:
    sources = find_record(SOURCE_KEY)
    if len(sources) != 1:
        raise ValueError(f"Expected exactly one saved source translation; found {len(sources)}")
    label_data, body_data = split_saved_record(sources[0])
    targets = [(LABEL_KEY, label_data), (BODY_KEY, body_data)]
    action_list = []
    for span_key, expected_data in targets:
        existing = find_record(span_key)
        if len(existing) > 1:
            raise ValueError(f"Multiple records already exist for {span_key}")
        if existing:
            if existing[0].get("data") != expected_data:
                raise ValueError(f"{span_key} already exists with different content; refusing to overwrite")
            action_list.append({"spanKey": span_key, "action": "already-copied"})
            continue
        action_list.append({"spanKey": span_key, "action": "create", "data": expected_data})

    if args.apply:
        for item in action_list:
            if item["action"] != "create":
                continue
            request_json("POST", "translations", {
                "spanKey": item["spanKey"],
                "language": LANGUAGE,
                "data": item["data"],
            })
        for span_key, expected_data in targets:
            saved = find_record(span_key)
            if len(saved) != 1 or saved[0].get("data") != expected_data:
                raise ValueError(f"Persisted child translation did not verify for {span_key}")
        if len(find_record(SOURCE_KEY)) != 1:
            raise ValueError("The legacy source translation disappeared during migration")

    return {
        "apply": args.apply,
        "legacyRecordId": sources[0].get("id"),
        "legacyKeyPreserved": SOURCE_KEY,
        "childRecords": action_list,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="create the two child translation records")
    args = parser.parse_args()
    try:
        result = migrate(args)
        for item in result["childRecords"]:
            data = item.pop("data", None)
            if data is not None:
                item["text"] = "".join(segment.get("text", "") for segment in data["segments"]
                                        if not segment.get("symbolId"))
                item["symbols"] = [segment["symbolId"] for segment in data["segments"]
                                    if segment.get("symbolId")]
        print(json.dumps(result, ensure_ascii=True, indent=2))
    except Exception as error:  # noqa: BLE001 - show an actionable migration refusal.
        raise SystemExit(f"Migration refused: {error}") from error


if __name__ == "__main__":
    main()
