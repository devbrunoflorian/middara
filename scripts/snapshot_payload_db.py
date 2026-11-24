#!/usr/bin/env python3
"""Create a sanitized, versionable snapshot of the local Payload SQLite DB."""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "apps" / "admin" / "apps-admin.db"
DEFAULT_TARGET = ROOT / "apps" / "admin" / "apps-admin-snapshot.sqlite"
PRIVATE_TABLES = (
    "pdf_export_jobs",
    "payload_preferences",
    "payload_preferences_rels",
    "payload_locked_documents",
    "payload_locked_documents_rels",
    "users",
    "users_sessions",
)
DROP_TABLES = ("layout_frames_backup_x2_total_20261025",)
PUBLISHABLE_COLLECTIONS = (
    "translations",
    "translation_reviews",
    "translation_review_requests",
    "translation_glossary_decisions",
    "layout_frames",
    "symbol_alias_settings",
    "editorial_faqs",
)
LOCAL_PATH = re.compile(
    r"(?:[A-Z]:[\\/]Users[\\/]|engineering-labs|/home/[^/\s]+|/Users/[^/\s]+|Local[\\/]Temp)",
    re.IGNORECASE,
)


def table_names(db: sqlite3.Connection) -> set[str]:
    return {
        row[0]
        for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }


def row_count(db: sqlite3.Connection, table: str) -> int:
    return int(db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_TARGET)
    parser.add_argument("--force", action="store_true", help="replace an existing snapshot")
    args = parser.parse_args()

    source = args.source.resolve()
    target = args.output.resolve()
    temporary = target.with_name(target.name + ".tmp")
    if not source.is_file():
        parser.error(f"SQLite local não encontrado: {source}")
    if source == target:
        parser.error("o destino não pode sobrescrever o banco local ativo")
    if target.exists() and not args.force:
        parser.error(f"snapshot já existe; use --force para substituí-lo: {target}")
    if temporary.exists():
        parser.error(f"arquivo temporário já existe; revise antes de remover: {temporary}")

    original = sqlite3.connect(source)
    original.execute("PRAGMA query_only = ON")
    source_tables = table_names(original)
    if "media" in source_tables and row_count(original, "media"):
        parser.error("a coleção Media tem arquivos fora do SQLite; snapshot cancelado")

    durable_counts = {
        name: row_count(original, name)
        for name in source_tables
        if name not in PRIVATE_TABLES and name not in DROP_TABLES
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    snapshot = sqlite3.connect(temporary)
    try:
        original.backup(snapshot)
        snapshot.execute("PRAGMA foreign_keys = OFF")
        snapshot_tables = table_names(snapshot)
        for name in PRIVATE_TABLES:
            if name in snapshot_tables:
                snapshot.execute(f'DELETE FROM "{name}"')
        for name in DROP_TABLES:
            if name in snapshot_tables:
                snapshot.execute(f'DROP TABLE "{name}"')
        snapshot.commit()
        snapshot.execute("VACUUM")

        integrity = snapshot.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"SQLite integrity_check falhou: {integrity}")
        if snapshot.execute("PRAGMA foreign_key_check").fetchone():
            raise RuntimeError("snapshot contém relações SQLite inválidas")

        final_tables = table_names(snapshot)
        for name, expected in durable_counts.items():
            if name not in final_tables or row_count(snapshot, name) != expected:
                raise RuntimeError(f"contagem divergiu na tabela preservada: {name}")

        remaining_paths = []
        for name in final_tables:
            columns = snapshot.execute(f'PRAGMA table_info("{name}")').fetchall()
            for column in columns:
                if "CHAR" not in str(column[2]).upper() and "TEXT" not in str(column[2]).upper():
                    continue
                field = column[1]
                query = f'SELECT "{field}" FROM "{name}" WHERE "{field}" IS NOT NULL'
                if any(LOCAL_PATH.search(str(row[0])) for row in snapshot.execute(query)):
                    remaining_paths.append(f"{name}.{field}")
        if remaining_paths:
            raise RuntimeError("caminho local encontrado em: " + ", ".join(remaining_paths))
    except Exception:
        snapshot.close()
        original.close()
        temporary.unlink(missing_ok=True)
        raise
    else:
        snapshot.close()
        original.close()

    os.replace(temporary, target)
    output = sqlite3.connect(f"file:{target.as_posix()}?mode=ro", uri=True)
    try:
        counts = {
            name: row_count(output, name)
            for name in PUBLISHABLE_COLLECTIONS
            if name in table_names(output)
        }
        print(f"Snapshot: {target}")
        print(f"Tamanho: {target.stat().st_size:,} bytes")
        print(f"Coleções preservadas: {counts}")
        print("Dados locais removidos: exportações, preferências, locks, contas e sessões")
    finally:
        output.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Erro ao criar snapshot: {error}", file=sys.stderr)
        raise SystemExit(1)
