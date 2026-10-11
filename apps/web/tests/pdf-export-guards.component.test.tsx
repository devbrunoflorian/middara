import { describe, expect, it } from 'vitest'

import { pdfExportBlockReason } from '../src/pdfExport'
import type { LocalPersistenceReport } from '../src/localPersistence'

describe('PDF export data-safety guard', () => {
  const clean: LocalPersistenceReport = {
    checkedAt: '2026-10-11T00:00:00.000Z',
    payloadAvailable: true,
    localRecordCount: 0,
    unsyncedCount: 0,
    entries: [],
  }

  it('allows only a clean sync report without a dirty editor draft', () => {
    expect(pdfExportBlockReason(false, clean)).toBeNull()
  })

  it('blocks and preserves an active editor draft', () => {
    expect(pdfExportBlockReason(true, clean)).toBe('draft')
  })

  it('blocks local records that are pending synchronization', () => {
    expect(pdfExportBlockReason(false, { ...clean, localRecordCount: 13, unsyncedCount: 13 })).toBe('sync-pending')
  })

  it('blocks when Payload state cannot be verified', () => {
    expect(pdfExportBlockReason(false, { ...clean, payloadAvailable: false, unsyncedCount: null })).toBe('sync-unavailable')
  })
})
