import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

interface EnglishFaqEntry {
  faqId: string
  question: string
  answer: string
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const adminDir = path.resolve(scriptDir, '..')
dotenv.config({ path: path.join(adminDir, '.env') })
process.env.PAYLOAD_MIGRATING = 'true'

const apply = process.argv.includes('--apply')
const sourcePath = path.join(adminDir, 'content', 'middara-faq-rulebook-1.2-en.json')
const entries = JSON.parse(await fs.readFile(sourcePath, 'utf8')) as EnglishFaqEntry[]
const expectedIds = Array.from({ length: 176 }, (_, index) => `FAQ-${String(index + 1).padStart(3, '0')}`)
const ids = entries.map(entry => entry.faqId)
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
const invalidEntries = entries.filter(entry =>
  !/^FAQ-\d{3}$/u.test(entry.faqId)
  || !entry.question.trim()
  || !entry.answer.trim(),
)
const missingIds = expectedIds.filter(id => !ids.includes(id))
const extraIds = ids.filter(id => !expectedIds.includes(id))

if (entries.length !== 176 || duplicateIds.length || invalidEntries.length || missingIds.length || extraIds.length) {
  console.error(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    entries: entries.length,
    duplicateIds,
    invalidIds: invalidEntries.map(entry => entry.faqId),
    missingIds,
    extraIds,
  }, null, 2))
  process.exit(2)
}

const { default: config } = await import('../src/payload.config')
const { getPayload } = await import('payload')
const payload = await getPayload({ config })
const sqliteClient = (payload.db.drizzle as unknown as { $client?: { close?: () => void } } | undefined)?.$client

const report = {
  mode: apply ? 'apply' : 'dry-run',
  sourceEntries: entries.length,
  updated: 0,
  unchanged: 0,
  verified: 0,
  conflicts: [] as Array<{ faqId: string; reason: string }>,
  missing: [] as string[],
}

try {
  const existingResult = await payload.find({
    collection: 'editorial-faqs',
    depth: 0,
    draft: true,
    limit: 200,
    overrideAccess: true,
    pagination: false,
  })
  const existingById = new Map(existingResult.docs.map(doc => [String(doc.faqId), doc as unknown as Record<string, unknown>]))
  const protectedFields = new Map<string, string>()

  const preservedContent = (doc: Record<string, unknown>) => JSON.stringify({
    question: String(doc.question ?? ''),
    answer: String(doc.answer ?? ''),
    category: String(doc.category ?? ''),
    sourcePages: Array.isArray(doc.sourcePages) ? doc.sourcePages.map(item =>
      typeof item === 'object' && item !== null && 'page' in item ? Number(item.page) : Number(item),
    ) : [],
    ruleScope: String(doc.ruleScope ?? ''),
    spoilerLevel: String(doc.spoilerLevel ?? ''),
    status: String(doc._status ?? ''),
    reviewStatus: String(doc.reviewStatus ?? ''),
  })

  for (const entry of entries) {
    const existing = existingById.get(entry.faqId)
    if (!existing) {
      report.missing.push(entry.faqId)
      continue
    }
    protectedFields.set(entry.faqId, preservedContent(existing))

    const status = String(existing._status ?? 'draft')
    const reviewStatus = String(existing.reviewStatus ?? 'pending')
    const spoilerLevel = String(existing.spoilerLevel ?? 'none')
    const currentQuestion = String(existing.englishQuestion ?? '').trim()
    const currentAnswer = String(existing.englishAnswer ?? '').trim()

    if (status !== 'draft' || reviewStatus !== 'pending' || spoilerLevel !== 'none') {
      report.conflicts.push({ faqId: entry.faqId, reason: `protected record (${status}/${reviewStatus}/${spoilerLevel})` })
      continue
    }

    if (currentQuestion === entry.question.trim() && currentAnswer === entry.answer.trim()) {
      report.unchanged += 1
      continue
    }
    if (currentQuestion || currentAnswer) {
      report.conflicts.push({ faqId: entry.faqId, reason: 'English fields already contain different content' })
      continue
    }

    report.updated += 1
    if (apply) {
      await payload.update({
        collection: 'editorial-faqs',
        id: String(existing.id),
        data: {
          englishQuestion: entry.question.trim(),
          englishAnswer: entry.answer.trim(),
        },
        draft: true,
        overrideAccess: true,
      })
    }
  }

  const verificationResult = await payload.find({
    collection: 'editorial-faqs',
    depth: 0,
    draft: true,
    limit: 200,
    overrideAccess: true,
    pagination: false,
  })
  const verifiedById = new Map(verificationResult.docs.map(doc => [String(doc.faqId), doc as unknown as Record<string, unknown>]))
  for (const entry of entries) {
    const current = verifiedById.get(entry.faqId)
    if (!current) continue
    const sameEnglish = String(current.englishQuestion ?? '').trim() === entry.question.trim()
      && String(current.englishAnswer ?? '').trim() === entry.answer.trim()
    const sameProtectedContent = protectedFields.get(entry.faqId) === preservedContent(current)
    if (sameEnglish && sameProtectedContent) report.verified += 1
    else report.conflicts.push({ faqId: entry.faqId, reason: 'read-back verification failed' })
  }

  console.log(JSON.stringify(report, null, 2))
  if (report.conflicts.length || report.missing.length || report.verified !== entries.length) process.exitCode = 2
} finally {
  await payload.destroy()
  sqliteClient?.close?.()
}

process.exit(process.exitCode ?? 0)
