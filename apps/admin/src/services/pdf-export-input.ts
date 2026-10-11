export const PDF_EXPORT_TOTAL_PAGES = 102

export type PdfExportLanguage = 'en' | 'pt-BR'
export type PdfExportProfile = 'visual' | 'editable'

export interface PdfExportRequest {
  language: PdfExportLanguage
  profile: PdfExportProfile
  pages: number[]
}

export class PdfExportInputError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'PdfExportInputError'
    this.statusCode = statusCode
  }
}

export function normalizePdfExportRequest(value: unknown): PdfExportRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PdfExportInputError('Envie idioma, páginas e perfil de exportação.')
  }

  const input = value as Record<string, unknown>
  if (input.language !== 'en' && input.language !== 'pt-BR') {
    throw new PdfExportInputError('Idioma inválido. Use en ou pt-BR.')
  }
  if (input.profile !== 'visual' && input.profile !== 'editable') {
    throw new PdfExportInputError('Perfil inválido. Use visual ou editable.')
  }
  if (input.profile === 'editable') {
    throw new PdfExportInputError('A exportação editável ainda é experimental e está indisponível.', 422)
  }
  if (!Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > PDF_EXPORT_TOTAL_PAGES) {
    throw new PdfExportInputError(`Informe entre 1 e ${PDF_EXPORT_TOTAL_PAGES} páginas.`)
  }

  const pages = input.pages as unknown[]
  if (pages.some(page => !Number.isInteger(page) || Number(page) < 1 || Number(page) > PDF_EXPORT_TOTAL_PAGES)) {
    throw new PdfExportInputError(`As páginas devem ser inteiros entre 1 e ${PDF_EXPORT_TOTAL_PAGES}.`)
  }
  const normalizedPages = pages.map(Number)
  if (new Set(normalizedPages).size !== normalizedPages.length) {
    throw new PdfExportInputError('A lista de páginas não pode conter duplicatas.')
  }
  if (normalizedPages.some((page, index) => index > 0 && page <= normalizedPages[index - 1])) {
    throw new PdfExportInputError('Informe as páginas em ordem crescente.')
  }

  return { language: input.language, profile: 'visual', pages: normalizedPages }
}
