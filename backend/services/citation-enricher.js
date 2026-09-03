/**
 * citation-enricher.js - OpenAlex citation counts, momentum, and deterministic context.
 */

const { reconstructAbstract } = require('./openalex');
const persistentCache = require('../utils/persistent-cache');
const { recordSnapshot } = require('./citation-snapshots');
const cache = new Map();
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONTEXT_REQUESTS = 8;

function classifyCitation(text = '') {
  const lower = text.toLowerCase();
  if (/contradict|fails to|in contrast|challenge|dispute|disagree/.test(lower)) return 'contrasts';
  if (/extend|improve|build on|build upon|enhance|further develop/.test(lower)) return 'extends';
  if (/support|confirm|consistent with|demonstrate the effectiveness/.test(lower)) return 'supports';
  return 'mentions';
}

function classifyCitationContext(text = '', targetTitle = '') {
  const lower = `${text} ${targetTitle}`.toLowerCase();
  if (/critic|limitation|fail|however|challenge|contradict/.test(lower)) return 'critical';
  if (/implement|use|using|adopt|baseline|architecture|train|dataset|benchmark|method/.test(lower)) return 'methodological';
  if (/compare|comparison|versus|outperform|ablation|evaluate|evaluation/.test(lower)) return 'comparative';
  if (/background|review|survey|historical|introduced|proposed/.test(lower)) return 'foundational';
  return 'mention';
}

function historicalMomentum(countsByYear = [], fieldFactor = 1) {
  const timeline = countsByYear.filter((point) => point && point.year && Number.isFinite(point.cited_by_count)).map((point) => ({ year: point.year, citations: point.cited_by_count }));
  const recent = timeline.slice(-3);
  const deltas = recent.slice(1).map((point, index) => point.citations - recent[index].citations);
  const acceleration = deltas.length > 1 ? deltas[deltas.length - 1] - deltas[deltas.length - 2] : 0;
  const latest = recent[recent.length - 1]?.citations || 0;
  return { timeline, latestYearCitations: latest, fieldNormalizedVelocity: Number((latest / fieldFactor).toFixed(1)), acceleration, accelerating: acceleration > 0 };
}

function fallbackCitationContext(doc) {
  const year = parseInt((doc.date || doc.metadata?.published || '').slice(0, 4), 10);
  const currentYear = new Date().getFullYear();
  const age = Math.max(1, currentYear - (year || currentYear));
  const count = doc.metadata?.citationCount || 0;
  const citesPerYear = Math.round(count / age);
  const text = `${doc.title || ''} ${doc.abstract || ''}`.toLowerCase();
  const field = /psycholog|behavior|humanit|history|literature|law/.test(text) ? 'slower-accumulation' : /medical|clinical|biology|health/.test(text) ? 'biomedical' : /computer|machine learning|neural|algorithm/.test(text) ? 'computer-science' : 'general';
  const fieldFactor = { 'slower-accumulation': 0.55, biomedical: 1.1, 'computer-science': 1.2, general: 1 }[field];
  const fieldNormalizedVelocity = Number((citesPerYear / fieldFactor).toFixed(1));
  const trend = citesPerYear > 100 ? 'rising' : citesPerYear > 10 ? 'stable' : 'declining';
  return {
    citationCount: count,
    citedBy: { supports: [], extends: [], contrasts: [], mentions: [] },
    cites: { foundational: [], methodological: [], comparative: [] },
    momentum: { citesPerYear, fieldNormalizedVelocity, field, ageYears: age, accelerating: trend === 'rising', trend },
    authority: { rawCitationCount: count, prior: Math.min(1, Math.log10(count + 1) / 6), role: count > 1000 ? 'legacy-authority' : 'emerging-authority' },
    acceptance: { score: Math.min(98, Math.round(45 + Math.min(50, citesPerYear / 4))), position: count > 1000 ? 'mature' : count > 100 ? 'emerging' : 'foundational', confidence: 0.45 },
    extractionMethod: 'deterministic',
  };
}

async function enrichCitationContext(doc) {
  const key = doc.metadata?.doi || doc.id;
  const memoryCached = cache.get(key);
  if (memoryCached && Date.now() - memoryCached.timestamp < TTL_MS) return memoryCached.value;
  const diskCached = persistentCache.get('citations', key, TTL_MS);
  if (diskCached) {
    cache.set(key, { timestamp: Date.now(), value: diskCached });
    return diskCached;
  }
  let result = fallbackCitationContext(doc);
  const doi = doc.metadata?.doi;
  if (doi && ['paper', 'book', 'report'].includes(doc.type)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        const work = await response.json();
        const count = work.cited_by_count || result.citationCount;
        const year = work.publication_year || new Date().getFullYear();
        const citesPerYear = Math.round(count / Math.max(1, new Date().getFullYear() - year));
        const fieldNormalizedVelocity = Number((citesPerYear / (result.momentum.field === 'computer-science' ? 1.2 : result.momentum.field === 'biomedical' ? 1.1 : result.momentum.field === 'slower-accumulation' ? 0.55 : 1)).toFixed(1));
        const historical = historicalMomentum(work.counts_by_year, result.momentum.field === 'computer-science' ? 1.2 : result.momentum.field === 'biomedical' ? 1.1 : result.momentum.field === 'slower-accumulation' ? 0.55 : 1);
        recordSnapshot(work.id, historical.timeline);
        result = { ...result, citationCount: count, timeline: historical.timeline, momentum: { ...result.momentum, ...historical, citesPerYear, fieldNormalizedVelocity, ageYears: Math.max(1, new Date().getFullYear() - year), trend: citesPerYear > 100 ? 'rising' : citesPerYear > 10 ? 'stable' : 'declining' }, authority: { rawCitationCount: count, prior: Math.min(1, Math.log10(count + 1) / 6), role: count > 1000 ? 'legacy-authority' : 'emerging-authority' }, acceptance: { ...result.acceptance, score: Math.min(98, Math.round(45 + Math.min(50, citesPerYear / 4))), confidence: 0.7 } };
        if (work.id && contextBudgetRemaining > 0) {
          contextBudgetRemaining--;
          const workId = work.id.split('/').pop();
          const contextController = new AbortController();
          const contextTimer = setTimeout(() => contextController.abort(), 1200);
          const contextResponse = await fetch(`https://api.openalex.org/works?filter=cites:${encodeURIComponent(workId)}&per-page=5&select=id,title,abstract_inverted_index,publication_year`, { headers: { Accept: 'application/json' }, signal: contextController.signal }).finally(() => clearTimeout(contextTimer));
          if (contextResponse.ok) {
            const citingWorks = await contextResponse.json();
            const contexts = (citingWorks.results || []).map((citingWork) => {
              const text = `${citingWork.title || ''} ${reconstructAbstract(citingWork.abstract_inverted_index)}`;
              return { id: citingWork.id, title: citingWork.title, year: citingWork.publication_year, classification: classifyCitationContext(text, work.title) };
            });
            const counts = contexts.reduce((summary, context) => ({ ...summary, [context.classification]: (summary[context.classification] || 0) + 1 }), {});
            result = { ...result, contextAnalysis: { sampleSize: contexts.length, counts, contexts, confidence: contexts.length ? 0.55 : 0.2, extractionMethod: 'openalex-citing-work-sample' } };
          }
        }
      }
    } catch (error) { /* graceful fallback */ }
  }
  cache.set(key, { timestamp: Date.now(), value: result });
  persistentCache.set('citations', key, result);
  return result;
}

let contextBudgetRemaining = MAX_CONTEXT_REQUESTS;
async function enrichCitationContexts(documents) {
  contextBudgetRemaining = MAX_CONTEXT_REQUESTS;
  return Promise.all(documents.map(async (doc) => ({ ...doc, citationContext: await enrichCitationContext(doc) })));
}

module.exports = { enrichCitationContext, enrichCitationContexts, classifyCitation, classifyCitationContext, historicalMomentum, MAX_CONTEXT_REQUESTS };
