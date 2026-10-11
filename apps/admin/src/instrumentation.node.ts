import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { initializePdfExportMaintenance } from './services/pdf-export-jobs'

export async function initializePdfExportMaintenanceAtStartup() {
  try {
    const payload = await getPayload({ config: await configPromise })
    await initializePdfExportMaintenance(payload)
  } catch (error) {
    // Keep app boot available; the first export API request retries initialization.
    console.error('[pdf-export] startup maintenance initialization failed', error)
  }
}
