#!/usr/bin/env python3
"""Search local SQLite/text sources for a previously saved translation."""

from __future__ import annotations

import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TERMS = ("árvore", "sombras", "caverna", "cristal", "mulher")


def main() -> None:
    for db in (ROOT / "apps" / "admin" / "apps-admin.db", ROOT / "apps" / "admin" / "middara.db"):
        print(f"\nDB {db.relative_to(ROOT)}")
        connection = sqlite3.connect(db)
        connection.row_factory = sqlite3.Row
        tables = [row[0] for row in connection.execute(
            "select name from sqlite_master where type='table' order by name"
        )]
        for table in tables:
            columns = [row[1] for row in connection.execute(f"pragma table_info([{table}])")]
            if not any(column in columns for column in ("data", "text", "content", "tracking", "source_text")):
                continue
            try:
                rows = connection.execute(f"select * from [{table}] limit 500").fetchall()
            except sqlite3.Error:
                continue
            for row in rows:
                values = " | ".join(str(row[column]) for column in columns if row[column] is not None)
                if any(term in values.casefold() for term in TERMS):
                    safe_values = values[:3000].encode("ascii", "backslashreplace").decode("ascii")
                    print(f"HIT {table}: {safe_values}")
        connection.close()


if __name__ == "__main__":
    main()
