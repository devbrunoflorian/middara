import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'

import { pdfExportSourcePdfPath } from '@/services/pdf-export-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SOURCE_PAGE_RENDERER = [
  'import pymupdf as fitz, sys',
  'document = fitz.open(sys.argv[1])',
  'page_number = int(sys.argv[2])',
  'if page_number < 1 or page_number > document.page_count: raise SystemExit(2)',
  'page = document.load_page(page_number - 1)',
  'pixmap = page.get_pixmap(matrix=fitz.Matrix(150 / 72, 150 / 72), alpha=False)',
  "sys.stdout.buffer.write(pixmap.tobytes('png'))",
].join('\n')

function renderSourcePage(sourcePath: string, pageNumber: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const python = process.env.MIDDARA_PYTHON_PATH ?? 'python'
    const child = spawn(python, ['-c', SOURCE_PAGE_RENDERER, sourcePath, String(pageNumber)], { windowsHide: true })
    const output: Buffer[] = []
    const errors: Buffer[] = []
    let outputLength = 0
    let errorLength = 0

    child.stdout.on('data', (chunk: Buffer) => {
      outputLength += chunk.length
      if (outputLength > 24 * 1024 * 1024) {
        child.kill()
        reject(new Error('Source page render exceeded the image limit.'))
        return
      }
      output.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (errorLength < 8192) {
        errors.push(chunk)
        errorLength += chunk.length
      }
    })
    child.once('error', reject)
    child.once('close', code => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errors).toString('utf8') || 'Source PDF page could not be rendered.'))
        return
      }
      resolve(Buffer.concat(output))
    })
  })
}

export async function GET(request: Request) {
  const rawPage = new URL(request.url).searchParams.get('page')
  const pageNumber = Number(rawPage)
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 102) {
    return Response.json({ error: 'Número de página inválido.' }, { status: 400 })
  }

  try {
    const sourcePath = pdfExportSourcePdfPath()
    await access(sourcePath)
    const png = await renderSourcePage(sourcePath, pageNumber)
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return Response.json({ error: 'O PDF original não está disponível neste servidor.' }, { status: 503 })
  }
}
