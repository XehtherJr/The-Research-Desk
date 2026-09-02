/**
 * normalize.js — Transforms OpenAlex API results into the app's
 * standardized document schema. Handles missing fields gracefully.
 */

const { reconstructAbstract, mapDocumentType } = require('../services/openalex');

/**
 * Normalize a single OpenAlex work object into the application's document schema.
 * @param {Object} work - Raw work object from OpenAlex API
 * @returns {Object} Normalized document object
 */
function normalizeWork(work) {
  if (!work) return null;

  // Extract author display names
  const authorNames = (work.authorships || [])
    .map((item) => item.author?.display_name)
    .filter(Boolean);

  if (authorNames.length === 0) {
    authorNames.push('Unknown Author');
  }

  // Publication date / year
  const publicationDate =
    work.publication_date || (work.publication_year ? String(work.publication_year) : 'Unknown');

  // Abstract reconstruction
  const abstract = reconstructAbstract(work.abstract_inverted_index);

  // Document type
  const docType = mapDocumentType(work.type);

  // DOI and URLs
  const rawDoi = work.doi || null;
  const doiClean = rawDoi ? rawDoi.replace(/^https?:\/\/doi\.org\//i, '') : null;
  const directUrl =
    rawDoi ||
    work.primary_location?.landing_page_url ||
    work.open_access?.oa_url ||
    work.id ||
    (doiClean ? `https://doi.org/${doiClean}` : null);

  const openAccessPdf = work.open_access?.oa_url || work.primary_location?.pdf_url || null;
  const isOpenAccess = Boolean(work.open_access?.is_oa);

  // Venue / Source name
  const venue =
    work.primary_location?.source?.display_name ||
    work.host_venue?.display_name ||
    (work.locations && work.locations[0]?.source?.display_name) ||
    null;

  // Clean OpenAlex ID
  const workId = work.id ? work.id.replace('https://openalex.org/', '') : String(Math.random());

  return {
    id: `openalex_${workId}`,
    title: work.title || work.display_name || 'Untitled Document',
    authors: authorNames,
    date: publicationDate,
    type: docType,
    abstract: abstract,
    url: directUrl,
    metadata: {
      openAccess: isOpenAccess,
      openAccessPdf: openAccessPdf,
      doi: doiClean,
      venue: venue,
      citationCount: work.cited_by_count ?? 0,
      source: 'openalex',
      referencedWorksCount: (work.referenced_works || []).length,
    },
  };
}

/**
 * Normalize an array of OpenAlex works.
 * @param {Array} works - Array of raw work objects from OpenAlex
 * @returns {Array} Array of normalized document objects
 */
function normalizeWorks(works) {
  if (!Array.isArray(works)) return [];
  return works.map(normalizeWork).filter(Boolean);
}

module.exports = {
  normalizeWork,
  normalizeWorks,
  normalizePaper: normalizeWork,
  normalizePapers: normalizeWorks,
};
