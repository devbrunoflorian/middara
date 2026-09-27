import type { CollectionConfig } from 'payload'

export const RulebookBlocks: CollectionConfig = {
  slug: 'rulebook-blocks',
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
    { name: 'page', type: 'relationship', relationTo: 'pages', required: true },
    { name: 'type', type: 'select', options: ['text', 'image', 'vector', 'texture', 'group'], required: true },
    {
      name: 'position',
      type: 'group',
      fields: [
        { name: 'x', type: 'number', required: true },
        { name: 'y', type: 'number', required: true },
        { name: 'width', type: 'number', required: true },
        { name: 'height', type: 'number', required: true },
        { name: 'rotation', type: 'number' },
        { name: 'zIndex', type: 'number', required: true },
      ],
    },
    { name: 'readingOrder', type: 'number', required: true },
    {
      name: 'content',
      type: 'json',
      required: true,
      admin: {
        description: 'Conteúdo polimórfico (TextContent, ImageContent, etc) conforme @middara/schema'
      }
    }
  ],
}
