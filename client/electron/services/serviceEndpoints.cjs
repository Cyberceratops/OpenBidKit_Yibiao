const DEFAULT_SERVICE_BASE_URL = 'https://openbidkit-yibiao-analytics-api.clint-schneider.workers.dev';

const serviceBaseUrl = String(process.env.YIBIAO_API_BASE_URL || DEFAULT_SERVICE_BASE_URL)
  .trim()
  .replace(/\/+$/, '');

function buildServiceUrl(path) {
  return `${serviceBaseUrl}/${String(path || '').replace(/^\/+/, '')}`;
}

module.exports = {
  buildServiceUrl,
  serviceBaseUrl,
};
