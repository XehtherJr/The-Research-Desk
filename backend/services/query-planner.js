/**
 * query-planner.js — Query Planner Service for Document Discovery Engine V1.
 * Transforms user input into an inspectable SearchPlan capturing intent,
 * concepts, evidence needs, target document types, and provider subqueries.
 */

const { generateCompletion, repairAndParseJSON } = require('./ai-client');

/**
 * Builds the system prompt for Query Planning.
 */
function buildPlannerPrompt() {
  return `You are a research query planning engine. Your job is to transform a user's research query into a structured SearchPlan for a document discovery system.

Respond with ONLY a valid JSON object matching this schema:
{
  "intent": {
    "type": "learning" | "building" | "understanding" | "researching",
    "goal": "A concise sentence describing the user's objective",
    "confidence": 0.85
  },
  "concepts": ["3 to 5 key technical terms or concepts"],
  "evidenceNeeds": [
    { "type": "methodology | benchmark | implementation | dataset | theory | survey", "description": "Specific evidence needed" }
  ],
  "documentTypes": ["research_paper", "technical_report", "dataset", "github_repository", "book"],
  "sources": ["openalex", "crossref", "company-scrapers"],
  "subqueries": [
    { "query": "core search query", "sources": ["openalex", "crossref"] },
    { "query": "focused benchmark or methods query", "sources": ["openalex"] },
    { "query": "applied or technical implementation query", "sources": ["company-scrapers", "openalex"] }
  ],
  "expectedRoles": ["foundational", "applied", "implementation", "dataset", "alternative"],
  "reasoning": "2 sentences explaining the search strategy to the user."
}

Do NOT wrap in markdown fences. Output strictly valid JSON.`;
}

/**
 * Deterministic rule-based fallback when AI is offline or times out.
 * @param {string} userQuery
 * @returns {Object} Fallback SearchPlan
 */
function buildDeterministicPlan(userQuery) {
  const queryLower = userQuery.toLowerCase().trim();

  let intentType = 'researching';
  let goal = `Investigate comprehensive literature on ${userQuery}`;

  if (/\b(build|make|implement|code|create|develop)\b/.test(queryLower)) {
    intentType = 'building';
    goal = `Build and deploy practical solutions for ${userQuery}`;
  } else if (/\b(learn|tutorial|intro|guide|how to|basics)\b/.test(queryLower)) {
    intentType = 'learning';
    goal = `Understand foundational concepts and learning materials for ${userQuery}`;
  } else if (/\b(compare|versus|vs|difference|analysis|why)\b/.test(queryLower)) {
    intentType = 'understanding';
    goal = `Examine comparative evidence and differing methodologies in ${userQuery}`;
  }

  // Extract concepts: filter stop words
  const stopWords = new Set([
    'a', 'an', 'the', 'in', 'on', 'for', 'with', 'to', 'of', 'and', 'or',
    'i', 'want', 'how', 'what', 'why', 'can', 'we', 'system', 'that', 'is', 'are'
  ]);
  const tokens = userQuery
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));

  const concepts = tokens.slice(0, 5);
  if (concepts.length === 0) concepts.push(userQuery);

  const subqueries = [
    { query: userQuery, sources: ['openalex', 'crossref'] },
    { query: `${concepts.slice(0, 3).join(' ')} methods`, sources: ['openalex', 'company-scrapers'] },
  ];

  if (intentType === 'building') {
    subqueries.push({
      query: `${concepts.slice(0, 2).join(' ')} implementation benchmark`,
      sources: ['company-scrapers', 'openalex'],
    });
  }

  return {
    query: userQuery,
    intent: {
      type: intentType,
      goal,
      confidence: 0.88,
    },
    concepts,
    evidenceNeeds: [
      { type: 'methodology', description: `Core algorithms and techniques for ${concepts[0] || userQuery}` },
      { type: 'benchmark', description: 'Empirical performance comparisons and validation standards' },
      { type: 'implementation', description: 'Working implementations, software tools, and technical reports' },
      { type: 'dataset', description: 'Evaluation datasets and reference benchmarks' },
    ],
    documentTypes: ['research_paper', 'technical_report', 'dataset', 'github_repository', 'book'],
    sources: ['openalex', 'crossref', 'company-scrapers'],
    subqueries,
    expectedRoles: ['foundational', 'applied', 'implementation', 'dataset', 'alternative'],
    reasoning: `Your query indicates a ${intentType} goal. We are searching across academic literature, Crossref, and leading research institutions for methodologies, empirical benchmarks, and working implementations.`,
    _generatedBy: 'deterministic-fallback',
  };
}

/**
 * Plan search strategy from user query.
 * @param {string} userQuery
 * @returns {Promise<Object>} SearchPlan
 */
async function planSearch(userQuery) {
  const trimmed = userQuery.trim();
  if (!trimmed) {
    return buildDeterministicPlan('research');
  }

  // Attempt AI generation with tight timeout (2.5s) to guarantee high performance
  const messages = [
    { role: 'system', content: buildPlannerPrompt() },
    { role: 'user', content: `User Research Query: "${trimmed}"` },
  ];

  const aiResponse = await generateCompletion(messages, {
    temperature: 0.1,
    max_tokens: 1200,
    timeoutMs: 2500,
  });

  if (aiResponse) {
    const parsed = repairAndParseJSON(aiResponse);
    if (parsed && parsed.intent && Array.isArray(parsed.subqueries)) {
      return {
        query: trimmed,
        intent: {
          type: parsed.intent.type || 'researching',
          goal: parsed.intent.goal || `Research ${trimmed}`,
          confidence: parsed.intent.confidence || 0.9,
        },
        concepts: Array.isArray(parsed.concepts) && parsed.concepts.length ? parsed.concepts : [trimmed],
        evidenceNeeds: Array.isArray(parsed.evidenceNeeds) ? parsed.evidenceNeeds : [],
        documentTypes: Array.isArray(parsed.documentTypes) ? parsed.documentTypes : ['research_paper'],
        sources: Array.isArray(parsed.sources) ? parsed.sources : ['openalex', 'crossref', 'company-scrapers'],
        subqueries: parsed.subqueries.length ? parsed.subqueries : [{ query: trimmed, sources: ['openalex'] }],
        expectedRoles: Array.isArray(parsed.expectedRoles)
          ? parsed.expectedRoles
          : ['foundational', 'applied', 'implementation', 'dataset'],
        reasoning: parsed.reasoning || `Searching for evidence matching your ${parsed.intent.type || 'research'} goal.`,
        _generatedBy: 'ai',
      };
    }
  }

  console.info('[Query Planner] Fallback activated: using deterministic plan.');
  return buildDeterministicPlan(trimmed);
}

module.exports = {
  planSearch,
  buildDeterministicPlan,
};
