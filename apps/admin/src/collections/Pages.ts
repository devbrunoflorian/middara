import type { CollectionConfig } from 'payload'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'id',
  },
  access: {
    create: () => true,
    read: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    { name: 'number', type: 'number', required: true },
    { name: 'chapter', type: 'relationship', relationTo: 'chapters' },
    { name: 'backgroundAsset', type: 'relationship', relationTo: 'media' },
    { name: 'version', type: 'number', required: true, defaultValue: 1 },
  ],
}
