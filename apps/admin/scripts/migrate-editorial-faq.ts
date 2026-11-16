import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { sql } from '@payloadcms/db-sqlite'

const adminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(adminDir, '.env') })

if (!process.argv.includes('--confirm-local')) throw new Error('Pass --confirm-local to apply the additive local FAQ schema migration.')
if (!process.env.DATABASE_URL?.startsWith('file:') || process.env.DATABASE_URL.includes(':memory:')) {
  throw new Error('This focused migration runner accepts only a file-backed SQLite DATABASE_URL.')
}

// Skip Payload's generic development schema push. This migration is deliberately limited to FAQ tables.
process.env.PAYLOAD_MIGRATING = 'true'

const migrationName = '20261026_130000_add_editorial_faqs'
const faqTables = [
  'editorial_faqs',
  'editorial_faqs_source_pages',
  'editorial_faqs_source_unit_ids',
  'editorial_faqs_keywords',
  'editorial_faqs_synonyms',
  '_editorial_faqs_v',
  '_editorial_faqs_v_version_source_pages',
  '_editorial_faqs_v_version_source_unit_ids',
  '_editorial_faqs_v_version_keywords',
  '_editorial_faqs_v_version_synonyms',
]

const { default: config } = await import('../src/payload.config')
const { getPayload } = await import('payload')
const migration = await import('../src/migrations/20261026_130000_add_editorial_faqs')
const payload = await getPayload({ config })
let failure: unknown

try {
  const db = (payload.db as unknown as { drizzle: { run: (query: ReturnType<typeof sql>) => Promise<{ rows: Array<Record<string, unknown>> }> } }).drizzle
  const tableNames = async () => {
    const result = await db.run(sql`SELECT name FROM sqlite_master WHERE type = 'table'`)
    return new Set(result.rows.map(row => String(row.name)))
  }
  const beforeTables = await tableNames()
  const existingMigration = await payload.find({
    collection: 'payload-migrations',
    limit: 1,
    overrideAccess: true,
    where: { name: { equals: migrationName } },
  })

  if (existingMigration.totalDocs > 0) {
    if (!faqTables.every(name => beforeTables.has(name))) throw new Error('Migration history exists but one or more FAQ tables are missing; refusing to repair blindly.')
    console.log(`${migrationName} is already applied.`)
  } else {
    if (faqTables.some(name => beforeTables.has(name))) throw new Error('FAQ schema is partially present without migration history; refusing to overwrite or drop anything.')
    const lockedRelationsHadFaqColumn = (await db.run(sql`PRAGMA table_info(payload_locked_documents_rels)`)).rows
      .some(row => row.name === 'editorial_faqs_id')
    if (lockedRelationsHadFaqColumn) throw new Error('FAQ lock relation column exists without migration history; refusing to alter it.')

    const layoutBackupRows = beforeTables.has('layout_frames_backup_x2_total_20261025')
      ? Number((await db.run(sql`SELECT COUNT(*) AS count FROM layout_frames_backup_x2_total_20261025`)).rows[0]?.count ?? -1)
      : null

    await payload.db.migrate({
      migrations: [{
        name: migrationName,
        up: args => migration.up(args as Parameters<typeof migration.up>[0]),
        down: args => migration.down(args as Parameters<typeof migration.down>[0]),
      }],
    })

    const afterTables = await tableNames()
    if (!faqTables.every(name => afterTables.has(name))) throw new Error('The Payload migration completed without creating the complete FAQ schema.')
    for (const name of beforeTables) if (!afterTables.has(name)) throw new Error(`Unexpected table removal during FAQ migration: ${name}`)
    if (layoutBackupRows !== null) {
      const afterRows = Number((await db.run(sql`SELECT COUNT(*) AS count FROM layout_frames_backup_x2_total_20261025`)).rows[0]?.count ?? -1)
      if (afterRows !== layoutBackupRows) throw new Error(`Layout backup row count changed (${layoutBackupRows} → ${afterRows}).`)
    }
    console.log(JSON.stringify({ migration: migrationName, createdTables: faqTables.length, preservedLayoutBackupRows: layoutBackupRows }, null, 2))
  }
} catch (error) {
  failure = error
} finally {
  const sqliteClient = (payload.db.drizzle as unknown as { $client?: { close?: () => void } } | undefined)?.$client
  await payload.destroy()
  sqliteClient?.close?.()
}

if (failure) {
  console.error(failure)
  process.exit(1)
}
process.exit(0)
