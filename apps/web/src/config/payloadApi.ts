const configuredPayloadOrigin = import.meta.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';

export const payloadApiUrl = (path: string): string =>
  `${configuredPayloadOrigin.replace(/\/+$/u, '')}/api/${path.replace(/^\/+/, '')}`;
