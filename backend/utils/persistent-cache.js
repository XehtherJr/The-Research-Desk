const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_ENTRIES = 500;
const MAX_BYTES = 10 * 1024 * 1024;
const memoryCaches = new Map();
const loadedNamespaces = new Set();

function cacheDirectory() {
  return process.env.RESEARCH_DESK_CACHE_DIR || (process.env.NETLIFY ? path.join(os.tmpdir(), 'research-desk-cache') : path.join(__dirname, '../../.cache'));
}

function cachePath(namespace) {
  return path.join(cacheDirectory(), `${namespace}.json`);
}

function load(namespace) {
  if (loadedNamespaces.has(namespace)) return memoryCaches.get(namespace);
  loadedNamespaces.add(namespace);
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(namespace), 'utf8'));
    memoryCaches.set(namespace, parsed && typeof parsed === 'object' ? parsed : {});
  } catch {
    memoryCaches.set(namespace, {});
  }
  return memoryCaches.get(namespace);
}

function prune(cache) {
  const entries = Object.entries(cache).sort((first, second) => (second[1].timestamp || 0) - (first[1].timestamp || 0)).slice(0, MAX_ENTRIES);
  let result = Object.fromEntries(entries);
  while (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_BYTES && Object.keys(result).length > 1) {
    delete result[Object.keys(result).pop()];
  }
  return result;
}

function persist(namespace, cache) {
  try {
    fs.mkdirSync(cacheDirectory(), { recursive: true });
    const target = cachePath(namespace);
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(cache), 'utf8');
    fs.renameSync(temporary, target);
  } catch {
    // Serverless filesystems may be read-only; memory cache remains active.
  }
}

function get(namespace, key, ttlMs) {
  const cache = load(namespace);
  const entry = cache[key];
  if (!entry || Date.now() - entry.timestamp >= ttlMs) return null;
  return entry.value;
}

function set(namespace, key, value) {
  const cache = load(namespace);
  cache[key] = { timestamp: Date.now(), value };
  const pruned = prune(cache);
  memoryCaches.set(namespace, pruned);
  persist(namespace, pruned);
}

module.exports = { get, set, cacheDirectory, MAX_ENTRIES, MAX_BYTES };
