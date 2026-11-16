import type { CollectionConfig } from 'payload'

/** Human review state and the publication receipt for each approved proposal unit. */
export const TranslationReviews: CollectionConfig = {
  slug: 'translation-reviews',
  admin: {
    useAsTitle: 'reviewKey',
    defaultColumns: ['reviewKey', 'pageNumber', 'approvalStatus', 'updatedAt'],
    description: 'Persistent proposal edits, reversible review queue disposition, explicit approval and a Payload receipt for the published translation.',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => false,
  },
  fields: [
    { name: 'reviewKey', type: 'text', required: true, unique: true },
    { name: 'pageNumber', type: 'number', required: true, index: true },
    { name: 'spanKey', type: 'text', required: true, index: true },
    { name: 'proposalId', type: 'text', required: true, index: true },
    { name: 'proposalVersion', type: 'text', required: true },
    { name: 'sourceText', type: 'textarea' },
    { name: 'proposalText', type: 'textarea' },
    { name: 'data', type: 'json', required: true },
    { name: 'technicalStatus', type: 'text', required: true },
    {
      name: 'copyfitClassification',
      type: 'select',
      options: [
        { label: 'EXACT', value: 'EXACT' },
        { label: 'UNDER', value: 'UNDER' },
        { label: 'OVER', value: 'OVER' },
      ],
    },
    { name: 'copyfitSourcePdfLineCount', type: 'number' },
    { name: 'copyfitPageRendererLineCount', type: 'number' },
    { name: 'copyfitMeasurementFingerprint', type: 'text' },
    { name: 'underCompositionJustification', type: 'textarea' },
    {
      name: 'approvalStatus',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending human approval', value: 'pending' },
        { label: 'Approved', value: 'approved' },
      ],
    },
    {
      name: 'reviewDisposition',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Active in review queue', value: 'active' },
        { label: 'Archived from review queue', value: 'archived' },
      ],
    },
    { name: 'approvedAt', type: 'date' },
    { name: 'publication', type: 'json' },
  ],
}
