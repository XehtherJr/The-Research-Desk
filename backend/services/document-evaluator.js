/**
 * document-evaluator.js — Document Understanding & Evidence Evaluation Service.
 * Evaluates candidates against SearchPlan, extracting Evidence findings,
 * goal-relative Contributions, numerical scores (goalFit, relevance, evidenceQuality),
 * and actionable "Why Useful" explanations.
 *
 * Includes evaluation caching, 5-doc batching, timeout guardrails, and deterministic fallbacks.
 */

const { generateCompletion, repairAndParseJSON } = require('./ai-client');
const { buildRelevanceProfile, scoreDocumentRelevance } = require('./query-relevance');

// In-Memory Evaluation Cache: (documentId + queryHash) -> Evaluation
const evaluationCache = new Map();

/**
 * Builds system prompt for batch document evaluation.
 */
function buildEvaluationPrompt(searchPlan) {
  return `You are a research document evaluation engine.
User Goal: "${searchPlan.intent.goal}"
Intent Type: ${searchPlan.intent.type}
Concepts: ${searchPlan.concepts.join(', ')}
Evidence Needs: ${JSON.stringify(searchPlan.evidenceNeeds)}

Your job is to evaluate each document relative to this user goal and determine why it is useful.
For each document in the batch, respond with a JSON object containing:
- "documentId": string matching input id
- "relevance": number (0 to 100)
- "goalFit": number (0 to 100)
- "evidenceQuality": number (0 to 100)
- "domainValidity": number (0 to 100), based on the supplied coherence signals
- "roles": array of one or more ("foundational" | "applied" | "implementation" | "dataset" | "alternative")
- "whyUseful": one or two sentences explaining how this document helps the user achieve their specific goal
- "evidence": array of { "need": string, "finding": string, "credibility": "high"|"medium"|"low" }
- "confidence": number (0 to 1)

Return ONLY a valid JSON array of evaluation objects. No markdown fences.`;
}

/**
 * Fallback deterministic evaluation when AI is unavailable or times out.
 * @param {Object} doc
 * @param {Object} searchPlan
 * @returns {Object} Evaluation
 */
function evaluateDocumentDeterministically(doc, searchPlan) {
  const text = `${doc.title} ${doc.abstract || ''}`.toLowerCase();
  const goal = searchPlan.intent?.goal || searchPlan.query;
  const concepts = (searchPlan.concepts || []).map((c) => c.toLowerCase());
  const relevanceProfile = searchPlan.relevanceProfile || buildRelevanceProfile(searchPlan.query, searchPlan.concepts);
  const topicalMatch = scoreDocumentRelevance(doc, relevanceProfile);
  const semanticScore = Number.isFinite(doc.semanticSimilarity) ? doc.semanticSimilarity : topicalMatch.score;
  const queryText = (searchPlan.query || '').toLowerCase();
  const speedReadingQuery = /speed\s+read|speed-reading|speedreading/.test(queryText);
  const implementationQuery = /codebase|repository|repo|implementation|software/.test(queryText);

  // 1. Calculate Concept Overlap Relevance (0 - 100)
  let conceptHits = 0;
  for (const c of concepts) {
    if (text.includes(c)) conceptHits++;
  }
  let relevance = topicalMatch.passes ? Math.min(100, Math.max(10, Math.round((semanticScore * 0.65) + (topicalMatch.score * 0.35)))) : 0;
  if (speedReadingQuery) {
    const readingMatch = /speed\s+read|speed-reading|speedreading|reading speed/.test(text);
    relevance += readingMatch ? 25 : -30;
    if (!readingMatch && !/reading|books|comprehension|retention/.test(text)) relevance -= 30;
    if (doc.type === 'paper' || doc.type === 'book') relevance += 20;
    if (doc.type === 'repository' || doc.type === 'dataset' || doc.type === 'grant') relevance -= 35;
  }
  if (implementationQuery) {
    const implementationMatch = doc.type === 'repository' || /github|codebase|implementation|software/.test(text);
    relevance += implementationMatch ? 20 : -25;
    if (/jarvis/.test(queryText) && !text.includes('jarvis')) relevance -= 30;
    if (doc.type !== 'repository' && /jarvis/.test(queryText) && !/github|codebase|repository|repo/.test(text)) relevance -= 35;
    if (/jarvis/.test(queryText) && doc.title.toLowerCase().includes('jarvis')) relevance += 35;
    if (/jarvis/.test(queryText) && doc.type === 'repository' && !text.includes('jarvis')) relevance -= 25;
  }
  relevance = Math.min(100, Math.max(0, relevance));

  // 2. Determine Role based on document type and content signals
  const roles = [];
  const docType = (doc.type || '').toLowerCase();

  if (docType === 'dataset' || text.includes('dataset') || text.includes('benchmark') || text.includes('corpus')) {
    roles.push('dataset');
  }
  if (docType === 'repository' || text.includes('implementation') || text.includes('code') || text.includes('github') || text.includes('framework')) {
    roles.push('implementation');
  }
  if (text.includes('survey') || text.includes('review') || text.includes('foundations') || text.includes('introduction') || (doc.metadata?.citationCount || 0) > 2000) {
    roles.push('foundational');
  }
  if (roles.length === 0 || text.includes('empirical') || text.includes('experiment') || text.includes('method') || text.includes('detection')) {
    roles.push('applied');
  }

  // 3. Goal Fit Score
  const goalTokens = goal.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  let goalHits = 0;
  for (const gt of goalTokens) {
    if (text.includes(gt)) goalHits++;
  }
  const coherencePenalty = Math.round((1 - (doc.domainCoherence?.score ?? 0.5)) * 45);
  const goalFit = topicalMatch.passes ? Math.min(100, Math.max(10, Math.round((goalHits / Math.max(1, goalTokens.length)) * 90 + 10) - coherencePenalty)) : 0;

  const reproducibilityScore = doc.enrichedMetadata?.reproducibility?.score || 'low';
  const reproducibilityBonus = reproducibilityScore === 'high' ? 10 : reproducibilityScore === 'medium' ? 5 : 0;

  // 4. Evidence Quality (citations, venue, DOI credibility)
  const citations = doc.metadata?.citationCount || 0;
  const authorityPrior = Math.min(25, Math.round(Math.log10(citations + 1) * 8));
  const artifactScore = (doc.enrichedMetadata?.reproducibility?.score === 'high' ? 20 : doc.enrichedMetadata?.reproducibility?.score === 'medium' ? 10 : 0)
    + (text.includes('benchmark') || text.includes('evaluation') ? 10 : 0)
    + (text.includes('theorem') || text.includes('proof') || text.includes('derivation') ? 10 : 0);
  let evidenceQuality = Math.min(100, 55 + artifactScore + authorityPrior);

  // 5. Synthesize Why Useful Explanation
  const primaryRole = roles[0];
  let whyUseful = '';
  switch (primaryRole) {
    case 'foundational':
      whyUseful = `Provides essential theoretical grounding, taxonomy, and survey of prior art for ${concepts[0] || 'the domain'}.`;
      break;
    case 'dataset':
      whyUseful = `Supplies empirical datasets and standard evaluation benchmarks for testing and reproducing results.`;
      break;
    case 'implementation':
      whyUseful = `Provides practical architectural blueprints, working code, and deployment methods.`;
      break;
    case 'applied':
    default:
      whyUseful = `Introduces proven methodologies, experimental validations, and algorithms directly applicable to your goal.`;
      break;
  }

  const evidence = [
    {
      id: `ev_${doc.id}_0`,
      documentId: doc.id,
      need: searchPlan.evidenceNeeds?.[0]?.type || 'methodology',
      finding: doc.abstract ? doc.abstract.slice(0, 180) + '...' : 'Presents key domain findings in ' + doc.title,
      credibility: evidenceQuality > 80 ? 'high' : 'medium',
      extractedBy: 'deterministic',
    },
  ];

  return {
    documentId: doc.id,
    searchPlanId: searchPlan.query,
    relevance,
    goalFit: Math.min(100, goalFit + reproducibilityBonus),
    domainValidity: Math.round((doc.domainCoherence?.score || 0.5) * 100),
    reproducibilityBonus,
    evidenceQuality,
    authorityPrior,
    topicalMatch,
    semanticScore,
    contribution: {
      documentId: doc.id,
      goal,
      contributions: [
        {
          type: primaryRole,
          description: whyUseful,
          evidenceIds: [evidence[0].id],
        },
      ],
    },
    roles,
    explanation: whyUseful,
    evidence,
    confidence: 0.85,
    _evaluatedBy: 'deterministic',
  };
}

/**
 * Evaluates a batch of up to 5 documents using AI with fallback.
 * @param {Array<Object>} batchDocs
 * @param {Object} searchPlan
 * @returns {Promise<Array<Object>>}
 */
async function evaluateBatchWithAI(batchDocs, searchPlan) {
  const docsForPrompt = batchDocs.map((d) => ({
    id: d.id,
    title: d.title,
    type: d.type,
    authors: (d.metadata?.authors || []).slice(0, 3).join(', '),
    abstract: (d.abstract || '').slice(0, 400),
    citations: d.metadata?.citationCount || 0,
  }));

  const messages = [
    { role: 'system', content: buildEvaluationPrompt(searchPlan) },
    { role: 'user', content: JSON.stringify(docsForPrompt, null, 2) },
  ];

  const rawAi = await generateCompletion(messages, {
    temperature: 0.1,
    max_tokens: 2200,
    timeoutMs: 4000,
  });

  if (rawAi) {
    const parsed = repairAndParseJSON(rawAi);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const evalMap = new Map();
      for (const item of parsed) {
        if (item && item.documentId) {
          evalMap.set(item.documentId, item);
        }
      }

      return batchDocs.map((doc) => {
        const found = evalMap.get(doc.id);
        if (found) {
          const evidenceItems = (found.evidence || []).map((ev, i) => ({
            id: `ev_${doc.id}_${i}`,
            documentId: doc.id,
            need: ev.need || 'methodology',
            finding: ev.finding || found.whyUseful || '',
            credibility: ev.credibility || 'high',
            extractedBy: 'ai',
          }));

          return {
            documentId: doc.id,
            searchPlanId: searchPlan.query,
            relevance: Math.min(100, Math.max(0, found.relevance || 80)),
            goalFit: Math.min(100, Math.max(0, found.goalFit || 80)),
            domainValidity: Math.min(100, Math.max(0, found.domainValidity || Math.round((doc.domainCoherence?.score || 0.5) * 100))),
            reproducibilityBonus: Math.min(10, Math.max(0, found.reproducibilityBonus || 0)),
            evidenceQuality: Math.min(100, Math.max(0, found.evidenceQuality || 80)),
            contribution: {
              documentId: doc.id,
              goal: searchPlan.intent.goal,
              contributions: [
                {
                  type: (found.roles && found.roles[0]) || 'applied',
                  description: found.whyUseful || 'Useful domain reference.',
                  evidenceIds: evidenceItems.map((e) => e.id),
                },
              ],
            },
            roles: Array.isArray(found.roles) && found.roles.length ? found.roles : ['applied'],
            explanation: found.whyUseful || 'Relevant paper supporting your research goal.',
            evidence: evidenceItems,
            confidence: found.confidence || 0.9,
            _evaluatedBy: 'ai',
          };
        }
        return evaluateDocumentDeterministically(doc, searchPlan);
      });
    }
  }

  console.info('[Document Evaluator] AI evaluation unavailable; using deterministic evaluation.');
  return batchDocs.map((doc) => evaluateDocumentDeterministically(doc, searchPlan));
}

/**
 * Evaluates candidate documents against the SearchPlan.
 * @param {Array<Object>} candidates
 * @param {Object} searchPlan
 * @returns {Promise<Array<{document: Object, evaluation: Object}>>}
 */
async function evaluateDocuments(candidates, searchPlan) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const queryKey = searchPlan.query.toLowerCase().trim();
  const results = [];
  const uncached = [];

  // Check Cache
  for (const doc of candidates) {
    const cacheKey = `${doc.id}::${queryKey}`;
    const cachedEval = evaluationCache.get(cacheKey);
    if (cachedEval) {
      results.push({ document: doc, evaluation: cachedEval });
    } else {
      uncached.push(doc);
    }
  }

  // Process uncached in batches of 5
  const BATCH_SIZE = 5;
  const batches = [];
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    batches.push(uncached.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const batchEvals = await evaluateBatchWithAI(batch, searchPlan);
    for (let i = 0; i < batch.length; i++) {
      const doc = batch[i];
      const evaluation = batchEvals[i] || evaluateDocumentDeterministically(doc, searchPlan);
      const cacheKey = `${doc.id}::${queryKey}`;
      evaluationCache.set(cacheKey, evaluation);
      results.push({ document: doc, evaluation });
    }
  }

  return results;
}

module.exports = {
  evaluateDocuments,
  evaluateDocumentDeterministically,
  buildEvaluationPrompt,
};
