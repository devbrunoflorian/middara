import type { CollectionConfig } from 'payload'

export const Chapters: CollectionConfig = {
  slug: 'chapters',
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'order', type: 'number', required: true },
    { name: 'book', type: 'relationship', relationTo: 'books', required: true },
  ],
}
