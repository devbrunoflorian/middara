import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const adminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(adminDir, '.env') })

if (!process.argv.includes('--confirm-local')) throw new Error('Pass --confirm-local to run the protected local bootstrap.')
if (process.env.NODE_ENV === 'production') throw new Error('Local administrator bootstrap is disabled in production.')
if (!process.env.DATABASE_URL?.startsWith('file:') || process.env.DATABASE_URL.includes(':memory:')) {
  throw new Error('Bootstrap accepts only a local SQLite DATABASE_URL.')
}

const email = process.env.FAQ_ADMIN_BOOTSTRAP_EMAIL?.trim()
const password = process.env.FAQ_ADMIN_BOOTSTRAP_PASSWORD
if (!email || !password || password.length < 14) {
  throw new Error('Set FAQ_ADMIN_BOOTSTRAP_EMAIL and a FAQ_ADMIN_BOOTSTRAP_PASSWORD of at least 14 characters in the local process environment.')
}

const { default: config } = await import('../src/payload.config')
const { getPayload } = await import('payload')
const payload = await getPayload({ config })
try {
  const users = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
  if (users.totalDocs > 0) throw new Error('A user already exists. Bootstrap only provisions the first administrator.')

  await payload.create({
    collection: 'users',
    data: { email, password },
    overrideAccess: true,
  })
  console.log(`Provisioned the first local Payload administrator: ${email}`)
} finally {
  await payload.destroy()
}
