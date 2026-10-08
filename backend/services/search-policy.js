/**
 * search-policy.js - Intent-driven retrieval lanes. Priors bias retrieval; they do not gate domains.
 */

function generateRetrievalLanes(analysis) {
  const goal = analysis.goal.statement;
  const domain = analysis.domain.primary;
  const intent = analysis.intent.type;
  const lanes = [];
  const domains = detectInterdisciplinaryDomains(analysis.originalQuery || analysis.goal.statement);
  const providerEligibility = getProviderEligibility(analysis.originalQuery || analysis.goal.statement, analysis);
  if (intent === 'learning') lanes.push({ name: 'Domain Foundation', providers: ['openalex', 'crossref'], queries: [{ base: `${goal} survey` }, { base: `${goal} review` }], priority: 'primary' });
  if (intent === 'building') lanes.push({ name: 'Methods & Implementation', providers: ['openalex', 'code'], queries: [{ base: goal }, { base: `${goal} implementation` }], priority: 'primary' });
  if (intent === 'evaluation') lanes.push({ name: 'Evidence & Validation', providers: ['openalex', 'crossref'], queries: [{ base: `${goal} evidence` }, { base: `${goal} benchmark` }], priority: 'primary' });
  if (intent === 'understanding' || intent === 'researching') lanes.push({ name: 'Core Evidence', providers: ['openalex', 'crossref'], queries: [{ base: goal }], priority: 'primary' });
  lanes.push({ name: 'Datasets & Resources', providers: ['datasets', 'code'], queries: [{ base: `${goal} dataset` }], priority: intent === 'building' || intent === 'researching' ? 'primary' : 'secondary' });
  if (domain === 'clinical' || analysis.adjacentDomains?.length) lanes.push({ name: 'Adjacent Domain Validation', providers: ['openalex'], queries: [{ base: `${goal} ${domain}` }], priority: 'secondary' });
  if (domains.length > 1) {
    for (const routedDomain of domains) {
      lanes.push({
        name: `${routedDomain} Evidence`,
        providers: routedDomain === 'chemistry' || routedDomain === 'biology'
          ? ['openalex', ...(providerEligibility.pubmed ? ['pubmed'] : [])]
          : ['openalex', 'external'],
        queries: [{ base: `${goal} ${routedDomain}` }],
        priority: 'primary',
      });
    }
  }
  return lanes;
}

function detectInterdisciplinaryDomains(query = '') {
  const text = String(query).toLowerCase();
  const domainKeywords = {
    ml: ['neural', 'network', 'learning', 'transformer', 'algorithm', 'model', 'graph', 'embedding'],
    chemistry: ['molecule', 'molecules', 'compound', 'chemical', 'reaction', 'drug', 'material', 'atom'],
    biology: ['gene', 'protein', 'cell', 'organism', 'biological', 'dna', 'enzyme', 'tissue'],
    physics: ['quantum', 'particle', 'field', 'energy', 'force', 'dynamics', 'physical'],
  };
  return Object.entries(domainKeywords).filter(([, keywords]) => keywords.some((keyword) => new RegExp(`\\b${keyword}\\b`).test(text))).map(([name]) => name);
}

function getProviderEligibility(query, analysis = {}) {
  const text = String(query || '').toLowerCase();
  const aiCsQuery = analysis.domain?.primary === 'computer-science'
    || /\b(ai|artificial intelligence|machine learning|ml|llm|rlhf|reinforcement learning|neural|network|transformer|algorithm|model|graph neural|interpretability|software|code|programming)\b/.test(text);
  const biomedicalQuery = analysis.domain?.primary === 'clinical' || analysis.domain?.primary === 'biology'
    || /\b(biomedical|clinical|medical|medicine|disease|patient|drug|pharmaceutical|pharma|protein|gene|genomic|cell|tissue|enzyme|therapeutic|pathogen|vaccine)\b/.test(text);
  const enabled = biomedicalQuery && !aiCsQuery;
  return {
    patents: enabled,
    pubmed: enabled,
    reason: enabled ? 'biomedical query' : aiCsQuery ? 'AI/CS query' : 'non-biomedical query',
  };
}

function generateSearchPolicy(analysis) {
  const currentYear = new Date().getFullYear();
  const hardTerms = (analysis.goal.statement.match(/[a-z0-9-]{5,}/gi) || []).slice(0, 5).map((term) => term.toLowerCase());
  const detectedDomains = detectInterdisciplinaryDomains(analysis.originalQuery || analysis.goal.statement);
  return {
    lanes: generateRetrievalLanes(analysis),
    detectedDomains,
    interdisciplinary: detectedDomains.length > 1,
    coherenceThreshold: detectedDomains.length > 1 ? 0.08 : null,
    hardConstraints: { mustIncludeTerms: hardTerms, mustExcludeTerms: analysis.ambiguities?.flatMap((item) => (item.possibleMeanings || []).filter((meaning) => meaning !== item.likelyMeaning)) || [], minRecency: analysis.domain.primary === 'clinical' ? 2010 : 2000 },
    softPriors: { preferredDomains: [analysis.domain.primary, ...(analysis.domain.secondary || [])], preferredSourceTypes: analysis.intent.type === 'building' ? ['code', 'report', 'paper'] : ['journal', 'review', 'paper'], preferredProviders: ['openalex', 'crossref', ...(analysis.intent.type === 'building' ? ['code', 'datasets'] : [])], penalizeTerms: ['hypothetical', 'fictional'] },
    generatedAt: new Date().toISOString(),
    constraintsYear: currentYear,
  };
}

module.exports = { generateSearchPolicy, generateRetrievalLanes, detectInterdisciplinaryDomains, getProviderEligibility };
