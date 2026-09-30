# Payload database recovery checkpoint

## Why this investigation happened

The translation editor preserved drafts in the browser, but the Payload save request failed. The first recovery step was to isolate whether the API, the database connection, or the stored schema was responsible, without writing to either existing database.

## Findings

- `apps/admin/src/payload.config.ts` reads `DATABASE_URL` and passes it to the SQLite adapter.
- The local, untracked `apps/admin/.env` defines `DATABASE_URI=file:./middara.db`, not `DATABASE_URL`. The committed `.env.example` also uses `DATABASE_URL`, so the local setting and application config disagree.
- `apps/admin/middara.db` is tracked and contains the older `translations` schema (`unit_id`, `source_hash`, and `tracking`) plus two existing `pt-BR` translation records. Their identifiers use the old coordinate-based format.
- `apps/admin/apps-admin.db` is ignored by Git and has the current Payload schema (`span_key`, `language`, and `data`) plus seven English records. It does not contain the two older Portuguese records.
- The SQLite adapter has `push: true` and attempts development schema synchronization. Starting against a copy of the current-schema database worked. Starting against a copy of the old database reached a schema-push prompt and the API returned HTTP 500 in the non-interactive audit process.

## Isolated verification

Both databases were copied under the ignored `apps/admin/scratch/payload-db-audit/` directory before any server was started.

Against the copy of `apps-admin.db`, Payload returned HTTP 200 for a translations query. The same API flow used by the editor also completed successfully: create a temporary translation (201), find it by `spanKey` and language (200), update it (200), and delete it (200). The temporary record was deleted from the copy.

Against the copy of `middara.db`, the translations API returned HTTP 500 because the old schema requires an interactive development schema-push decision. The audit did not answer that prompt or apply it to the original.

SHA-256 hashes of both original database files were recorded before and after the checks and remained unchanged. No application code, local environment file, or original database was modified as part of this checkpoint.

## Safe next step

Do not point the app at the old database just by renaming `DATABASE_URI`: its schema is incompatible with the current collection, and that would not restore saves. Before selecting the active database, prepare a dry-run migration that maps the two old coordinate-based records to current `spanKey` values and converts their `translations_runs` data into the current `data` JSON shape. Compare the rendered source text and resulting keys before writing anything. Preserve a byte-for-byte backup and verify record counts and translations after any approved migration.

The current-schema database is proven to support Payload saves, so it is a viable target once the legacy records have a verified disposition. Until that migration or an explicit database choice is made, browser-local drafts remain the safe working path.
