/**
 * search.js — POST /api/search route.
 * Orchestrates: validate → Scholar fetch → M3 classify → filter → respond.
 */

const express = require('express');
const router = express.Router();
const { searchPapers } = require('../services/semantic-scholar');
const { classifyRelationships } = require('../services/minimax');
const { normalizePapers } = require('../utils/normalize');

/**
 * POST /api/search
 * Body: { query: string, limit?: number (10-100, default 25) }
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    // --- Validate input ---
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

    // --- Fetch papers from Semantic Scholar ---
    let scholarResult;
    try {
      scholarResult = await searchPapers(trimmedQuery, limit);
    } catch (err) {
      if (err.message.includes('RATE_LIMITED')) {
        return res.status(429).json({
          error: 'Search service is temporarily busy. Please wait a moment and try again.',
          code: 'RATE_LIMITED',
        });
      }
      throw err;
    }

    if (!scholarResult.papers || scholarResult.papers.length === 0) {
      return res.json({
        query: trimmedQuery,
        limit_requested: limit,
        results_returned: 0,
        duration_ms: Date.now() - startTime,
        results: [],
      });
    }

    console.log(
      `[search] Scholar returned ${scholarResult.papers.length} papers (total: ${scholarResult.total})`
    );

    // --- Normalize papers ---
    const normalizedPapers = normalizePapers(scholarResult.papers);

    // --- Classify relationships via Minimax M3 ---
    let classifiedPapers;
    try {
      classifiedPapers = await classifyRelationships(
        trimmedQuery,
        normalizedPapers
      );
    } catch (err) {
      console.error('[search] M3 classification error:', err.message);
      // Graceful degradation: return papers without relationships
      classifiedPapers = normalizedPapers;
    }

    // --- Filter out "unrelated" papers ---
    const filteredPapers = classifiedPapers.filter((paper) => {
      const primaryType = paper.relationships?.primary?.type;
      // Keep papers with no classification (M3 failed) or with a real relationship
      return primaryType !== 'unrelated';
    });

    // --- Trim to requested limit ---
    const finalPapers = filteredPapers.slice(0, limit);

    const durationMs = Date.now() - startTime;
    console.log(
      `[search] Returning ${finalPapers.length} results in ${durationMs}ms`
    );

    return res.json({
      query: trimmedQuery,
      limit_requested: limit,
      results_returned: finalPapers.length,
      total_from_scholar: scholarResult.total,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
      results: finalPapers,
    });
  } catch (err) {
    console.error('[search] Unhandled error:', err);
    return res.status(500).json({
      error: 'Something went wrong. Please try again.',
      code: 'SERVER_ERROR',
    });
  }
});

module.exports = router;
