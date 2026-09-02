/**
 * search.js — POST /api/search route for Document Discovery Engine (Phase 1).
 * Fetches works from OpenAlex, normalizes them, and returns standardized document results.
 */

const express = require('express');
const router = express.Router();
const { searchWorks } = require('../services/openalex');
const { normalizeWorks } = require('../utils/normalize');

/**
 * POST /api/search
 * Body: { query: string, limit?: number (10-100, default 25) }
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const { query } = req.body;
    let { limit } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Query required. Please enter a search term.',
        code: 'INVALID_QUERY',
      });
    }

    const trimmedQuery = query.trim();

    // Clamp limit to 10-100, default 25
    limit = parseInt(limit, 10);
    if (isNaN(limit) || limit < 10) limit = 25;
    if (limit > 100) limit = 100;

    console.log(`[search] Query: "${trimmedQuery}", Limit: ${limit}`);

    // Fetch documents from OpenAlex
    const openAlexResult = await searchWorks(trimmedQuery, limit);

    if (!openAlexResult.results || openAlexResult.results.length === 0) {
      return res.json({
        query: trimmedQuery,
        limit_requested: limit,
        results_returned: 0,
        total_matches: 0,
        duration_ms: Date.now() - startTime,
        source: 'openalex',
        results: [],
      });
    }

    // Normalize OpenAlex works into standard schema
    const normalizedDocuments = normalizeWorks(openAlexResult.results).slice(0, limit);
    const durationMs = Date.now() - startTime;

    console.log(
      `[search] OpenAlex returned ${normalizedDocuments.length} documents (total: ${openAlexResult.total}) in ${durationMs}ms`
    );

    return res.json({
      query: trimmedQuery,
      limit_requested: limit,
      results_returned: normalizedDocuments.length,
      total_matches: openAlexResult.total,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
      source: 'openalex',
      results: normalizedDocuments,
    });
  } catch (err) {
    console.error('[search] Unhandled error:', err.message || err);
    return res.status(500).json({
      error: 'Something went wrong while discovering documents. Please try again.',
      code: 'SERVER_ERROR',
    });
  }
});

module.exports = router;
