#!/usr/bin/env python3
"""Snapshot local Payload SQLite state without changing either database."""

from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DB_ROOT = ROOT / "apps" / "admin"
OUT = ROOT / "tmp" / "payload-recovery-2026-10-03"


def rows(connection: sqlite3.Connection, query: str) -> list[dict[str, Any]]:
    connection.row_factory = sqlite3.Row
    return [dict(row) for row in connection.execute(query).fetchall()]


def table_names(connection: sqlite3.Connection) -> list[str]:
    return [row[0] for row in connection.execute(
        "select name from sqlite_master where type='table' order by name"
    ).fetchall()]


def snapshot_database(name: str) -> dict[str, Any]:
    source = DB_ROOT / name
    destination = OUT / name
    shutil.copy2(source, destination)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    connection = sqlite3.connect(source)
    tables = table_names(connection)
    counts: dict[str, int] = {}
    for table in ("translations", "translations_runs"):
        if table in tables:
            counts[table] = int(connection.execute(f"select count(*) from {table}").fetchone()[0])
    result: dict[str, Any] = {
        "path": str(source.relative_to(ROOT)),
        "backup": str(destination.relative_to(ROOT)),
        "sha256": digest,
        "bytes": source.stat().st_size,
        "tables": tables,
        "counts": counts,
    }
    if "translations" in tables:
        result["translations"] = rows(connection, "select * from translations order by rowid")
    if "translations_runs" in tables:
        result["translations_runs"] = rows(connection, "select * from translations_runs order by rowid")
    connection.close()
    return result


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    snapshots = [snapshot_database(name) for name in ("apps-admin.db", "middara.db")]
    manifest = {
        "createdAtUtc": datetime.now(timezone.utc).isoformat(),
        "writeMode": "read-only snapshot; source databases were not modified",
        "databases": snapshots,
        "recoveryNote": (
            "The active apps-admin.db is the current Payload schema. middara.db is a legacy schema; "
            "its old translation runs are preserved here for review and were not migrated automatically."
        ),
    }
    (OUT / "payload-state.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUT / "SHA256SUMS.txt").write_text(
        "\n".join(f"{item['sha256']}  {item['backup']}" for item in snapshots) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "output": str(OUT.resolve()),
        "createdAtUtc": manifest["createdAtUtc"],
        "databases": [
            {"path": item["path"], "backup": item["backup"], "sha256": item["sha256"], "counts": item["counts"]}
            for item in snapshots
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
