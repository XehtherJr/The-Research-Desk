/**
 * minimax.js — Minimax M3 API client for semantic relationship detection.
 * Batches papers (5 per request) with prompt-engineered JSON output + repair.
 */

const MINIMAX_API_URL = 'https://api.minimax.io/v1/chat/completions';
const BATCH_SIZE = 5;
const MAX_CONCURRENT_BATCHES = 5;

/**
 * Build the system prompt for relationship classification.
 */
function buildSystemPrompt() {
  return `You are a research relationship classifier. You analyze academic papers relative to a user's research query and classify each paper's relationship to that query.

CRITICAL RULES:
1. You MUST respond with ONLY valid JSON — no markdown, no explanation, no code fences.
2. Your response must be a JSON array of objects, one per paper.
3. Each object must have exactly these fields:
   - "paper_index": integer (0-based index matching input order)
   - "primary_relationship": one of "conceptually-similar", "builds-on", "responds-to", "alternative-method", "shared-dataset", "explicit-critique", "unrelated"
   - "confidence": one of "high", "moderate", "low"
   - "evidence": one sentence explaining the relationship (factual, cite abstract content)
4. Only tag "high" confidence if the abstract clearly supports the relationship.
5. For "builds-on" or "responds-to", use "moderate" if inference is required.
6. If a paper is clearly unrelated to the query, use "unrelated" with "low" confidence.
7. Evidence must reference specific content from the paper's title or abstract.

EXAMPLE OUTPUT (for 2 papers):
[{"paper_index":0,"primary_relationship":"conceptually-similar","confidence":"high","evidence":"Directly addresses quantum error correction using surface code techniques"},{"paper_index":1,"primary_relationship":"unrelated","confidence":"low","evidence":"Focuses on classical computing optimization, not related to the query topic"}]`;
}

/**
 * Build the user prompt for a batch of papers.
 * @param {string} query - User's research query
 * @param {Array} papers - Batch of normalized papers
 * @param {number} startIndex - Starting index in the overall results
 */
function buildUserPrompt(query, papers, startIndex) {
  const paperDescriptions = papers
    .map((paper, i) => {
      const globalIndex = startIndex + i;
      return `Paper ${globalIndex}:
- Title: "${paper.title}"
- Authors: ${paper.authors.join(', ')}
- Date: ${paper.date}
- Abstract: "${paper.abstract}"
- Citation count: ${paper.metadata.citation_count}`;
    })
    .join('\n\n');

  return `Research Query: "${query}"

Classify the relationship of each paper below to the research query.

${paperDescriptions}

Respond with ONLY a JSON array. No other text.`;
}

/**
 * Attempt to extract and parse JSON from a potentially messy M3 response.
 * Handles common issues: markdown fences, leading/trailing text, truncation.
 * @param {string} raw - Raw response text from M3
 * @returns {Array|null} Parsed array or null if unrecoverable
 */
function repairAndParseJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.trim();

  // Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  // Try direct parse first
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object') return [parsed];
    return null;
  } catch {
    // Continue to repair strategies
  }

  // Strategy 1: Extract JSON array with regex
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // Try fixing trailing commas
      const fixedTrailing = arrayMatch[0].replace(/,\s*([\]}])/g, '$1');
      try {
        return JSON.parse(fixedTrailing);
      } catch {
        // Continue
      }
    }
  }

  // Strategy 2: Extract individual JSON objects
  const objectMatches = cleaned.match(/\{[^{}]*\}/g);
  if (objectMatches && objectMatches.length > 0) {
    const results = [];
    for (const objStr of objectMatches) {
      try {
        results.push(JSON.parse(objStr));
      } catch {
        // Skip malformed objects
      }
    }
    if (results.length > 0) return results;
  }

  return null;
}

/**
 * Call Minimax M3 API with a single batch of papers.
 * @param {string} query - User's research query
 * @param {Array} papers - Batch of normalized papers (up to BATCH_SIZE)
 * @param {number} startIndex - Starting index for paper_index tracking
 * @returns {Promise<Array>} Array of relationship classifications
 */
async function classifyBatch(query, papers, startIndex) {
  const apiKey = process.env.MINIMAX_KEY;
  if (!apiKey) {
    console.warn('MINIMAX_KEY not set — skipping relationship detection');
    return papers.map((_, i) => ({
      paper_index: startIndex + i,
      primary_relationship: null,
      confidence: null,
      evidence: 'Relationship detection unavailable (no API key)',
    }));
  }

  const body = {
    model: 'MiniMax-M3',
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(query, papers, startIndex) },
    ],
    temperature: 0.1,
    max_tokens: 2000,
  };

  const response = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const status = response.status;
    const errBody = await response.text().catch(() => '');
    console.error(`Minimax API error ${status}: ${errBody}`);

    if (status === 429) {
      throw new Error('MINIMAX_RATE_LIMITED');
    }

    // Return null relationships on error — papers still shown
    return papers.map((_, i) => ({
      paper_index: startIndex + i,
      primary_relationship: null,
      confidence: null,
      evidence: 'Relationship detection failed',
    }));
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || '';

  const parsed = repairAndParseJSON(rawContent);

  if (!parsed || parsed.length === 0) {
    console.warn('Failed to parse M3 response:', rawContent.substring(0, 200));
    return papers.map((_, i) => ({
      paper_index: startIndex + i,
      primary_relationship: null,
      confidence: null,
      evidence: 'Relationship data could not be parsed',
    }));
  }

  return parsed;
}

/**
 * Classify relationships for all papers using batched M3 calls.
 * @param {string} query - User's research query
 * @param {Array} normalizedPapers - Array of normalized paper objects
 * @returns {Promise<Array>} Papers with relationships populated
 */
async function classifyRelationships(query, normalizedPapers) {
  if (normalizedPapers.length === 0) return [];

  // Split papers into batches of BATCH_SIZE
  const batches = [];
  for (let i = 0; i < normalizedPapers.length; i += BATCH_SIZE) {
    batches.push({
      papers: normalizedPapers.slice(i, i + BATCH_SIZE),
      startIndex: i,
    });
  }

  // Execute batches with concurrency limit
  const allClassifications = [];
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
    const batchResults = await Promise.all(
      concurrentBatches.map((batch) =>
        classifyBatch(query, batch.papers, batch.startIndex).catch((err) => {
          console.error('Batch classification error:', err.message);
          // Return null classifications on error
          return batch.papers.map((_, j) => ({
            paper_index: batch.startIndex + j,
            primary_relationship: null,
            confidence: null,
            evidence: 'Batch processing error',
          }));
        })
      )
    );
    allClassifications.push(...batchResults.flat());
  }

  // Build lookup map: paper_index → classification
  const classificationMap = new Map();
  for (const classification of allClassifications) {
    if (classification && classification.paper_index != null) {
      classificationMap.set(classification.paper_index, classification);
    }
  }

  // Merge classifications into papers
  const VALID_TYPES = new Set([
    'conceptually-similar',
    'builds-on',
    'responds-to',
    'alternative-method',
    'shared-dataset',
    'explicit-critique',
  ]);

  return normalizedPapers.map((paper, index) => {
    const classification = classificationMap.get(index);

    if (!classification || !VALID_TYPES.has(classification.primary_relationship)) {
      paper.relationships = {
        primary: classification?.primary_relationship === 'unrelated'
          ? { type: 'unrelated', confidence: 'low', evidence: classification.evidence || '' }
          : null,
        secondary: [],
      };
    } else {
      paper.relationships = {
        primary: {
          type: classification.primary_relationship,
          confidence: classification.confidence || 'moderate',
          evidence: classification.evidence || '',
        },
        secondary: [],
      };
    }

    return paper;
  });
}

module.exports = { classifyRelationships };
