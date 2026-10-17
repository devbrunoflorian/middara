import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Books } from './collections/Books'
import { Chapters } from './collections/Chapters'
import { Pages } from './collections/Pages'
import { RulebookBlocks } from './collections/Blocks'
import { Translations } from './collections/Translations'
import { LayoutFrames } from './collections/LayoutFrames'
import { SymbolAliasSettings } from './collections/SymbolAliasSettings'
import { PdfExportJobs } from './collections/PdfExportJobs'
import { TranslationReviews } from './collections/TranslationReviews'
import { TranslationReviewRequests } from './collections/TranslationReviewRequests'
import { TranslationGlossaryDecisions } from './collections/TranslationGlossaryDecisions'
import { approveTranslationReviewEndpoint } from './endpoints/approveTranslationReview'
import { completeUserTranslationReviewRequestEndpoint } from './endpoints/completeUserTranslationReviewRequest'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  cors: '*',
  collections: [Users, Media, Books, Chapters, Pages, RulebookBlocks, Translations, TranslationReviews, TranslationReviewRequests, TranslationGlossaryDecisions, LayoutFrames, SymbolAliasSettings, PdfExportJobs],
  endpoints: [approveTranslationReviewEndpoint, completeUserTranslationReviewRequestEndpoint],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || '',
    },
    push: true,
    transactionOptions: { behavior: 'immediate' },
  }),
  sharp,
  plugins: [],
})
