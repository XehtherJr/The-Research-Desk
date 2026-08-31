/**
 * normalize.js — Transforms Semantic Scholar API responses into the app's
 * standardized paper schema. Handles missing fields gracefully.
 */

/**
 * Normalize a single Semantic Scholar paper result into app schema.
 * @param {Object} paper - Raw paper object from Semantic Scholar API
 * @returns {Object} Normalized paper object
 */
function normalizePaper(paper) {
  const authorNames = (paper.authors || []).map(
    (a) => a.name || 'Unknown Author'
  );

  const doi = paper.externalIds?.DOI || null;
  const arxivId = paper.externalIds?.ArXiv || null;

  let url = paper.url || null;
  if (!url && doi) {
    url = `https://doi.org/${doi}`;
  } else if (!url && arxivId) {
    url = `https://arxiv.org/abs/${arxivId}`;
  }

  const openAccessPdf = paper.openAccessPdf?.url || null;
  const isOpenAccess = !!openAccessPdf;

  return {
    id: `scholar_${paper.paperId}`,
    title: paper.title || 'Untitled',
    authors: authorNames,
    date: paper.year ? String(paper.year) : 'Unknown',
    source_type: 'paper',
    abstract: paper.abstract || paper.tldr?.text || 'No abstract available.',
    url: url,
    metadata: {
      citation_count: paper.citationCount ?? 0,
      open_access: isOpenAccess,
      open_access_pdf: openAccessPdf,
      venue: paper.venue || null,
      doi: doi,
      arxiv_id: arxivId,
      source_api: 'semantic-scholar',
    },
    // Relationships will be populated by the Minimax service
    relationships: {
      primary: null,
      secondary: [],
    },
  };
}

/**
 * Normalize an array of Semantic Scholar papers.
 * @param {Array} papers - Raw papers from Semantic Scholar API
 * @returns {Array} Normalized papers
 */
function normalizePapers(papers) {
  return papers.map(normalizePaper);
}

module.exports = { normalizePaper, normalizePapers };
