/**
 * search-policy.js - Intent-driven retrieval lanes. Priors bias retrieval; they do not gate domains.
 */

function generateRetrievalLanes(analysis) {
  const goal = analysis.goal.statement;
  const domain = analysis.domain.primary;
  const intent = analysis.intent.type;
  const lanes = [];
  if (intent === 'learning') lanes.push({ name: 'Domain Foundation', providers: ['openalex', 'crossref'], queries: [{ base: `${goal} survey` }, { base: `${goal} review` }], priority: 'primary' });
  if (intent === 'building') lanes.push({ name: 'Methods & Implementation', providers: ['openalex', 'code'], queries: [{ base: goal }, { base: `${goal} implementation` }], priority: 'primary' });
  if (intent === 'evaluation') lanes.push({ name: 'Evidence & Validation', providers: ['openalex', 'crossref'], queries: [{ base: `${goal} evidence` }, { base: `${goal} benchmark` }], priority: 'primary' });
  if (intent === 'understanding' || intent === 'researching') lanes.push({ name: 'Core Evidence', providers: ['openalex', 'crossref'], queries: [{ base: goal }], priority: 'primary' });
  lanes.push({ name: 'Datasets & Resources', providers: ['datasets', 'code'], queries: [{ base: `${goal} dataset` }], priority: intent === 'building' || intent === 'researching' ? 'primary' : 'secondary' });
  if (domain === 'clinical' || analysis.adjacentDomains?.length) lanes.push({ name: 'Adjacent Domain Validation', providers: ['openalex'], queries: [{ base: `${goal} ${domain}` }], priority: 'secondary' });
  return lanes;
}

function generateSearchPolicy(analysis) {
  const currentYear = new Date().getFullYear();
  const hardTerms = (analysis.goal.statement.match(/[a-z0-9-]{5,}/gi) || []).slice(0, 5).map((term) => term.toLowerCase());
  return {
    lanes: generateRetrievalLanes(analysis),
    hardConstraints: { mustIncludeTerms: hardTerms, mustExcludeTerms: analysis.ambiguities?.flatMap((item) => (item.possibleMeanings || []).filter((meaning) => meaning !== item.likelyMeaning)) || [], minRecency: analysis.domain.primary === 'clinical' ? 2010 : 2000 },
    softPriors: { preferredDomains: [analysis.domain.primary, ...(analysis.domain.secondary || [])], preferredSourceTypes: analysis.intent.type === 'building' ? ['code', 'report', 'paper'] : ['journal', 'review', 'paper'], preferredProviders: ['openalex', 'crossref', ...(analysis.intent.type === 'building' ? ['code', 'datasets'] : [])], penalizeTerms: ['hypothetical', 'fictional'] },
    generatedAt: new Date().toISOString(),
    constraintsYear: currentYear,
  };
}

module.exports = { generateSearchPolicy, generateRetrievalLanes };
