/**
 * discovery-ranker.js — Goal-Relative Discovery Ranker with Diversity Constraints.
 *
 * Replaces naive relevance sorting with:
 * Score = 0.5 * goalFit + 0.3 * relevance + 0.2 * evidenceQuality - redundancyPenalty
 *
 * Enforces role diversity across foundational, applied, implementation,
 * dataset, and alternative perspectives, returning top 15-25 curated results.
 */

const WEIGHT_GOAL_FIT = 0.5;
const WEIGHT_RELEVANCE = 0.3;
const WEIGHT_QUALITY = 0.2;
const { calibrateFeatures, getCalibrationModel } = require('./calibrated-reranker');

/**
 * Extracts first author surname for redundancy checking.
 * @param {Object} doc
 * @returns {string}
 */
function getFirstAuthorKey(doc) {
  const authors = doc.metadata?.authors || doc.authors || [];
  if (!authors.length) return 'unknown';
  const first = authors[0].trim().split(/\s+/);
  return first[first.length - 1].toLowerCase();
}

function getRoleOrder(intentType) {
  const orders = {
    learning: ['foundational', 'applied', 'implementation', 'dataset', 'alternative'],
    building: ['implementation', 'applied', 'dataset', 'foundational', 'alternative'],
    understanding: ['foundational', 'applied', 'alternative', 'implementation', 'dataset'],
    evaluation: ['applied', 'foundational', 'implementation', 'alternative', 'dataset'],
    researching: ['foundational', 'alternative', 'applied', 'implementation', 'dataset'],
  };
  return orders[intentType] || orders.researching;
}

/**
 * Ranks evaluated documents using goal-fit, relevance, quality, and diversity constraints.
 * @param {Array<{document: Object, evaluation: Object}>} evaluatedDocs
 * @param {Object} searchPlan
 * @param {number} targetLimit (default 20, clamp 5 to 30)
 * @returns {Array<Object>} DiscoveryResult[]
 */
function rankForDiscovery(evaluatedDocs, searchPlan, targetLimit = 20) {
  if (!Array.isArray(evaluatedDocs) || evaluatedDocs.length === 0) {
    return [];
  }

  const limit = Math.max(5, Math.min(30, targetLimit || 20));

  // Compute Base Scores
  const scored = evaluatedDocs.map(({ document, evaluation }) => {
    const goalFit = evaluation.goalFit || 50;
    const relevance = evaluation.relevance || 50;
    const quality = evaluation.evidenceQuality || 50;
    const coherence = evaluation.domainValidity || document.domainCoherence?.score * 100 || 50;

    const baseScore =
      WEIGHT_GOAL_FIT * goalFit +
      WEIGHT_RELEVANCE * relevance +
      WEIGHT_QUALITY * quality + coherence * 0.1;
    const convergenceBonus = Math.min(8, Math.max(0, (document.subqueryIndexes?.length || 0) - 1) * 4);

    const primaryRole = (evaluation.roles && evaluation.roles[0]) || 'applied';
    const topicalGate = evaluation.relevance > 0 && (evaluation.topicalMatch?.passes !== false);
    const calibratedProbability = calibrateFeatures({ relevance, goalFit, evidenceQuality: quality, semanticScore: evaluation.semanticScore || relevance, coherence });

    return {
      document,
      evaluation,
      baseScore: topicalGate ? (calibratedProbability === null ? baseScore : calibratedProbability * 100) + convergenceBonus : -Infinity,
      finalScore: baseScore,
      role: primaryRole,
      authorKey: getFirstAuthorKey(document),
      calibratedProbability,
    };
  });

  // Sort by base score descending
  scored.sort((a, b) => b.baseScore - a.baseScore);

  // Apply Diversity Constraint (Iterative Selection with Redundancy Penalty)
  const selected = [];
  const remaining = [...scored];
  const roleCounts = new Map();
  const authorCounts = new Map();

  // Seed role diversity only after relevance and coherence have been established.
  const expectedRoles = getRoleOrder(searchPlan.intent?.type);

  for (const role of expectedRoles) {
    if (selected.length >= limit) break;
    const idx = remaining.findIndex((item) => item.role === role && item.evaluation.relevance >= 45 && (item.document.domainCoherence?.score || 0) >= 0.4);
    if (idx !== -1) {
      const item = remaining.splice(idx, 1)[0];
      selected.push(item);
      roleCounts.set(item.role, (roleCounts.get(item.role) || 0) + 1);
      authorCounts.set(item.authorKey, (authorCounts.get(item.authorKey) || 0) + 1);
    }
  }

  // 2. Greedy selection with redundancy penalty for remaining slots
  while (selected.length < limit && remaining.length > 0) {
    // Recalculate dynamic penalties
    for (const item of remaining) {
      const currentRoleCount = roleCounts.get(item.role) || 0;
      const currentAuthorCount = authorCounts.get(item.authorKey) || 0;

      // Penalize over-saturation of single role (after 5 documents in same role)
      let rolePenalty = 0;
      if (currentRoleCount >= 6) rolePenalty = (currentRoleCount - 5) * 6;

      // Penalize multiple papers from same author
      let authorPenalty = 0;
      if (currentAuthorCount >= 2 && item.authorKey !== 'unknown') {
        authorPenalty = (currentAuthorCount - 1) * 12;
      }

      item.finalScore = item.baseScore - rolePenalty - authorPenalty;
    }

    remaining.sort((a, b) => b.finalScore - a.finalScore);
    const chosen = remaining.shift();
    selected.push(chosen);

    roleCounts.set(chosen.role, (roleCounts.get(chosen.role) || 0) + 1);
    authorCounts.set(chosen.authorKey, (authorCounts.get(chosen.authorKey) || 0) + 1);
  }

  // Format into final DiscoveryResult[]
  return selected.map((item, idx) => {
    const doc = item.document;
    const evaluation = item.evaluation;

    // Aggregate discoveredVia from provenance
    const discoveredVia = (doc.provenance?.providers || []).map((p) => {
      if (p.provider === 'company' && p.source) {
        return `Company: ${p.source.toUpperCase()}`;
      }
      if (p.provider === 'crossref') return 'Crossref';
      if (p.provider === 'dataset') return `Dataset: ${(p.source || 'source').toUpperCase()}`;
      if (p.provider === 'code') return `Code: ${(p.source || 'source').toUpperCase()}`;
      if (p.provider === 'patent') return `Patent: ${(p.source || 'source').toUpperCase()}`;
      if (p.provider === 'grant') return `Grant: ${(p.source || 'source').toUpperCase()}`;
      return 'OpenAlex';
    });

    const uniqueVia = Array.from(new Set(discoveredVia));
    if (!uniqueVia.length) uniqueVia.push('OpenAlex');

    const primaryUrl = doc.canonicalUrl || doc.url || (doc.metadata?.doi ? `https://doi.org/${doc.metadata.doi}` : '#');
    const openAccess = Boolean(doc.access?.openAccess || doc.metadata?.openAccess);

    return {
      rank: idx + 1,
      document: doc,
      evaluation,
      evidence: evaluation.evidence || [],
      whyUseful: evaluation.explanation || 'Provides key reference material for your research goal.',
      role: item.role,
      accessPath: {
        url: primaryUrl,
        openAccess,
        provider: uniqueVia[0],
      },
      discoveredVia: uniqueVia,
      calibration: { probability: item.calibratedProbability, model: getCalibrationModel().trained ? 'review-calibrated' : 'deterministic-fallback' },
    };
  });
}

module.exports = {
  rankForDiscovery,
  WEIGHT_GOAL_FIT,
  WEIGHT_RELEVANCE,
  WEIGHT_QUALITY,
};
