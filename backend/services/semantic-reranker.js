const { buildRelevanceProfile, scoreDocumentRelevance } = require('./query-relevance');

function cosineSimilarity(first, second) {
  let dot = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;
  for (let index = 0; index < Math.min(first.length, second.length); index++) {
    dot += first[index] * second[index];
    firstMagnitude += first[index] * first[index];
    secondMagnitude += second[index] * second[index];
  }
  return firstMagnitude && secondMagnitude ? dot / (Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude)) : 0;
}

async function requestEmbeddings(inputs, timeoutMs = 2500) {
  const apiKey = process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey || !inputs.length) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'The Research Desk',
      },
      body: JSON.stringify({ model: process.env.OPENROUTER_EMBEDDING_MODEL || 'openai/text-embedding-3-small', input: inputs }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data.data || []).sort((a, b) => a.index - b.index).map((item) => item.embedding);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function rerankCandidates(query, candidates, concepts = []) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  const profile = buildRelevanceProfile(query, concepts);
  const documentFrequency = new Map();
  candidates.forEach((document) => {
    const matched = new Set(scoreDocumentRelevance(document, profile).tokenHits);
    matched.forEach((token) => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1));
  });
  const lexical = candidates.map((document) => {
    const match = scoreDocumentRelevance(document, profile);
    const rarityBonus = match.tokenHits.reduce((sum, token) => sum + Math.log((candidates.length + 1) / ((documentFrequency.get(token) || 0) + 1)), 0);
    return { document, lexicalScore: Math.min(100, Math.round(match.score + rarityBonus * 8)) };
  });
  const embeddings = await requestEmbeddings([
    query,
    ...candidates.map((document) => `${document.title || ''}\n${(document.abstract || '').slice(0, 1200)}`),
  ]);
  return lexical
    .map((item, index) => {
      const semanticScore = embeddings ? Math.max(0, Math.min(100, Math.round((cosineSimilarity(embeddings[0], embeddings[index + 1]) + 1) * 50))) : item.lexicalScore;
      return { ...item.document, semanticSimilarity: semanticScore, retrievalScore: Math.round((semanticScore * 0.65) + (item.lexicalScore * 0.35)) };
    })
    .sort((first, second) => second.retrievalScore - first.retrievalScore);
}

module.exports = { cosineSimilarity, requestEmbeddings, rerankCandidates };
