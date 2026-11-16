import { describe, expect, it } from 'vitest'

import { pdfExportProgressPercent, pdfExportRetentionDays } from '../../src/services/pdf-export-state'

describe('PDF export job progress and retention', () => {
  it('keeps progress below 100 while pages render, assemble, and verify', () => {
    expect(pdfExportProgressPercent('rendering', 102, 102)).toBeLessThan(100)
    expect(pdfExportProgressPercent('assembling', 102, 102)).toBe(91)
    expect(pdfExportProgressPercent('verifying', 102, 102)).toBe(97)
    expect(pdfExportProgressPercent('completed', 102, 102)).toBe(100)
  })

  it('clamps page counts and reports interrupted jobs below completion', () => {
    expect(pdfExportProgressPercent('rendering', 103, 102)).toBe(88)
    expect(pdfExportProgressPercent('failed', 102, 102)).toBeLessThan(100)
    expect(pdfExportProgressPercent('cancelled', 0, 102)).toBe(4)
  })

  it.each([
    [undefined, 7], ['invalid', 7], ['0', 1], ['14', 14], ['120', 90],
  ])('bounds configured retention %s to %i days', (value, expected) => {
    expect(pdfExportRetentionDays(value)).toBe(expected)
  })
})
