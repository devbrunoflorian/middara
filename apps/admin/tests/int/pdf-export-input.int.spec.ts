import { describe, expect, it } from 'vitest'

import { normalizePdfExportRequest, PdfExportInputError } from '../../src/services/pdf-export-input'

describe('PDF export request validation', () => {
  it('accepts a sorted page interval for the visual writer', () => {
    expect(normalizePdfExportRequest({ language: 'pt-BR', profile: 'visual', pages: [13, 14, 15] }))
      .toEqual({ language: 'pt-BR', profile: 'visual', pages: [13, 14, 15] })
  })

  it('accepts the complete 1–102 page document', () => {
    const pages = Array.from({ length: 102 }, (_, index) => index + 1)
    expect(normalizePdfExportRequest({ language: 'en', profile: 'visual', pages })).toEqual({ language: 'en', profile: 'visual', pages })
  })

  it.each([
    { language: 'fr', profile: 'visual', pages: [1] },
    { language: 'en', profile: 'print', pages: [1] },
    { language: 'en', profile: 'visual', pages: [] },
    { language: 'en', profile: 'visual', pages: [0] },
    { language: 'en', profile: 'visual', pages: [103] },
    { language: 'en', profile: 'visual', pages: [3, 2] },
    { language: 'en', profile: 'visual', pages: [2, 2] },
  ])('rejects invalid input %#', input => {
    expect(() => normalizePdfExportRequest(input)).toThrow(PdfExportInputError)
  })

  it('keeps the editable writer unavailable', () => {
    expect(() => normalizePdfExportRequest({ language: 'en', profile: 'editable', pages: [24] }))
      .toThrow(/experimental/i)
  })
})
