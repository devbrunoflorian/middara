import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { NextRequest } from 'next/server'

const adminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testDbDir = await mkdtemp(path.join(os.tmpdir(), 'middara-editorial-faq-api-'))

process.env.DATABASE_URL = `file:${path.join(testDbDir, 'faq-api.db').replaceAll('\\', '/')}`
process.env.PAYLOAD_SECRET = randomBytes(48).toString('hex')
dotenv.config({ path: path.join(adminDir, '.env') })
// The local .env may target production. This isolated integration database
// needs Payload's schema push and must never touch the configured project DB.
Reflect.set(process.env, 'NODE_ENV', 'test')
delete process.env.PAYLOAD_MIGRATING

const { default: config } = await import('../src/payload.config')
const { getPayload } = await import('payload')
const { REST_DELETE, REST_GET, REST_PATCH, REST_POST } = await import('@payloadcms/next/routes')
const { proxy } = await import('../src/proxy')
const payload = await getPayload({ config })

const handlers = {
  GET: REST_GET(payload.config),
  POST: REST_POST(payload.config),
  PATCH: REST_PATCH(payload.config),
  DELETE: REST_DELETE(payload.config),
}

const request = async (method: keyof typeof handlers, route: string, body?: unknown, token?: string) => {
  const routePath = route.split('?')[0]
  const headers = new Headers({ Accept: 'application/json' })
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `JWT ${token}`)
  const response = await handlers[method](new Request(`http://localhost:3000/api/${route}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { params: Promise.resolve({ slug: routePath.split('/').filter(Boolean) }) })
  const text = await response.text()
  let json: Record<string, unknown> = {}
  try { json = text ? JSON.parse(text) as Record<string, unknown> : {} } catch { /* Keep only status for non-JSON responses. */ }
  return { status: response.status, json }
}

const proxyFirstRegister = () => proxy(new NextRequest('http://localhost:3000/api/users/first-register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.invalid' },
  body: JSON.stringify({ email: 'attacker@example.invalid', password: 'not-a-real-password' }),
}))

const baseFaq = {
  language: 'pt-BR' as const,
  category: 'Movimento, Terrenos e Elevação' as const,
  sourceVersion: 'Middara Rulebook 1.2 / 2023',
  sourcePages: [{ page: 42 }],
  sourceUnitIds: [],
  keywords: [],
  synonyms: [],
  ruleScope: 'base' as const,
  reviewStatus: 'pending' as const,
}

const fixture = (faqId: string, spoilerLevel: 'none' | 'spoiler' = 'none') => ({
  ...baseFaq,
  faqId,
  question: `Pergunta de teste ${faqId}`,
  answer: `Resposta de teste ${faqId}`,
  englishQuestion: `Test question ${faqId}`,
  englishAnswer: `Test answer ${faqId}`,
  spoilerLevel,
})

const results: string[] = []
let failure: unknown
try {
  const beforeFirstRegister = proxyFirstRegister()
  assert.equal(beforeFirstRegister.status, 403, 'first-register must be denied before any account exists')
  const noUserYet = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
  assert.equal(noUserYet.totalDocs, 0)
  results.push('unauthenticated first-register blocked by Next Proxy before first account exists')

  const draft = await payload.create({ collection: 'editorial-faqs', data: fixture('TEST-DRAFT'), draft: true, overrideAccess: true })
  const published = await payload.create({ collection: 'editorial-faqs', data: { ...fixture('TEST-PUBLIC'), _status: 'published' }, draft: false, overrideAccess: true })
  const spoiler = await payload.create({ collection: 'editorial-faqs', data: { ...fixture('TEST-SPOILER', 'spoiler'), _status: 'published' }, draft: false, overrideAccess: true })
  const localPublished = await payload.find({ collection: 'editorial-faqs', overrideAccess: false, limit: 100 })

  const list = await request('GET', 'editorial-faqs?limit=100')
  assert.equal(list.status, 200)
  const publicIds = (list.json.docs as Array<{ faqId: string }>).map(doc => doc.faqId)
  assert.deepEqual(publicIds, ['TEST-PUBLIC'])
  results.push('anonymous collection query returns only published, spoiler-free FAQ')

  for (const [id, expectedStatus] of [[String(draft.id), 404], [String(spoiler.id), 404], [String(published.id), 200]] as const) {
    const item = await request('GET', `editorial-faqs/${id}`)
    assert.equal(item.status, expectedStatus, `unexpected anonymous by-ID status for ${id}`)
  }
  const draftQuery = await request('GET', 'editorial-faqs?draft=true&limit=100')
  assert.equal(draftQuery.status, 200)
  assert.deepEqual((draftQuery.json.docs as Array<{ faqId: string }>).map(doc => doc.faqId), ['TEST-PUBLIC'])
  results.push('anonymous by-ID, draft=true, and spoiler lookups do not expose unpublished or spoiler content')

  const versions = await payload.findVersions({
    collection: 'editorial-faqs',
    limit: 10,
    pagination: false,
    overrideAccess: true,
    where: { parent: { equals: draft.id } },
  })
  assert.ok(versions.docs.length > 0, 'test draft should have a native Payload version')
  const versionId = String(versions.docs[0].id)
  const anonVersions = await request('GET', `editorial-faqs/versions?where[parent][equals]=${draft.id}`)
  const anonVersion = await request('GET', `editorial-faqs/versions/${versionId}`)
  const anonRestore = await request('POST', `editorial-faqs/versions/${versionId}`, {})
  assert.equal(anonVersions.status, 403)
  assert.equal(anonVersion.status, 403)
  assert.equal(anonRestore.status, 403)
  results.push('anonymous version list, version-by-ID, and restore operations are denied')

  const unauthCreate = await request('POST', 'editorial-faqs', fixture('TEST-UNAUTH'))
  const unauthUpdate = await request('PATCH', `editorial-faqs/${published.id}`, { answer: 'attacker edit' })
  const unauthDelete = await request('DELETE', `editorial-faqs/${published.id}`)
  const unauthUserCreate = await request('POST', 'users', { email: 'attacker@example.invalid', password: 'not-a-real-password' })
  assert.equal(unauthCreate.status, 403)
  assert.equal(unauthUpdate.status, 403)
  assert.equal(unauthDelete.status, 403)
  assert.equal(unauthUserCreate.status, 403)
  results.push('anonymous FAQ create/update/delete and user creation are denied')

  const stillNoUsers = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
  assert.equal(stillNoUsers.totalDocs, 0)

  const testEmail = 'editorial-faq-test@example.invalid'
  const testPassword = `Faq-test-${randomBytes(20).toString('hex')}`
  const user = await payload.create({ collection: 'users', data: { email: testEmail, password: testPassword }, overrideAccess: true })
  const login = await payload.login({ collection: 'users', data: { email: testEmail, password: testPassword } })
  assert.ok(login.token)
  const adminToken = login.token as string

  const adminDraft = await request('GET', `editorial-faqs/${draft.id}?draft=true`, undefined, adminToken)
  assert.equal(adminDraft.status, 200)
  const adminVersions = await request('GET', `editorial-faqs/versions?where[parent][equals]=${draft.id}`, undefined, adminToken)
  assert.equal(adminVersions.status, 200)
  const saveReviewedDraft = await request('PATCH', `editorial-faqs/${draft.id}?draft=true`, {
    answer: 'Resposta revisada pelo administrador de teste',
    reviewStatus: 'reviewed',
  }, adminToken)
  assert.equal(saveReviewedDraft.status, 200)
  const publish = await request('PATCH', `editorial-faqs/${draft.id}?draft=false`, { _status: 'published' }, adminToken)
  assert.equal(publish.status, 200)
  const publiclyPublished = await request('GET', `editorial-faqs/${draft.id}`)
  assert.equal(publiclyPublished.status, 200)
  assert.equal((publiclyPublished.json as { _status?: string })._status, 'published')
  results.push('Payload JWT reads drafts/history, saves review state, and publishes an individual FAQ')
} catch (error) {
  failure = error
} finally {
  const sqliteClient = (payload.db.drizzle as unknown as { $client?: { close?: () => void } } | undefined)?.$client
  await payload.destroy()
  await sqliteClient?.close?.()
  try {
    await rm(testDbDir, { recursive: true, force: true })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EBUSY')) throw error
    // libsql can retain the SQLite handle until this process exits on Windows.
    const cleaner = spawn(process.execPath, [
      '-e',
      'const fs = require("node:fs"); const target = process.argv[1]; setTimeout(() => fs.rmSync(target, { recursive: true, force: true }), 3000);',
      testDbDir,
    ], { detached: true, stdio: 'ignore', windowsHide: true })
    cleaner.unref()
  }
}

if (failure) {
  console.error(failure)
  process.exit(1)
}
console.log(JSON.stringify({ passed: results.length, results }, null, 2))
process.exit(0)
