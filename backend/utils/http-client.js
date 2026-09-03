const persistentCache = require('./persistent-cache');

const hostState = new Map();
const MAX_RETRIES = 1;
const MIN_HOST_INTERVAL_MS = 250;

function waitForHost(url) {
  const host = new URL(url).host;
  const previous = hostState.get(host) || 0;
  const delay = Math.max(0, MIN_HOST_INTERVAL_MS - (Date.now() - previous));
  hostState.set(host, Date.now() + delay);
  return delay ? new Promise((resolve) => setTimeout(resolve, delay)) : Promise.resolve();
}

async function fetchJson(url, options = {}, settings = {}) {
  const timeoutMs = settings.timeoutMs || 3000;
  const retries = Math.min(MAX_RETRIES, settings.retries ?? MAX_RETRIES);
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await waitForHost(url);
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (response.ok) return { data: await response.json(), status: response.status, attempts: attempt + 1 };
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === retries) return { data: null, status: response.status, attempts: attempt + 1 };
    } catch (error) {
      if (attempt === retries) return { data: null, status: 0, attempts: attempt + 1, error: error.name === 'AbortError' ? 'timeout' : error.message };
    } finally {
      clearTimeout(timer);
    }
  }
  return { data: null, status: 0, attempts: retries + 1 };
}

async function cachedJson(namespace, key, url, options = {}, settings = {}) {
  const ttlMs = settings.ttlMs || 60 * 60 * 1000;
  const cached = persistentCache.get(namespace, key, ttlMs);
  if (cached) return { data: cached, cached: true, status: 200 };
  const result = await fetchJson(url, options, settings);
  if (result.data) persistentCache.set(namespace, key, result.data);
  return { ...result, cached: false };
}

module.exports = { fetchJson, cachedJson, MAX_RETRIES, MIN_HOST_INTERVAL_MS };
