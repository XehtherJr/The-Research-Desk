/**
 * semantic-scholar.js — Client for the Semantic Scholar Academic Graph API.
 * Searches papers with configurable fields and respects rate limits.
 */

const SCHOLAR_BASE_URL = 'https://api.semanticscholar.org/graph/v1';

const PAPER_FIELDS = [
  'paperId',
  'title',
  'authors',
  'year',
  'abstract',
  'citationCount',
  'venue',
  'openAccessPdf',
  'externalIds',
  'tldr',
  'url',
].join(',');

/**
 * Search Semantic Scholar for papers matching a query.
 * Fetches Math.min(limit * 2, 100) to allow for filtering downstream.
 *
 * @param {string} query - Search query string
 * @param {number} limit - User-requested result count (10-100)
 * @returns {Promise<Object>} { total, papers: [...raw scholar results] }
 */
async function searchPapers(query, limit) {
  const fetchCount = Math.min(limit * 2, 100);

  const params = new URLSearchParams({
    query: query,
    fields: PAPER_FIELDS,
    limit: String(fetchCount),
  });

  const url = `${SCHOLAR_BASE_URL}/paper/search?${params.toString()}`;

  const headers = {
    Accept: 'application/json',
  };

  // Use API key if available for higher rate limits (100 req/s vs 1 req/s)
  const apiKey = process.env.SCHOLAR_API_KEY;
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const statusCode = response.status;

    if (statusCode === 429) {
      throw new Error(
        'RATE_LIMITED: Semantic Scholar API rate limit exceeded. Please wait a moment and try again.'
      );
    }

    if (statusCode === 404) {
      // Scholar returns 404 for queries with no results in some cases
      return { total: 0, papers: [] };
    }

    const body = await response.text().catch(() => '');
    throw new Error(
      `SCHOLAR_API_ERROR: Semantic Scholar returned ${statusCode}. ${body}`
    );
  }

  const data = await response.json();

  return {
    total: data.total || 0,
    papers: data.data || [],
  };
}

module.exports = { searchPapers };
