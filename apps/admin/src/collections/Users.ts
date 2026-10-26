import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: {
    // Accounts are provisioned only through the protected local bootstrap CLI.
    // Payload's unauthenticated first-register endpoint is blocked by src/proxy.ts.
    create: () => false,
    read: ({ req }) => Boolean(req.user),
    update: () => false,
    delete: () => false,
  },
  fields: [
    // Email added by default
    // Add more fields as needed
  ],
}
