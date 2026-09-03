const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'with', 'that', 'this', 'from', 'into', 'want', 'build', 'find', 'how', 'what', 'where', 'does', 'are', 'to', 'of', 'in', 'on', 'is', 'read']);
const SYNONYMS = {
  'speed reading': ['speed reading', 'speed-reading', 'reading rate', 'rapid reading', 'skimming', 'rsvp'],
  'reinforcement learning from human feedback': ['reinforcement learning from human feedback', 'reinforcement learning human feedback', 'rlhf'],
  bipolar: ['bipolar', 'bipolar i', 'bipolar disorder', 'mania'],
  codebase: ['codebase', 'repository', 'repo', 'source code', 'github'],
};

function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function containsToken(text, token) {
  return new RegExp(`\\b${String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

function getAnchors(query, concepts = []) {
  const lower = String(query || '').toLowerCase();
  const anchors = [];
  Object.entries(SYNONYMS).forEach(([key, values]) => {
    const splitPhraseMatch = key === 'speed reading'
      ? /speed\s+read/.test(lower)
      : key === 'reinforcement learning from human feedback' && /reinforcement\s+learning/.test(lower) && /human\s+feedback/.test(lower);
    if (lower.includes(key) || splitPhraseMatch || values.some((value) => lower.includes(value))) anchors.push(...values);
  });
  concepts.filter((concept) => String(concept).length > 3 && !STOP_WORDS.has(String(concept).toLowerCase())).forEach((concept) => anchors.push(String(concept).toLowerCase()));
  return [...new Set(anchors)];
}

function buildRelevanceProfile(query, concepts = []) {
  const tokens = tokenize(query).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  const phrases = Object.keys(SYNONYMS).filter((phrase) => String(query).toLowerCase().includes(phrase) || (phrase === 'speed reading' && /speed\s+read/.test(String(query).toLowerCase())));
  const anchors = getAnchors(query, concepts);
  const expandedTerms = [...new Set(phrases.flatMap((phrase) => SYNONYMS[phrase] || []))];
  return { tokens: [...new Set(tokens)], phrases, anchors, expandedTerms };
}

function expandQuery(query, concepts = []) {
  const profile = buildRelevanceProfile(query, concepts);
  return [...new Set([query, ...profile.expandedTerms])].join(' ');
}

function scoreDocumentRelevance(document, profile) {
  const text = `${document.title || ''}. ${document.abstract || ''}`;
  const title = document.title || '';
  const phraseHits = profile.anchors.filter((anchor) => anchor.includes(' ') && text.toLowerCase().includes(anchor));
  const tokenHits = profile.tokens.filter((token) => containsToken(text, token));
  const titleHits = profile.tokens.filter((token) => containsToken(title, token));
  const anchorHits = profile.anchors.filter((anchor) => anchor.includes(' ') ? text.toLowerCase().includes(anchor) : containsToken(text, anchor));
  const meaningfulHits = new Set([...phraseHits, ...tokenHits]);
  const score = Math.min(100, Math.round((phraseHits.length * 45) + (titleHits.length * 20) + (meaningfulHits.size / Math.max(1, profile.tokens.length) * 35)));
  const hardAnchorRequired = profile.phrases.length > 0 || profile.tokens.some((token) => token.length >= 6 && /^[A-Z]/.test(token));
  const passes = anchorHits.length > 0 || (!hardAnchorRequired && meaningfulHits.size > 0);
  return { score, passes, phraseHits, tokenHits, anchorHits, hardAnchorRequired };
}

module.exports = { tokenize, containsToken, buildRelevanceProfile, scoreDocumentRelevance, expandQuery, SYNONYMS };
