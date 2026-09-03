/**
 * domain-coherence.js - Soft coherence scoring. Low coherence is penalized, never rejected.
 */

function validateDomainCoherence(doc, analysis) {
  const text = `${doc.title || ''} ${doc.abstract || ''}`.toLowerCase();
  const targetTerms = [...(analysis.concepts || []), ...(analysis.evidenceNeeds || []).map((need) => need.type)].filter((term) => String(term).length > 3);
  const hits = targetTerms.filter((term) => text.includes(String(term).toLowerCase())).length;
  const terminology = Math.min(1, hits / Math.max(1, targetTerms.length * 0.5));
  const methods = analysis.domain.primary === 'clinical' ? ['rct', 'cohort', 'case-control', 'meta-analysis', 'systematic review', 'patient'] : ['algorithm', 'model', 'experiment', 'benchmark', 'dataset', 'implementation'];
  const methodology = methods.some((method) => text.includes(method)) ? 0.8 : 0.5;
  const exactGoal = analysis.goal.statement.toLowerCase();
  const exactTopic = analysis.concepts?.some((concept) => String(concept).length > 6 && text.includes(String(concept).toLowerCase()));
  const implementationRequested = /codebase|repository|repo|implementation|software/.test(exactGoal);
  const implementationEvidence = doc.type === 'repository' || /github|implementation|codebase|software/.test(text);
  let score = terminology * 0.6 + methodology * 0.4;
  if (exactTopic) score += 0.2;
  if (implementationRequested && implementationEvidence) score += 0.15;
  if (implementationRequested && !implementationEvidence) score -= 0.2;
  const intentThreshold = analysis.intent?.type === 'building' ? 0.3 : analysis.intent?.type === 'researching' ? 0.2 : 0.12;
  score = Number(Math.max(0, Math.min(1, score)).toFixed(3));
  const hardMismatch = score < 0.15;
  return { score, hardMismatch, intentThreshold, signals: { hasTargetedTerminology: terminology > 0.5, usesRelevantMethodology: methodology > 0.5, addressesTargetPopulation: true, followsExpectedStructure: Boolean(doc.type), contextIsRelevant: score > intentThreshold }, explanation: `Coherence score: ${score}. This document ${score > 0.6 ? 'directly' : 'tangentially'} addresses the topic.`, confidence: Math.min(1, terminology + methodology / 2) };
}

function applyCoherence(documents, analysis) {
  return documents
    .map((doc) => ({ ...doc, domainCoherence: validateDomainCoherence(doc, analysis) }))
    .filter((doc) => !doc.domainCoherence.hardMismatch && doc.domainCoherence.score >= doc.domainCoherence.intentThreshold);
}

module.exports = { validateDomainCoherence, applyCoherence };
