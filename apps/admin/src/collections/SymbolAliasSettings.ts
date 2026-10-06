import type { CollectionConfig } from 'payload'

/** One shared record stores editor preferences, separately from translations. */
export const SymbolAliasSettings: CollectionConfig = {
  slug: 'symbol-alias-settings',
  admin: {
    useAsTitle: 'settingsKey',
    defaultColumns: ['settingsKey', 'updatedAt'],
    description: 'Shared preferred [[alias]] values for inline semantic symbols.',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    { name: 'settingsKey', type: 'text', required: true, unique: true, defaultValue: 'shared' },
    { name: 'aliases', type: 'json', required: true },
  ],
}
