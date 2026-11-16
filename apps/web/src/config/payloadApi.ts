export const payloadApiOrigin = (import.meta.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000').replace(/\/+$/u, '');

export const payloadApiUrl = (path: string): string =>
  `${payloadApiOrigin}/api/${path.replace(/^\/+/, '')}`;
