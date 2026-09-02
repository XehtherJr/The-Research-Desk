/**
 * openalex.js — Search service for OpenAlex scholarly and document catalog.
 * Provides unthrottled search across papers, books, datasets, reports, and code repositories.
 */

const OPENALEX_API_URL = 'https://api.openalex.org/works';

/**
 * Reconstructs a full abstract from OpenAlex's abstract_inverted_index.
 * @param {Object} invertedIndex - Map of word to array of integer positions
 * @returns {string} Reconstructed abstract text
 */
function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') {
    return 'No abstract available.';
  }

  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (Array.isArray(positions)) {
      for (const pos of positions) {
        words[pos] = word;
      }
    }
  }

  const abstract = words.filter((w) => w !== undefined).join(' ').trim();
  return abstract || 'No abstract available.';
}

/**
 * Maps OpenAlex work types to standardized document types.
 * @param {string} rawType - OpenAlex type string
 * @returns {string} Standardized type: 'paper' | 'book' | 'dataset' | 'report' | 'repository'
 */
function mapDocumentType(rawType) {
  if (!rawType) return 'paper';
  const type = rawType.toLowerCase().trim();

  if (type === 'dataset') return 'dataset';
  if (type === 'repository' || type === 'software') return 'repository';
  if (
    type === 'book' ||
    type === 'book-chapter' ||
    type === 'monograph' ||
    type === 'edited-book' ||
    type === 'reference-entry'
  ) {
    return 'book';
  }
  if (
    type === 'report' ||
    type === 'working-paper' ||
    type === 'standard' ||
    type === 'dissertation' ||
    type === 'grant' ||
    type === 'editorial' ||
    type === 'letter'
  ) {
    return 'report';
  }

  return 'paper';
}

/**
 * Search OpenAlex for documents matching a search query.
 * @param {string} query - Search query string
 * @param {number} limit - Number of results to return (10-100)
 * @returns {Promise<Object>} { total: number, results: Array<Object> }
 */
async function searchWorks(query, limit = 25) {
  const fetchLimit = Math.max(10, Math.min(100, parseInt(limit, 10) || 25));

  const params = new URLSearchParams({
    search: query.trim(),
    per_page: String(fetchLimit),
  });

  const url = `${OPENALEX_API_URL}?${params.toString()}`;

  const headers = {
    Accept: 'application/json',
    'User-Agent': 'ResearchDiscoveryApp/1.0 (mailto:discovery@researchdiscovery.app)',
  };

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const statusCode = response.status;
    const body = await response.text().catch(() => '');
    throw new Error(`OPENALEX_ERROR: OpenAlex API returned status ${statusCode}. ${body}`);
  }

  const data = await response.json();

  return {
    total: data.meta?.count || 0,
    results: data.results || [],
  };
}

module.exports = {
  searchWorks,
  reconstructAbstract,
  mapDocumentType,
};
