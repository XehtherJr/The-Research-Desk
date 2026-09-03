/**
 * crossref.js — Crossref Metadata Search & Enrichment Service.
 * Queries Crossref API with polite pool headers and normalizes into Document schema.
 */

const CROSSREF_API_URL = 'https://api.crossref.org/works';
const persistentCache = require('../utils/persistent-cache');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Strips XML/JATS formatting tags often present in Crossref abstracts.
 * @param {string} rawAbstract
 * @returns {string} Clean plain text
 */
function cleanAbstract(rawAbstract) {
  if (!rawAbstract || typeof rawAbstract !== 'string') return '';
  return rawAbstract
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maps Crossref work types to standard document types.
 * @param {string} rawType
 * @returns {string} 'paper' | 'book' | 'dataset' | 'report' | 'repository'
 */
function mapCrossrefType(rawType) {
  if (!rawType) return 'paper';
  const t = rawType.toLowerCase();
  if (t.includes('dataset') || t.includes('component')) return 'dataset';
  if (t.includes('book') || t.includes('monograph') || t.includes('chapter')) return 'book';
  if (t.includes('report') || t.includes('standard') || t.includes('dissertation')) return 'report';
  return 'paper';
}

/**
 * Normalizes a Crossref item into the unified Document schema.
 * @param {Object} item - Raw Crossref item
 * @returns {Object} Unified Document
 */
function normalizeCrossrefWork(item) {
  if (!item) return null;

  const title = (item.title && item.title[0]) || 'Untitled Publication';

  const authors = (item.author || [])
    .map((a) => {
      if (a.name) return a.name;
      const parts = [a.given, a.family].filter(Boolean);
      return parts.join(' ').trim();
    })
    .filter(Boolean);

  if (authors.length === 0) {
    authors.push('Unknown Author');
  }

  // Publication date
  let publishedDate = 'Unknown';
  const dateParts =
    item['published-print']?.['date-parts']?.[0] ||
    item['published-online']?.['date-parts']?.[0] ||
    item['created']?.['date-parts']?.[0];

  if (Array.isArray(dateParts) && dateParts.length > 0) {
    publishedDate = dateParts.map((p) => String(p).padStart(2, '0')).join('-');
  }

  const doi = item.DOI || null;
  const canonicalUrl = item.URL || (doi ? `https://doi.org/${doi}` : '');
  const venue = (item['container-title'] && item['container-title'][0]) || item.publisher || null;
  const citationCount = item['is-referenced-by-count'] ?? 0;
  const abstract = cleanAbstract(item.abstract) || 'Abstract not indexed in Crossref record.';
  const docType = mapCrossrefType(item.type);

  // Link to full-text or PDF if available
  const pdfUrl = (item.link || []).find((l) => l['content-type'] === 'application/pdf')?.URL || null;

  const cleanId = doi ? doi.replace(/[^a-zA-Z0-9_-]/g, '_') : String(Math.random()).slice(2);

  return {
    id: `crossref_${cleanId}`,
    canonicalUrl: canonicalUrl || `https://doi.org/${doi}`,
    title,
    type: docType,
    metadata: {
      authors,
      published: publishedDate,
      doi,
      publisher: item.publisher || null,
      venue,
      citationCount,
    },
    access: {
      openAccess: Boolean(pdfUrl || (item.license && item.license.length > 0)),
      license: item.license?.[0]?.URL || null,
      pdfUrl,
    },
    provenance: {
      providers: [
        {
          provider: 'crossref',
          source: 'crossref',
          domain: 'crossref.org',
          url: canonicalUrl,
          retrievedAt: new Date().toISOString(),
          confidence: 0.95,
        },
      ],
    },
    abstract,
  };
}

/**
 * Search Crossref for works matching query.
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array<Object>>}
 */
async function searchCrossref(query, limit = 15) {
  const fetchLimit = Math.max(5, Math.min(50, parseInt(limit, 10) || 15));
  const cacheKey = `${query.trim().toLowerCase()}::${fetchLimit}`;
  const cached = persistentCache.get('crossref-search', cacheKey, CACHE_TTL_MS);
  if (cached) return cached;
  const params = new URLSearchParams({
    query: query.trim(),
    rows: String(fetchLimit),
    mailto: 'discovery@researchdiscovery.app',
  });

  const url = `${CROSSREF_API_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DocumentDiscoveryEngine/1.0 (mailto:discovery@researchdiscovery.app)',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[Crossref] Warning: returned status ${response.status}`);
      return [];
    }

    const data = await response.json();
    const items = data.message?.items || [];
    const documents = items.map(normalizeCrossrefWork).filter(Boolean);
    persistentCache.set('crossref-search', cacheKey, documents);
    return documents;
  } catch (err) {
    console.warn(`[Crossref] Fetch error: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  searchCrossref,
  normalizeCrossrefWork,
};
