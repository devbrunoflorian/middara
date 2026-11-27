import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  assertPdfExportSourceAvailable,
  PdfExportSourceUnavailableError,
} from '../../src/services/pdf-export-jobs'

let temporaryDirectory: string | null = null

afterEach(async () => {
  vi.unstubAllEnvs()
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
  temporaryDirectory = null
})

describe('PDF export source preflight', () => {
  it('rejects a missing source with an actionable service-unavailable error', async () => {
    vi.stubEnv('MIDDARA_SOURCE_PDF_PATH', '')

    await expect(assertPdfExportSourceAvailable()).rejects.toBeInstanceOf(PdfExportSourceUnavailableError)
  })

  it('rejects a stale source path with an actionable configuration error', async () => {
    vi.stubEnv('MIDDARA_SOURCE_PDF_PATH', path.join(os.tmpdir(), `missing-middara-source-${Date.now()}.pdf`))

    await expect(assertPdfExportSourceAvailable()).rejects.toMatchObject({
      name: 'PdfExportSourceUnavailableError',
      statusCode: 503,
      message: expect.stringContaining('Nenhuma exportação foi iniciada'),
    })
  })

  it('accepts the readable official PDF source file', async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'middara-pdf-source-'))
    const sourcePath = path.join(temporaryDirectory, 'source.pdf')
    await writeFile(sourcePath, '%PDF-1.7\n')
    vi.stubEnv('MIDDARA_SOURCE_PDF_PATH', sourcePath)

    await expect(assertPdfExportSourceAvailable()).resolves.toBe(path.resolve(sourcePath))
  })

  it('rejects a readable file that is not a PDF', async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'middara-pdf-source-'))
    const sourcePath = path.join(temporaryDirectory, 'not-a-pdf.txt')
    await writeFile(sourcePath, 'This is a text file.')
    vi.stubEnv('MIDDARA_SOURCE_PDF_PATH', sourcePath)

    await expect(assertPdfExportSourceAvailable()).rejects.toBeInstanceOf(PdfExportSourceUnavailableError)
  })

  it('rejects a directory configured as the source PDF', async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'middara-pdf-source-'))
    vi.stubEnv('MIDDARA_SOURCE_PDF_PATH', temporaryDirectory)

    await expect(assertPdfExportSourceAvailable()).rejects.toBeInstanceOf(PdfExportSourceUnavailableError)
  })
})
