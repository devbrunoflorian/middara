import type { CollectionConfig } from 'payload'

export const LayoutFrames: CollectionConfig = {
  slug: 'layout-frames',
  admin: {
    useAsTitle: 'frameKey',
    defaultColumns: ['frameKey', 'pageNumber', 'language', 'updatedAt'],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    { name: 'frameKey', type: 'text', required: true, unique: true },
    { name: 'unitKey', type: 'text', required: true, index: true },
    { name: 'pageNumber', type: 'number', required: true, index: true },
    {
      name: 'language',
      type: 'select',
      required: true,
      options: [
        { label: 'English', value: 'en' },
        { label: 'Português (Brasil)', value: 'pt-BR' },
      ],
    },
    { name: 'data', type: 'json', required: true },
  ],
}
