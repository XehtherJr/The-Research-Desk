const { searchWorks } = require('./openalex');
const { searchCrossref } = require('./crossref');
const { normalizeWorks } = require('../utils/normalize');

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDoi(value) {
  return clean(value)
    .replace(/^https?:\/\/doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .toLowerCase();
}

function normalizeArxivId(value) {
  return clean(value)
    .replace(/^https?:\/\/(?:www\.)?arxiv\.org\/abs\//i, '')
    .replace(/^https?:\/\/(?:www\.)?arxiv\.org\/pdf\//i, '')
    .replace(/\.pdf$/i, '');
}

function parsePaperInput(paper = {}) {
  const doi = normalizeDoi(paper.doi);
  const arxivId = normalizeArxivId(paper.arxivId);
  const url = clean(paper.url);

  if (!doi && !arxivId && !url) {
    throw new Error('A DOI, arXiv ID, or paper URL is required');
  }

  const urlDoi = url.match(/doi\.org\/(10\.\S+)/i)?.[1];
  const urlArxiv = url.match(/arxiv\.org\/(?:abs|pdf)\/([^?#/]+)/i)?.[1];
  return {
    doi: doi || normalizeDoi(urlDoi),
    arxivId: arxivId || normalizeArxivId(urlArxiv),
    url,
  };
}

function matchesPaper(document, input) {
  const documentDoi = normalizeDoi(document?.metadata?.doi);
  if (input.doi && documentDoi === input.doi) return true;
  if (input.arxivId && (document?.canonicalUrl || '').toLowerCase().includes(input.arxivId.toLowerCase())) return true;
  return input.url && document?.canonicalUrl === input.url;
}

function toPaper(document) {
  return {
    id: document.id,
    title: document.title || 'Untitled paper',
    authors: document.metadata?.authors || document.authors || [],
    published: document.metadata?.published || document.date || null,
    abstract: document.abstract || '',
    arxivId: document.canonicalUrl?.match(/arxiv\.org\/(?:abs|pdf)\/([^?#/]+)/i)?.[1] || undefined,
    doi: document.metadata?.doi || undefined,
    url: document.canonicalUrl || document.url,
    venue: document.metadata?.venue || null,
    field: document.metadata?.concepts || [],
  };
}

async function resolvePaper(paper) {
  const input = parsePaperInput(paper);
  const query = input.doi || input.arxivId || input.url;
  const [openAlex, crossref] = await Promise.all([
    searchWorks(query, 10).catch(() => ({ results: [] })),
    searchCrossref(query, 10).catch(() => []),
  ]);
  const documents = [
    ...normalizeWorks(openAlex?.results || []),
    ...crossref,
  ];
  const match = documents.find((document) => matchesPaper(document, input)) || documents[0];
  if (!match) throw new Error('Paper could not be resolved from the supplied identifier');
  return { paper: toPaper(match), document: match, input };
}

module.exports = {
  normalizeDoi,
  normalizeArxivId,
  parsePaperInput,
  resolvePaper,
};