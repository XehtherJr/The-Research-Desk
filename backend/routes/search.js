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
const { enrichDocuments } = require('../services/data-enricher');
const { enrichCitationContexts } = require('../services/citation-enricher');
const { searchDatasets } = require('../services/providers/datasets');
const { searchCodeRepositories } = require('../services/providers/code-repositories');
const { searchPatents } = require('../services/providers/patents');
const { searchGrants } = require('../services/providers/grants');
const { analyzeQuery } = require('../services/query-analyzer');
const { generateSearchPolicy } = require('../services/search-policy');
const { applyCoherence } = require('../services/domain-coherence');
const { extractEvidenceBatch } = require('../services/evidence-extractor');
const { searchPubMed } = require('../services/providers/pubmed');
const { searchExternalSources } = require('../services/providers/external-sources');
const { buildRelevanceProfile, scoreDocumentRelevance, expandQuery } = require('../services/query-relevance');
const { rerankCandidates } = require('../services/semantic-reranker');
const { requestId, logSearch } = require('../utils/observability');

function withTimeout(promise, timeoutMs, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

function shouldSearchCompanyCatalog(query, analysis) {
  return analysis.domain.primary === 'computer-science' || /openai|anthropic|deepmind|meta ai|microsoft research|nvidia|jarvis|llm|software|codebase|repository/i.test(query);
}

function annotateSubquery(documents, subqueryIndex) {
  return documents.map((document) => ({ ...document, subqueryIndexes: [...new Set([...(document.subqueryIndexes || []), subqueryIndex])] }));
}

function purgeDistractors(documents, analysis) {
  const profile = buildRelevanceProfile(analysis.originalQuery || analysis.goal?.statement, analysis.concepts || []);
  return documents.filter((document) => scoreDocumentRelevance(document, profile).passes);
}

function selectSubqueryQuota(documents, subqueries, quota = 3) {
  const selected = [];
  for (let index = 0; index < subqueries.length; index++) {
    documents
      .filter((document) => document.subqueryIndexes?.includes(index))
      .slice(0, quota)
      .forEach((document) => { if (!selected.includes(document)) selected.push(document); });
  }
  return selected;
}

function getZeroStateSuggestions(analysis) {
  if (analysis.domain?.primary === 'clinical') return ['Expand to Europe PMC and PubMed clinical reviews.', 'Try the condition, population, and intervention as separate terms.'];
  if (analysis.domain?.primary === 'computer-science') return ['Expand to open-access preprints and code repositories.', 'Try adding the task, benchmark, or model family.'];
  return ['No high-confidence matches were found in the routed sources.', 'Try a narrower topic, a named method, or an alternate spelling.'];
}

/**
 * POST /api/search
 * Body: { query: string, limit?: number (15-25, default 20) }
 */
router.post('/', async (req, res) => {
  const overallStart = Date.now();
  const searchRequestId = requestId();
  res.setHeader('X-Research-Request-Id', searchRequestId);
  const timing = {
    query_planning_ms: 0,
    retrieval_ms: 0,
    query_analysis_ms: 0,
    deduplication_ms: 0,
    evaluation_ms: 0,
    enrichment_ms: 0,
    citation_ms: 0,
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
    if (isNaN(limit) || limit < 5) limit = 20;
    if (limit > 30) limit = 30;

    console.log(`\n[V1 Pipeline] Starting Discovery for query: "${trimmedQuery}"`);

    // ─────────────────────────────────────────────
    // STAGE 1: QUERY PLANNING
    // ─────────────────────────────────────────────
    const analysisStart = Date.now();
    const queryAnalysis = await analyzeQuery(trimmedQuery);
    const searchPolicy = generateSearchPolicy(queryAnalysis);
    timing.query_analysis_ms = Date.now() - analysisStart;
    const planStart = Date.now();
    const searchPlan = await planSearch(trimmedQuery);
    searchPlan.queryAnalysis = queryAnalysis;
    searchPlan.searchPolicy = searchPolicy;
    searchPlan.intent.type = queryAnalysis.intent.type;
    searchPlan.intent.goal = queryAnalysis.goal.statement;
    searchPlan.domain = queryAnalysis.domain;
    searchPlan.relevanceProfile = buildRelevanceProfile(trimmedQuery, searchPlan.concepts);
    searchPlan.expandedQuery = expandQuery(trimmedQuery, searchPlan.concepts);
    searchPlan.roleOrder = searchPlan.intent.type === 'building'
      ? ['implementation', 'applied', 'dataset', 'foundational', 'alternative']
      : searchPlan.intent.type === 'learning'
        ? ['foundational', 'applied', 'implementation', 'dataset', 'alternative']
        : ['foundational', 'alternative', 'applied', 'implementation', 'dataset'];
    timing.query_planning_ms = Date.now() - planStart;
    console.log(`[Stage 1: Planner] Goal: "${searchPlan.intent.goal}" (${timing.query_planning_ms}ms)`);

    // ─────────────────────────────────────────────
    // STAGE 2: MULTI-PROVIDER RETRIEVAL
    // ─────────────────────────────────────────────
    const retrievalStart = Date.now();

    // Prepare subqueries
    const subqueries = (searchPlan.subqueries || [{ query: trimmedQuery, sources: ['openalex', 'crossref'] }]).slice(0, 3);
    const openAlexSubquery = subqueries.find((s) => s.sources.includes('openalex'))?.query || trimmedQuery;
    const crossrefSubquery = subqueries.find((s) => s.sources.includes('crossref'))?.query || trimmedQuery;
    const crossrefSubqueryIndex = Math.max(0, subqueries.findIndex((s) => s.sources.includes('crossref')));
    const laneQuery = searchPolicy.lanes[0]?.queries[0]?.base || trimmedQuery;

    // Parallel fetch across academic, company, dataset, code, patent, and grant sources.
    const [openAlexResults, crossrefDocs, companyDocs, datasetDocs, codeDocs, patentDocs, grantDocs, pubmedDocs] = await Promise.all([
      Promise.all(subqueries.map((subquery, index) => subquery.sources.includes('openalex') ? withTimeout(searchWorks(expandQuery(subquery.query, searchPlan.concepts), 12).catch((err) => {
        console.warn('[Retrieval: OpenAlex] Warning:', err.message);
        return { results: [] };
      }), 4500, { results: [] }).then((result) => ({ ...result, subqueryIndex: index })) : null)).then((results) => results.filter(Boolean)),
      withTimeout(searchCrossref(expandQuery(crossrefSubquery, searchPlan.concepts), 15).catch((err) => {
        console.warn('[Retrieval: Crossref] Warning:', err.message);
        return [];
      }), 4500, []),
      withTimeout((shouldSearchCompanyCatalog(trimmedQuery, queryAnalysis) ? searchCompanyResearch(trimmedQuery, searchPlan.concepts) : Promise.resolve([])).catch((err) => {
        console.warn('[Retrieval: Company Scrapers] Warning:', err.message);
        return [];
      }), 3500, []),
      withTimeout(searchDatasets(trimmedQuery).catch(() => []), 3500, []),
      withTimeout(searchCodeRepositories(trimmedQuery).catch(() => []), 3500, []),
      withTimeout(searchPatents(trimmedQuery).catch(() => []), 3500, []),
      withTimeout(searchGrants(trimmedQuery).catch(() => []), 3500, []),
      queryAnalysis.domain.primary === 'clinical' ? withTimeout(searchPubMed(trimmedQuery).catch(() => []), 3500, []) : Promise.resolve([]),
    ]);

    const normalizedOpenAlex = openAlexResults.flatMap((result) => annotateSubquery(normalizeWorks(result.results || []), result.subqueryIndex));
    const routedExternalDocs = await withTimeout(searchExternalSources(trimmedQuery, queryAnalysis), 3500, []);
    const retrievedCandidates = [
      ...annotateSubquery(normalizedOpenAlex, 0),
      ...annotateSubquery(crossrefDocs, crossrefSubqueryIndex),
      ...companyDocs,
      ...datasetDocs,
      ...codeDocs,
      ...patentDocs,
      ...grantDocs,
      ...pubmedDocs,
      ...routedExternalDocs,
    ];
    const rawCandidates = purgeDistractors(retrievedCandidates, queryAnalysis);

    timing.retrieval_ms = Date.now() - retrievalStart;
    console.log(
      `[Stage 2: Retrieval] Retrieved ${rawCandidates.length} total candidates (OpenAlex: ${normalizedOpenAlex.length}, Crossref: ${crossrefDocs.length}, Company: ${companyDocs.length}, Datasets: ${datasetDocs.length}, Code: ${codeDocs.length}, Patents: ${patentDocs.length}, Grants: ${grantDocs.length}, PubMed: ${pubmedDocs.length}) in ${timing.retrieval_ms}ms`
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
    const relevanceRankedCandidates = await withTimeout(
      rerankCandidates(trimmedQuery, dedupedCandidates, searchPlan.concepts),
      3000,
      dedupedCandidates
    );
    const coherentPool = applyCoherence(relevanceRankedCandidates, queryAnalysis);
    const companyCandidates = coherentPool.filter((candidate) =>
      (candidate.provenance?.providers || []).some((provider) => provider.provider === 'company')
    );
    const ecosystemCandidates = coherentPool.filter((candidate) =>
      (candidate.provenance?.providers || []).some((provider) => ['dataset', 'code', 'patent', 'grant'].includes(provider.provider))
    );
    const priorityCandidates = [...companyCandidates, ...ecosystemCandidates];
    const otherCandidates = coherentPool.filter((candidate) => !priorityCandidates.includes(candidate));
    const exploratory = otherCandidates.filter((candidate) => candidate.subqueryIndexes?.length > 1 || candidate.metadata?.citationCount < 20);
    const explorationBand = exploratory.sort(() => Math.random() - 0.5).slice(0, Math.max(1, Math.ceil(limit * 0.2)));
    const quotaCandidates = selectSubqueryQuota(coherentPool, subqueries, 3);
    const candidatesToEvaluate = [...quotaCandidates, ...priorityCandidates.slice(0, 12), ...otherCandidates, ...explorationBand]
      .filter((candidate, index, all) => all.indexOf(candidate) === index)
      .slice(0, 25);
    const enrichmentStart = Date.now();
    const enrichedCandidates = await enrichDocuments(candidatesToEvaluate);
    const coherentCandidates = enrichedCandidates;
    const evidenceCandidates = extractEvidenceBatch(coherentCandidates);
    timing.enrichment_ms = Date.now() - enrichmentStart;
    const citationStart = Date.now();
    const citationCandidates = evidenceCandidates.map((candidate, index) =>
      index < 12 ? candidate : { ...candidate, metadata: { ...candidate.metadata, doi: null } }
    );
    const enrichedWithCitations = await enrichCitationContexts(citationCandidates);
    timing.citation_ms = Date.now() - citationStart;
    const evaluatedDocs = await evaluateDocuments(enrichedWithCitations, searchPlan);
    timing.evaluation_ms = Date.now() - evalStart;
    console.log(`[Stage 4: Evaluation] Evaluated ${evaluatedDocs.length} documents (${timing.evaluation_ms}ms)`);

    // ─────────────────────────────────────────────
    // STAGE 5: DISCOVERY RANKING WITH DIVERSITY
    // ─────────────────────────────────────────────
    const rankStart = Date.now();
    const discoveryResults = rankForDiscovery(evaluatedDocs, searchPlan, limit);
    timing.ranking_ms = Date.now() - rankStart;

    timing.total_ms = Date.now() - overallStart;
    logSearch({ requestId: searchRequestId, query: trimmedQuery, totalMs: timing.total_ms, retrieved: retrievedCandidates.length, admitted: rawCandidates.length, evaluated: evaluatedDocs.length, returned: discoveryResults.length });
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
        retrievedCandidates: retrievedCandidates.length,
        rejectedBeforeEvaluation: retrievedCandidates.length - rawCandidates.length,
        candidatesAfterDedup: dedupedCandidates.length,
        evaluatedCount: evaluatedDocs.length,
        returnedCount: discoveryResults.length,
        timing,
        providers,
        providerHealth: {
          openalex: normalizedOpenAlex.length > 0 ? 'ok' : 'empty',
          crossref: crossrefDocs.length > 0 ? 'ok' : 'empty',
          company: companyDocs.length > 0 ? 'ok' : shouldSearchCompanyCatalog(trimmedQuery, queryAnalysis) ? 'empty' : 'not-routed',
          external: routedExternalDocs.length > 0 ? 'ok' : 'empty',
        },
        suggestions: discoveryResults.length ? [] : getZeroStateSuggestions(queryAnalysis),
        roleOrder: searchPlan.roleOrder,
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
