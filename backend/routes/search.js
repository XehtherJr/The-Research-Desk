/**
 * search.js — V1 Discovery Engine Search Route.
 * Coordinates the complete 7-stage discovery pipeline:
 * Intent & SearchPlan -> Multi-provider Retrieval -> Deduplication ->
 * Document Evaluation -> Discovery Ranking (with Diversity Constraints).
 */

const express = require('express');
const router = express.Router();

const { planSearch } = require('../services/query-planner');
const { searchWorks } = require('../services/openalex');
const { searchCrossref } = require('../services/crossref');
const { searchCompanyResearch } = require('../services/company-scrapers');
const { normalizeWorks } = require('../utils/normalize');
const { deduplicate } = require('../services/deduplicator');
const { evaluateDocuments } = require('../services/document-evaluator');
const { rankForDiscovery } = require('../services/discovery-ranker');

/**
 * POST /api/search
 * Body: { query: string, limit?: number (15-25, default 20) }
 */
router.post('/', async (req, res) => {
  const overallStart = Date.now();
  const timing = {
    query_planning_ms: 0,
    retrieval_ms: 0,
    deduplication_ms: 0,
    evaluation_ms: 0,
    ranking_ms: 0,
    total_ms: 0,
  };

  try {
    const { query } = req.body;
    let { limit } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Query required. Please enter a research goal or search term.',
        code: 'INVALID_QUERY',
      });
    }

    const trimmedQuery = query.trim();
    limit = parseInt(limit, 10);
    if (isNaN(limit) || limit < 15) limit = 20;
    if (limit > 25) limit = 25;

    console.log(`\n[V1 Pipeline] Starting Discovery for query: "${trimmedQuery}"`);

    // ─────────────────────────────────────────────
    // STAGE 1: QUERY PLANNING
    // ─────────────────────────────────────────────
    const planStart = Date.now();
    const searchPlan = await planSearch(trimmedQuery);
    timing.query_planning_ms = Date.now() - planStart;
    console.log(`[Stage 1: Planner] Goal: "${searchPlan.intent.goal}" (${timing.query_planning_ms}ms)`);

    // ─────────────────────────────────────────────
    // STAGE 2: MULTI-PROVIDER RETRIEVAL
    // ─────────────────────────────────────────────
    const retrievalStart = Date.now();

    // Prepare subqueries
    const openAlexSubquery =
      searchPlan.subqueries?.find((s) => s.sources.includes('openalex'))?.query || trimmedQuery;
    const crossrefSubquery =
      searchPlan.subqueries?.find((s) => s.sources.includes('crossref'))?.query || trimmedQuery;

    // Parallel fetch across OpenAlex, Crossref, and 9 Company Scrapers
    const [openAlexResult, crossrefDocs, companyDocs] = await Promise.all([
      searchWorks(openAlexSubquery, 25).catch((err) => {
        console.warn('[Retrieval: OpenAlex] Warning:', err.message);
        return { results: [] };
      }),
      searchCrossref(crossrefSubquery, 15).catch((err) => {
        console.warn('[Retrieval: Crossref] Warning:', err.message);
        return [];
      }),
      searchCompanyResearch(trimmedQuery, searchPlan.concepts).catch((err) => {
        console.warn('[Retrieval: Company Scrapers] Warning:', err.message);
        return [];
      }),
    ]);

    const normalizedOpenAlex = normalizeWorks(openAlexResult.results || []);
    const rawCandidates = [...normalizedOpenAlex, ...crossrefDocs, ...companyDocs];

    timing.retrieval_ms = Date.now() - retrievalStart;
    console.log(
      `[Stage 2: Retrieval] Retrieved ${rawCandidates.length} total candidates (OpenAlex: ${normalizedOpenAlex.length}, Crossref: ${crossrefDocs.length}, Company: ${companyDocs.length}) in ${timing.retrieval_ms}ms`
    );

    // ─────────────────────────────────────────────
    // STAGE 3: DEDUPLICATION & PROVENANCE MERGING
    // ─────────────────────────────────────────────
    const dedupStart = Date.now();
    const dedupedCandidates = deduplicate(rawCandidates);
    timing.deduplication_ms = Date.now() - dedupStart;
    console.log(
      `[Stage 3: Deduplication] Merged ${rawCandidates.length} -> ${dedupedCandidates.length} unique candidates (${timing.deduplication_ms}ms)`
    );

    // ─────────────────────────────────────────────
    // STAGE 4: DOCUMENT UNDERSTANDING & EVALUATION
    // ─────────────────────────────────────────────
    const evalStart = Date.now();
    // Evaluate top candidates (up to 30 candidates to keep evaluation under <3s)
    const candidatesToEvaluate = dedupedCandidates.slice(0, 25);
    const evaluatedDocs = await evaluateDocuments(candidatesToEvaluate, searchPlan);
    timing.evaluation_ms = Date.now() - evalStart;
    console.log(`[Stage 4: Evaluation] Evaluated ${evaluatedDocs.length} documents (${timing.evaluation_ms}ms)`);

    // ─────────────────────────────────────────────
    // STAGE 5: DISCOVERY RANKING WITH DIVERSITY
    // ─────────────────────────────────────────────
    const rankStart = Date.now();
    const discoveryResults = rankForDiscovery(evaluatedDocs, searchPlan, limit);
    timing.ranking_ms = Date.now() - rankStart;

    timing.total_ms = Date.now() - overallStart;
    console.log(`[Stage 5: Ranking] Selected ${discoveryResults.length} curated documents (${timing.ranking_ms}ms). Total: ${timing.total_ms}ms`);

    // Collect all active providers
    const providers = Array.from(
      new Set(discoveryResults.flatMap((r) => r.discoveredVia || []))
    );

    return res.json({
      query: trimmedQuery,
      searchPlan,
      results: discoveryResults,
      metadata: {
        totalCandidates: rawCandidates.length,
        candidatesAfterDedup: dedupedCandidates.length,
        evaluatedCount: evaluatedDocs.length,
        returnedCount: discoveryResults.length,
        timing,
        providers,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Search Route Error]', err);
    timing.total_ms = Date.now() - overallStart;
    return res.status(500).json({
      error: 'Discovery search encountered an unexpected issue. Please try again.',
      code: 'SERVER_ERROR',
      timing,
    });
  }
});

module.exports = router;
