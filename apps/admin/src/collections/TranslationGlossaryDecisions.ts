import type { CollectionConfig } from 'payload'

/** Human glossary choices linked to the proposal occurrences they resolve. */
export const TranslationGlossaryDecisions: CollectionConfig = {
  slug: 'translation-glossary-decisions',
  admin: {
    useAsTitle: 'sourceTerm',
    defaultColumns: ['sourceTerm', 'targetTerm', 'decisionStatus', 'decidedAt'],
    description: 'Persistent human terminology decisions and their translation evidence.',
    group: 'Translation review',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => false,
  },
  fields: [
    { name: 'decisionKey', type: 'text', required: true, unique: true, index: true },
    { name: 'sourceTerm', type: 'text', required: true, index: true },
    { name: 'targetTerm', type: 'text', required: true },
    { name: 'normalizedSourceTerm', type: 'text', required: true, index: true },
    { name: 'normalizedTargetTerm', type: 'text', required: true },
    {
      name: 'decisionStatus',
      type: 'select',
      required: true,
      options: [
        { label: 'Aprovado no glossário', value: 'approved' },
        { label: 'Padrão observado', value: 'observed_standard' },
        { label: 'Experimental', value: 'experimental' },
        { label: 'Hipótese', value: 'hypothesis' },
        { label: 'Rejeitado', value: 'rejected' },
      ],
    },
    {
      name: 'semanticMetadata',
      type: 'json',
      admin: {
        description: 'Categoria, contexto, relações, evidências e proteção editorial. O status continua em decisionStatus.',
      },
    },
    { name: 'occurrences', type: 'json', required: true },
    { name: 'decisionNote', type: 'textarea' },
    { name: 'decidedAt', type: 'date', required: true },
  ],
}
