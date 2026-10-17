import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const reviewQueuePath = path.join(projectRoot, 'docs/translations/localization-exceptions.json')
const reviewGlossaryPath = path.join(projectRoot, 'docs/translations/glossary.md')
const reviewBuilderPath = path.join(projectRoot, 'scripts/build_translation_review_catalog.mjs')
const reviewPublicCatalogPath = path.join(projectRoot, 'apps/web/public/translation-review/catalog.json')
const reviewDevCatalogPath = path.join(projectRoot, 'apps/web/node_modules/.cache/translation-review/catalog.json')

function translationReviewCatalogDevMiddleware(): Plugin {
  return {
    name: 'translation-review-catalog-live',
    configureServer(server) {
      fs.mkdirSync(path.dirname(reviewDevCatalogPath), { recursive: true })
      if (fs.existsSync(reviewPublicCatalogPath)) fs.copyFileSync(reviewPublicCatalogPath, reviewDevCatalogPath)

      const watchedProposalPaths = new Set<string>()
      const normalize = (value: string) => path.resolve(value).toLowerCase()
      const normalizedQueuePath = normalize(reviewQueuePath)
      const normalizedGlossaryPath = normalize(reviewGlossaryPath)
      const refreshProposalWatchList = () => {
        try {
          const queue = JSON.parse(fs.readFileSync(reviewQueuePath, 'utf8')) as { sourceProposals?: unknown }
          const sourceProposals: unknown[] = Array.isArray(queue.sourceProposals) ? queue.sourceProposals : []
          const nextPaths = sourceProposals
            .filter((value: unknown): value is string => typeof value === 'string' && value.toLowerCase().endsWith('.json'))
            .map((value: string) => path.resolve(projectRoot, value))
            .filter((value: string) => value.startsWith(`${projectRoot}${path.sep}`))
          for (const proposalPath of nextPaths) {
            watchedProposalPaths.add(normalize(proposalPath))
            server.watcher.add(proposalPath)
          }
        } catch (error) {
          server.config.logger.warn(`Could not refresh translation proposal watches: ${String(error)}`)
        }
      }
      refreshProposalWatchList()
      server.watcher.add(reviewQueuePath)
      server.watcher.add(reviewGlossaryPath)

      let rebuildTimer: ReturnType<typeof setTimeout> | undefined
      let rebuildPromise = Promise.resolve()
      const scheduleCatalogRebuild = (changedPath: string) => {
        const normalizedPath = normalize(changedPath)
        if (normalizedPath !== normalizedQueuePath && normalizedPath !== normalizedGlossaryPath && !watchedProposalPaths.has(normalizedPath)) return
        clearTimeout(rebuildTimer)
        rebuildTimer = setTimeout(() => {
          rebuildPromise = rebuildPromise.then(() => new Promise<void>((resolve, reject) => {
            execFile(process.execPath, [reviewBuilderPath, path.relative(projectRoot, reviewDevCatalogPath)], {
              cwd: projectRoot,
              windowsHide: true,
            }, (error, stdout, stderr) => {
              if (error) {
                reject(new Error(stderr || error.message))
                return
              }
              if (stdout.trim()) server.config.logger.info(stdout.trim())
              resolve()
            })
          })).then(refreshProposalWatchList).catch(error => {
            server.config.logger.error(`Could not rebuild the live translation review catalog: ${String(error)}`)
          })
        }, 500)
      }
      server.watcher.on('change', scheduleCatalogRebuild)
      server.watcher.on('add', scheduleCatalogRebuild)

      server.middlewares.use('/translation-review/catalog.json', (_request, response, next) => {
        fs.readFile(reviewDevCatalogPath, (error, contents) => {
          if (error) {
            next(error)
            return
          }
          response.statusCode = 200
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(contents)
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), translationReviewCatalogDevMiddleware()],
  server: {
    port: 8080,
    strictPort: true
  }
})
