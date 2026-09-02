/**
 * ai-client.js — Unified AI Completion Client for Query Planning and Document Evaluation.
 * Supports OpenRouter (primary model: minimax/minimax-m3:free, backup: nvidia/nemotron-3-ultra:free)
 * and direct Minimax API. Includes timeout control and robust JSON repair.
 */

const MINIMAX_API_URL = 'https://api.minimax.io/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Attempts to extract and repair JSON from model outputs.
 * @param {string} raw - Raw output from model
 * @returns {any|null} Parsed JSON or null
 */
function repairAndParseJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.trim();

  // Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  // Direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with repair heuristics
  }

  // Extract outermost JSON object or array
  const firstBracket = cleaned.search(/[{\[]/);
  const lastBracket = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));

  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = cleaned.slice(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Fix trailing commas
      const fixedTrailing = candidate.replace(/,\s*([\]}])/g, '$1');
      try {
        return JSON.parse(fixedTrailing);
      } catch {
        // Continue
      }
    }
  }

  return null;
}

/**
 * Make an AI chat completion request with structured prompt.
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} options - { temperature, max_tokens, timeoutMs }
 * @returns {Promise<string|null>} Response text content or null
 */
async function generateCompletion(messages, options = {}) {
  const openRouterKey = process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY;
  const minimaxKey = process.env.MINIMAX_KEY;

  if (!openRouterKey && !minimaxKey) {
    return null;
  }

  const timeoutMs = options.timeoutMs || 8000;
  const temperature = options.temperature ?? 0.1;
  const max_tokens = options.max_tokens ?? 2000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let apiUrl;
    let primaryModel;
    let backupModel;
    const headers = { 'Content-Type': 'application/json' };

    if (openRouterKey) {
      apiUrl = OPENROUTER_API_URL;
      primaryModel = process.env.OPENROUTER_MODEL || 'minimax/minimax-m3:free';
      backupModel = process.env.OPENROUTER_BACKUP_MODEL || 'nvidia/nemotron-3-ultra:free';
      headers['Authorization'] = `Bearer ${openRouterKey}`;
      headers['HTTP-Referer'] = 'http://localhost:3000';
      headers['X-Title'] = 'Document Discovery Engine';
    } else {
      apiUrl = MINIMAX_API_URL;
      primaryModel = 'MiniMax-M3';
      backupModel = null;
      headers['Authorization'] = `Bearer ${minimaxKey}`;
    }

    const payload = {
      model: primaryModel,
      messages,
      temperature,
      max_tokens,
    };

    let response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    // If primary OpenRouter model fails (e.g. rate limit / model downtime), retry with backup
    if (!response.ok && openRouterKey && !process.env.OPENROUTER_MODEL && backupModel) {
      console.warn(`[AI Client] Primary model '${primaryModel}' failed (${response.status}). Trying backup '${backupModel}'...`);
      payload.model = backupModel;
      response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[AI Client] Error status ${response.status}: ${errText.slice(0, 160)}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return content.trim();
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`[AI Client] Request timed out after ${timeoutMs}ms`);
    } else {
      console.warn(`[AI Client] Request error: ${err.message}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  generateCompletion,
  repairAndParseJSON,
};
