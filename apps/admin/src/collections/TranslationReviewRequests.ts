import type { CollectionConfig } from 'payload'

/** User-authored correction requests, processed ahead of normal localization work. */
export const TranslationReviewRequests: CollectionConfig = {
  slug: 'translation-review-requests',
  admin: {
    useAsTitle: 'referenceTitle',
    defaultColumns: ['pageNumber', 'referenceType', 'status', 'createdAt'],
    description: 'Human requests for AI corrections; ordered by creation time and separate from proposals and published translations.',
    group: 'Translation review',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => false,
  },
  fields: [
    {
      name: 'referenceType',
      type: 'select',
      required: true,
      options: [
        { label: 'Proposal unit', value: 'proposal' },
        { label: 'Exception', value: 'exception' },
        { label: 'Page', value: 'page' },
      ],
    },
    { name: 'pageNumber', type: 'number', required: true, index: true },
    { name: 'referenceTitle', type: 'text', required: true },
    { name: 'reviewKey', type: 'text', index: true },
    { name: 'spanKey', type: 'text', index: true },
    { name: 'sourceBlockId', type: 'text' },
    { name: 'exceptionId', type: 'text' },
    { name: 'proposalId', type: 'text', index: true },
    { name: 'proposalVersion', type: 'text' },
    { name: 'translationSpanKey', type: 'text', index: true },
    { name: 'requestText', type: 'textarea', required: true, maxLength: 4000 },
    { name: 'requestContext', type: 'json' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'In progress', value: 'in_progress' },
        { label: 'Completed', value: 'completed' },
      ],
    },
    { name: 'resultNote', type: 'textarea' },
    { name: 'handledAt', type: 'date' },
    {
      name: 'completedBy',
      type: 'select',
      options: [
        { label: 'AI agent', value: 'ai' },
        { label: 'User', value: 'user' },
      ],
    },
  ],
}
