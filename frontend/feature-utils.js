(function (global) {
  'use strict';
  const UI_STOP_WORDS = new Set(['about', 'after', 'also', 'analysis', 'approach', 'based', 'data', 'method', 'model', 'paper', 'research', 'results', 'study', 'using']);
  function refinementTerms(plan, results) {
    const strongResults = results.filter((item) => (item.evaluation?.relevance || 0) >= 50 && item.evaluation?.topicalMatch?.passes !== false);
    return [...new Set([...(plan?.relevanceProfile?.expandedTerms || []), ...strongResults.flatMap((item) => item.document.enrichedMetadata?.concepts || [])])]
      .filter((term) => term && term.length > 3 && !UI_STOP_WORDS.has(term.toLowerCase())).slice(0, 8);
  }
  function libraryMatches(entry, query) {
    const needle = String(query || '').toLowerCase();
    return !needle || `${entry.title || ''} ${entry.abstract || ''} ${entry.text || ''} ${entry.query || ''}`.toLowerCase().includes(needle);
  }
  global.ResearchDeskFeatures = { refinementTerms, libraryMatches };
})(window);
