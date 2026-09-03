const cache = new Map();
const { cachedJson } = require('../../utils/http-client');
const TTL_MS = 60 * 60 * 1000;

async function searchPubMed(query) {
  const key = query.toLowerCase().trim();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < TTL_MS) return cached.documents;
  try {
    const searchResponse = await cachedJson('pubmed-search', key, `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=${encodeURIComponent(query)}`, {}, { ttlMs: TTL_MS, timeoutMs: 3000 });
    if (!searchResponse.data) return [];
    const ids = searchResponse.data.esearchresult?.idlist || [];
    if (!ids.length) return [];
    const summaryResponse = await cachedJson('pubmed-summary', ids.join(','), `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`, {}, { ttlMs: TTL_MS, timeoutMs: 3000 });
    if (!summaryResponse.data) return [];
    const data = summaryResponse.data;
    const documents = ids.map((id) => {
      const item = data.result?.[id] || {};
      return { id: `pubmed_${id}`, title: item.title || 'PubMed article', canonicalUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, type: 'paper', metadata: { authors: (item.authors || []).map((author) => author.name), published: item.pubdate || '', venue: item.fulljournalname || 'PubMed', citationCount: 0 }, access: { openAccess: false }, abstract: '', provenance: { providers: [{ provider: 'pubmed', source: 'pubmed', domain: 'pubmed.ncbi.nlm.nih.gov', url: `https://pubmed.ncbi.nlm.nih.gov/${id}/` }] } };
    });
    cache.set(key, { timestamp: Date.now(), documents });
    return documents;
  } catch (error) {
    return [];
  }
}

module.exports = { searchPubMed };
