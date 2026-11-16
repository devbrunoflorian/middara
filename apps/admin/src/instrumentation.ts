export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { initializePdfExportMaintenanceAtStartup } = await import('./instrumentation.node')
  await initializePdfExportMaintenanceAtStartup()
}
