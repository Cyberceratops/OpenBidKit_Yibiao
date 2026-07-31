const defaultServiceBaseUrl = 'https://openbidkit-yibiao-analytics-api.clint-schneider.workers.dev';

export const serviceBaseUrl = String(import.meta.env.VITE_YIBIAO_API_BASE_URL || defaultServiceBaseUrl)
  .trim()
  .replace(/\/+$/, '');

export function buildServiceUrl(path: string) {
  return `${serviceBaseUrl}/${String(path || '').replace(/^\/+/, '')}`;
}
