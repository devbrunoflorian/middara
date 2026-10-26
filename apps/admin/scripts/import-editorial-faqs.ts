import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import type { EditorialFaq } from '../src/payload-types'
import { contentHash, parseEditorialFaqMarkdown, type ParsedEditorialFaq } from '../src/faq/editorialFaqImport'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const adminDir = path.resolve(scriptDir, '..')
dotenv.config({ path: path.join(adminDir, '.env') })
// The schema is applied by the focused Payload migration, never by this content importer.
process.env.PAYLOAD_MIGRATING = 'true'

const apply = process.argv.includes('--apply')
const sourceArg = process.argv.find(value => value.startsWith('--file='))?.slice('--file='.length)
const sourcePath = path.resolve(sourceArg ?? path.join(adminDir, 'content', 'middara-faq-rulebook-1.2-pt-BR.md'))
const markdown = await fs.readFile(sourcePath, 'utf8')
const parsed = parseEditorialFaqMarkdown(markdown)
const report = {
  mode: apply ? 'apply' : 'dry-run',
  source: path.basename(sourcePath),
  sourceSha256: createHash('sha256').update(markdown).digest('hex'),
  sourceEntries: parsed.entries.length,
  categories: parsed.categories.length,
  new: 0,
  updated: 0,
  unchanged: 0,
  invalid: parsed.errors.length,
  conflicts: [] as Array<{ faqId: string; reason: string }>,
  errors: parsed.errors,
  suspectedSpoilerIds: parsed.suspectedSpoilerIds,
}

if (parsed.errors.length) {
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = 2
} else {
  const { default: config } = await import('../src/payload.config')
  const { getPayload } = await import('payload')
  const payload = await getPayload({ config })
  const sqliteClient = (payload.db.drizzle as unknown as { $client?: { close?: () => void } } | undefined)?.$client
  try {
    const existingResult = await payload.find({
      collection: 'editorial-faqs',
      depth: 0,
      draft: true,
      limit: 1000,
      overrideAccess: true,
      pagination: false,
    })
    const existingById = new Map(existingResult.docs.map(doc => [String(doc.faqId), doc as unknown as Record<string, unknown>]))

    const toPayloadData = (entry: ParsedEditorialFaq) => ({
      faqId: entry.faqId,
      language: entry.language,
      question: entry.question,
      answer: entry.answer,
      englishQuestion: entry.englishQuestion,
      englishAnswer: entry.englishAnswer,
      category: entry.category as EditorialFaq['category'],
      sourceVersion: entry.sourceVersion,
      sourcePages: entry.sourcePages.map(page => ({ page })),
      sourceUnitIds: [],
      keywords: entry.keywords.map(value => ({ value })),
      synonyms: entry.synonyms.map(value => ({ value })),
      ruleScope: entry.ruleScope,
      spoilerLevel: entry.spoilerLevel,
      reviewStatus: 'pending' as const,
      sourceEntryHash: entry.sourceEntryHash,
      importedContentHash: entry.importedContentHash,
    })

    const currentContentHash = (doc: Record<string, unknown>): string => {
      const values = (field: unknown): string[] => Array.isArray(field)
        ? field.map(value => typeof value === 'object' && value !== null && 'value' in value ? String(value.value) : String(value))
        : []
      const pages = Array.isArray(doc.sourcePages)
        ? doc.sourcePages.map(item => typeof item === 'object' && item !== null && 'page' in item ? Number(item.page) : Number(item))
        : []
      const entry = {
        language: String(doc.language ?? 'pt-BR') as 'pt-BR',
        question: String(doc.question ?? ''),
        answer: String(doc.answer ?? ''),
        englishQuestion: String(doc.englishQuestion ?? ''),
        englishAnswer: String(doc.englishAnswer ?? ''),
        category: String(doc.category ?? ''),
        sourceVersion: String(doc.sourceVersion ?? ''),
        sourcePages: pages,
        sourceUnitIds: values(doc.sourceUnitIds).map(value => value),
        keywords: values(doc.keywords),
        synonyms: values(doc.synonyms),
        ruleScope: String(doc.ruleScope ?? 'base') as 'base' | 'optional_variant',
        spoilerLevel: String(doc.spoilerLevel ?? 'none') as 'none' | 'spoiler',
      }
      return contentHash(entry)
    }

    const writes: Array<() => Promise<unknown>> = []
    for (const entry of parsed.entries) {
      const existing = existingById.get(entry.faqId)
      if (!existing) {
        report.new += 1
        if (apply) writes.push(() => payload.create({
          collection: 'editorial-faqs',
          data: toPayloadData(entry),
          draft: true,
          overrideAccess: true,
        }))
        continue
      }

      const status = String(existing._status ?? 'draft')
      const reviewStatus = String(existing.reviewStatus ?? 'pending')
      const marker = String(existing.importedContentHash ?? '')
      const sourceHash = String(existing.sourceEntryHash ?? '')
      if (status === 'published' || reviewStatus === 'reviewed') {
        report.conflicts.push({ faqId: entry.faqId, reason: status === 'published' ? 'published' : 'human-reviewed' })
      } else if (!marker || currentContentHash(existing) !== marker) {
        report.conflicts.push({ faqId: entry.faqId, reason: 'human-edited-or-missing-import-fingerprint' })
      } else if (sourceHash === entry.sourceEntryHash) {
        report.unchanged += 1
      } else {
        report.updated += 1
        if (apply) writes.push(() => payload.update({
          collection: 'editorial-faqs',
          id: String(existing.id),
          data: toPayloadData(entry),
          draft: true,
          overrideAccess: true,
        }))
      }
    }

    if (apply) {
      for (const write of writes) await write()
    }
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await payload.destroy()
    sqliteClient?.close?.()
  }
}

process.exit(process.exitCode ?? 0)
