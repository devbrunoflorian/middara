import type { CollectionConfig } from 'payload'

/** Private job metadata and immutable input references for server-side exports. */
export const PdfExportJobs: CollectionConfig = {
  slug: 'pdf-export-jobs',
  admin: { hidden: true, useAsTitle: 'jobId' },
  access: {
    create: () => false,
    read: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'jobId', type: 'text', required: true, unique: true, index: true },
    { name: 'ownerId', type: 'text', index: true },
    { name: 'language', type: 'select', required: true, options: ['en', 'pt-BR'] },
    { name: 'profile', type: 'select', required: true, options: ['visual', 'editable'] },
    { name: 'pages', type: 'json', required: true },
    {
      name: 'status', type: 'select', required: true, index: true,
      options: ['queued', 'running', 'completed', 'failed', 'cancelled'],
    },
    { name: 'completedPages', type: 'number', required: true, defaultValue: 0 },
    { name: 'totalPages', type: 'number', required: true },
    { name: 'currentPage', type: 'number' },
    { name: 'stage', type: 'text', required: true },
    { name: 'cancelRequested', type: 'checkbox', required: true, defaultValue: false },
    { name: 'snapshotPath', type: 'text', admin: { hidden: true } },
    { name: 'snapshotHash', type: 'text', admin: { hidden: true } },
    { name: 'outputPath', type: 'text', admin: { hidden: true } },
    { name: 'downloadName', type: 'text' },
    { name: 'error', type: 'text' },
    { name: 'startedAt', type: 'date' },
    { name: 'completedAt', type: 'date' },
    { name: 'expiresAt', type: 'date', index: true },
  ],
}
