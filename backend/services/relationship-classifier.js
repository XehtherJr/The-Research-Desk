const RELATIONSHIPS = Object.freeze([
  'support',
  'contradict',
  'extend',
  'replicate',
  'apply',
  'implement',
  'context',
]);

function documentText(document) {
  return `${document?.title || ''} ${document?.abstract || ''} ${document?.extractedEvidence?.findings?.join(' ') || ''}`.toLowerCase();
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifyRelationship(document, originalPaper = {}) {
  const text = documentText(document);
  const originalTitle = String(originalPaper.title || '').toLowerCase();
  const titleWords = originalTitle.split(/\W+/).filter((word) => word.length > 4);
  const titleOverlap = titleWords.filter((word) => text.includes(word)).length;
  const citation = document.citationContext?.citedBy || {};

  if (hasAny(text, [/contradict/, /challenge/, /fails? to replicate/, /does not reproduce/, /dispute/, /negative result/])) {
    return { relationship: 'contradict', confidence: 0.82, reason: 'The abstract contains challenge or non-replication language.' };
  }
  if (hasAny(text, [/replicat/, /reproduc/, /reproduce/, /independent evaluation/, /independent evaluat/])) {
    return { relationship: 'replicate', confidence: 0.8, reason: 'The abstract describes replication or independent evaluation.' };
  }
  if (hasAny(text, [/extends?/, /extension/, /builds on/, /improves? upon/, /improved version/, /follow-up/])) {
    return { relationship: 'extend', confidence: 0.78, reason: 'The abstract describes an extension or improvement.' };
  }
  if (hasAny(text, [/github/, /source code/, /implementation/, /open-source/, /software library/, /framework/]) || document.type === 'repository') {
    return { relationship: 'implement', confidence: 0.86, reason: 'The document exposes implementation or software signals.' };
  }
  if (hasAny(text, [/applied to/, /application of/, /in clinical/, /in production/, /case study/, /real-world/])) {
    return { relationship: 'apply', confidence: 0.74, reason: 'The abstract describes an application or case study.' };
  }
  if (citation.supports?.length || titleOverlap >= 2) {
    return { relationship: 'support', confidence: 0.62, reason: 'Citation context or title overlap suggests supporting use.' };
  }
  return { relationship: 'context', confidence: 0.35, reason: 'The available metadata establishes related context only.' };
}

function relationshipToEvidenceType(relationship) {
  return {
    support: 'independent_evaluation',
    contradict: 'independent_evaluation',
    extend: 'follow_up_use',
    replicate: 'independent_evaluation',
    apply: 'follow_up_use',
    implement: 'implementation',
    context: 'follow_up_use',
  }[relationship] || 'follow_up_use';
}

function buildRelationshipPrompt(documents, originalPaper) {
  const candidates = documents.map((document) => ({
    id: document.id,
    title: document.title,
    abstract: String(document.abstract || '').slice(0, 1200),
    type: document.type,
  }));
  return [
    {
      role: 'system',
      content: `Classify each candidate paper's relationship to the original paper. Return ONLY a JSON array. Each item must contain documentId, relationship, confidence (0 to 1), and reason. Allowed relationships: ${RELATIONSHIPS.join(', ')}. Use context when the evidence is insufficient.`,
    },
    {
      role: 'user',
      content: JSON.stringify({ originalPaper: { title: originalPaper.title, abstract: originalPaper.abstract }, candidates }),
    },
  ];
}

function validateModelResults(value, documents) {
  if (!Array.isArray(value)) return new Map();
  const validIds = new Set(documents.map((document) => document.id));
  const results = new Map();
  value.forEach((item) => {
    if (!item || !validIds.has(item.documentId) || !RELATIONSHIPS.includes(item.relationship)) return;
    const confidence = Number(item.confidence);
    results.set(item.documentId, {
      relationship: item.relationship,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
      reason: typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : 'Classified by the language model.',
      extractionMethod: 'ai',
    });
  });
  return results;
}

async function classifyRelationships(documents, originalPaper, options = {}) {
  const deterministic = new Map(documents.map((document) => [
    document.id,
    classifyRelationship(document, originalPaper),
  ]));
  if (!documents.length || options.disableAI || (!process.env.OPENROUTER_KEY && !process.env.OPENROUTER_API_KEY && !process.env.MINIMAX_KEY)) {
    return deterministic;
  }
  try {
    const { generateCompletion, repairAndParseJSON } = require('./ai-client');
    const raw = await generateCompletion(buildRelationshipPrompt(documents, originalPaper), {
      timeoutMs: options.timeoutMs || 5000,
      max_tokens: options.max_tokens || 1800,
      temperature: 0.1,
    });
    const modelResults = validateModelResults(repairAndParseJSON(raw), documents);
    modelResults.forEach((result, id) => deterministic.set(id, result));
  } catch {
    // Deterministic results are the contract when the optional AI layer fails.
  }
  return deterministic;
}

module.exports = {
  RELATIONSHIPS,
  buildRelationshipPrompt,
  classifyRelationship,
  classifyRelationships,
  relationshipToEvidenceType,
  validateModelResults,
};