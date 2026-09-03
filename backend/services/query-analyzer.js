/**
 * query-analyzer.js - Domain-aware query interpretation without domain gatekeeping.
 */

const { generateCompletion, repairAndParseJSON } = require('./ai-client');

const cache = new Map();
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'want', 'build', 'find', 'how', 'what', 'where', 'does', 'are']);

function inferIntent(query) {
  const text = query.toLowerCase();
  if (/\b(codebase|repository|repo|software|implementation)\b/.test(text)) return 'building';
  if (/\b(evaluate|evidence|compare|versus|vs|assess|validate)\b/.test(text)) return 'evaluation';
  if (/\b(build|implement|create|develop|code|model|system)\b/.test(text)) return 'building';
  if (/\b(learn|how to|guide|tutorial|diagnos|what is)\b/.test(text)) return 'learning';
  if (/\b(understand|why|explain|meaning)\b/.test(text)) return 'understanding';
  return 'researching';
}

function inferDomain(query) {
  const text = query.toLowerCase();
  const rules = [
    ['clinical', /bipolar|diagnos|patient|treatment|disease|clinical|health|medical|therapy/],
    ['computer-science', /llm|language model|machine learning|software|algorithm|code|neural|ai|dataset|computer/],
    ['biology', /protein|antibody|gene|cell|genomic|biolog/],
    ['physics', /quantum|particle|cosmology|relativity|physics/],
    ['psychology', /behavior|cognitive|emotion|psycholog|mental/],
  ];
  const match = rules.find(([, pattern]) => pattern.test(text));
  return { primary: match ? match[0] : 'general-research', secondary: [], confidence: match ? 0.82 : 0.42 };
}

function buildFallback(originalQuery) {
  const normalized = originalQuery.toLowerCase();
  const phraseConcepts = [];
  if (/speed\s+read|speed-reading|speedreading/.test(normalized)) phraseConcepts.push('speed reading');
  if (/jarvis/.test(normalized)) phraseConcepts.push('jarvis');
  if (/codebase|repository|repo/.test(normalized)) phraseConcepts.push('codebase');
  const tokens = originalQuery.replace(/[^a-z0-9\s-]/gi, ' ').split(/\s+/).filter((token) => token.length > 3 && !STOP_WORDS.has(token.toLowerCase()));
  const intentType = inferIntent(originalQuery);
  const domain = inferDomain(originalQuery);
  return {
    originalQuery,
    domain,
    intent: { type: intentType, confidence: 0.82 },
    goal: { statement: originalQuery, specificity: tokens.length > 6 ? 'specific' : 'broad' },
    evidenceNeeds: [
      { type: 'methodology', criticality: 'must-have' },
      { type: 'benchmark', criticality: 'nice-to-have' },
      { type: 'implementation', criticality: intentType === 'building' ? 'must-have' : 'nice-to-have' },
      { type: 'dataset', criticality: intentType === 'building' ? 'must-have' : 'nice-to-have' },
    ],
    ambiguities: [],
    adjacentDomains: domain.primary === 'clinical' ? [{ domain: 'psychology', relevance: 'high', reason: 'Clinical diagnosis often draws on behavioral and cognitive evidence.' }] : [],
    concepts: [...phraseConcepts, ...tokens].filter((token, index, all) => all.indexOf(token.toLowerCase()) === index).slice(0, 6),
    extractionMethod: 'deterministic',
  };
}

async function analyzeQuery(originalQuery) {
  const query = originalQuery.trim();
  const key = query.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const fallback = buildFallback(query);
  const messages = [{ role: 'system', content: 'Analyze the user query and return only JSON with domain {primary,secondary,confidence}, intent {type,confidence}, goal {statement,specificity}, evidenceNeeds, ambiguities, adjacentDomains. Do not reject unexpected domains.' }, { role: 'user', content: query }];
  try {
    const response = await generateCompletion(messages, { temperature: 0.1, max_tokens: 900, timeoutMs: 1800 });
    const parsed = response && repairAndParseJSON(response);
    if (parsed?.domain && parsed?.intent && parsed?.goal) {
      const result = { ...fallback, ...parsed, originalQuery: query, concepts: fallback.concepts };
      cache.set(key, result);
      return result;
    }
  } catch (error) { /* deterministic fallback */ }
  cache.set(key, fallback);
  return fallback;
}

module.exports = { analyzeQuery, buildFallback, inferDomain, inferIntent };
