const crypto = require('crypto');
const { searchWorks } = require('./openalex');
const { normalizeWorks } = require('../utils/normalize');
const { enrichDocuments } = require('./data-enricher');
const { extractEvidenceBatch } = require('./evidence-extractor');
const { enrichCitationContexts } = require('./citation-enricher');
const { resolvePaper } = require('./paper-resolver');
const { createInvestigation } = require('../models/investigation');
const { classifyRelationships, relationshipToEvidenceType } = require('./relationship-classifier');

function hashId(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function makeClaims(paper, extracted) {
  const claims = [
    ...(extracted.claims?.primary || []).map((text) => ({ text, type: 'quantitative', certainty: 'reported' })),
    ...(extracted.claims?.supporting || []).map((text) => ({ text, type: 'qualitative', certainty: 'reported' })),
  ];
  if (!claims.length && paper.abstract) {
    claims.push({ text: paper.abstract.split(/[.!?]/)[0].trim(), type: 'qualitative', certainty: 'reported' });
  }
  return claims.map((claim, index) => ({ id: `${paper.id}:claim:${index + 1}`, ...claim, evidence: [], contradictions: [] }));
}

function attachClaimRelations(claims, evidence, contradictions) {
  if (!claims.length) return;
  const claimFor = (text) => {
    const words = String(text || '').toLowerCase().split(/\W+/).filter((word) => word.length > 4);
    return claims.reduce((best, claim) => {
      const score = words.filter((word) => claim.text.toLowerCase().includes(word)).length;
      return score > best.score ? { claim, score } : best;
    }, { claim: claims[0], score: 0 }).claim;
  };
  evidence.forEach((item) => claimFor(item.description).evidence.push(item));
  contradictions.forEach((item) => claimFor(item.specificFinding || item.text).contradictions.push(item));
}

async function investigate(paperInput) {
  const resolved = await resolvePaper(paperInput);
  const related = await searchWorks(resolved.paper.title, 20).catch(() => ({ results: [] }));
  const candidates = normalizeWorks(related.results || [])
    .filter((document) => document.id !== resolved.document.id)
    .slice(0, 12);
  const enriched = await enrichDocuments(candidates);
  const extractedCandidates = extractEvidenceBatch(enriched);
  const citedCandidates = await enrichCitationContexts(extractedCandidates);
  const originalEvidence = extractEvidenceBatch([resolved.document])[0].extractedEvidence;
  const claims = makeClaims(resolved.paper, originalEvidence);
  const classifications = await classifyRelationships(citedCandidates, resolved.paper);
  const classifiedCandidates = citedCandidates.map((document) => ({
    document,
    classification: classifications.get(document.id),
  }));
  const evidence = classifiedCandidates
    .filter(({ classification }) => classification.relationship !== 'contradict')
    .map(({ document, classification }) => ({
    id: `${resolved.paper.id}:evidence:${document.id}`,
    type: relationshipToEvidenceType(classification.relationship),
    relationship: classification.relationship,
    confidence: classification.confidence,
    sourcePaper: {
      id: document.id,
      title: document.title,
      published: document.metadata?.published || document.date || null,
      url: document.canonicalUrl,
    },
    description: document.extractedEvidence?.findings?.[0] || classification.reason,
    certaintyLevel: classification.relationship === 'support' ? 'reported' : 'unknown',
    source: document.canonicalUrl,
    extractionMethod: document.citationContext?.extractionMethod || 'deterministic',
  }));
  const contradictions = classifiedCandidates
    .filter(({ classification }) => classification.relationship === 'contradict')
    .map(({ document, classification }) => ({
      id: `${resolved.paper.id}:contradiction:${document.id}`,
      claimId: claims[0]?.id || null,
      investigationId: resolved.paper.id,
      text: classification.reason,
      sourcePaper: {
        id: document.id,
        title: document.title,
        published: document.metadata?.published || document.date || null,
        url: document.canonicalUrl,
      },
      specificFinding: document.extractedEvidence?.findings?.[0] || classification.reason,
      severity: classification.confidence >= 0.8 ? 'significant_limitation' : 'minor_limitation',
      dateFound: new Date().toISOString(),
    }));
  const followUps = classifiedCandidates
    .filter(({ classification }) => classification.relationship !== 'context')
    .map(({ document, classification }) => ({
    investigationId: resolved.paper.id,
    originalPaperId: resolved.paper.id,
    followUpPaperId: document.id,
    type: classification.relationship,
    description: document.title,
    relationship: 'Related work found through title and citation discovery.',
    published: document.metadata?.published || document.date || null,
  }));
  if (contradictions.length && claims[0]) claims[0].certainty = 'contradicted';
  else if (evidence.some((item) => item.relationship === 'support')) claims[0] && (claims[0].certainty = 'established');
  attachClaimRelations(claims, evidence, contradictions);
  return createInvestigation({
    id: `inv_${hashId(resolved.paper.id)}`,
    paper: resolved.paper,
    claims,
    evidence,
    contradictions,
    followUps,
    implementations: originalEvidence.implementationResources?.code || [],
    dependencies: originalEvidence.data?.datasets || [],
  });
}

module.exports = { investigate };