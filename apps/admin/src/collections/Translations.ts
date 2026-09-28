import type { CollectionConfig } from 'payload'

export const Translations: CollectionConfig = {
  slug: 'translations',
  admin: {
    useAsTitle: 'spanKey',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    { name: 'spanKey', type: 'text', required: true, unique: true },
    { name: 'language', type: 'text', required: true, defaultValue: 'pt-BR' },
    { name: 'data', type: 'json', required: true },
  ],
}
