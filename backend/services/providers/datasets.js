const cache = new Map();
const { cachedJson } = require('../../utils/http-client');
const TTL_MS = 24 * 60 * 60 * 1000;

async function searchDatasets(query) {
  const key = query.toLowerCase().trim();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < TTL_MS) return cached.documents;
  const documents = [];
  try {
    const response = await cachedJson('zenodo-search', key, `https://zenodo.org/api/records/?q=${encodeURIComponent(query)}&size=5`, { headers: { Accept: 'application/json' } }, { ttlMs: TTL_MS, timeoutMs: 3000 });
    if (response.data) {
      const data = response.data;
      for (const item of data.hits?.hits || []) documents.push({ id: `zenodo_${item.id}`, title: item.metadata?.title || 'Zenodo dataset', canonicalUrl: item.links?.html, type: 'dataset', metadata: { authors: (item.metadata?.creators || []).map((creator) => creator.name), published: item.metadata?.publication_date || '', venue: 'Zenodo', doi: item.metadata?.doi, citationCount: 0 }, access: { openAccess: true, license: item.metadata?.license?.id }, abstract: item.metadata?.description || '', provenance: { providers: [{ provider: 'dataset', source: 'zenodo', domain: 'zenodo.org', url: item.links?.html }] } });
    }
  } catch (error) { /* optional provider */ }
  cache.set(key, { timestamp: Date.now(), documents });
  return documents;
}
module.exports = { searchDatasets };
