/**
 * deduplicator.js — Deduplication & Provenance Merging Service for V1.
 * Merges multi-provider candidate documents by:
 * 1. Exact normalized DOI match
 * 2. Canonical URL match
 * 3. Sørensen–Dice title similarity (>= 0.85) + author overlap
 * Aggregates provenance from all discovering providers into a single unified Document.
 */

/**
 * Computes Sørensen–Dice coefficient between two strings (0.0 to 1.0).
 * Matches adjacent bigrams.
 * @param {string} first
 * @param {string} second
 * @returns {number}
 */
function diceCoefficient(first, second) {
  if (!first || !second) return 0;
  const s1 = first.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = second.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const firstBigrams = new Map();
  for (let i = 0; i < s1.length - 1; i++) {
    const bigram = s1.substr(i, 2);
    firstBigrams.set(bigram, (firstBigrams.get(bigram) || 0) + 1);
  }

  let intersectionSize = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bigram = s2.substr(i, 2);
    const count = firstBigrams.get(bigram) || 0;
    if (count > 0) {
      firstBigrams.set(bigram, count - 1);
      intersectionSize++;
    }
  }

  return (2.0 * intersectionSize) / (s1.length - 1 + s2.length - 1);
}

/**
 * Normalizes a DOI for matching.
 * @param {string} doi
 * @returns {string|null}
 */
function normalizeDoi(doi) {
  if (!doi || typeof doi !== 'string') return null;
  return doi.toLowerCase().replace(/^https?:\/\/doi\.org\//i, '').trim();
}

/**
 * Normalizes a URL for comparison.
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/+$/, '')
    .trim();
}

/**
 * Checks if two author lists share at least one surname.
 * @param {string[]} authorsA
 * @param {string[]} authorsB
 * @returns {boolean}
 */
function hasAuthorOverlap(authorsA = [], authorsB = []) {
  if (!authorsA.length || !authorsB.length) return false;

  const extractSurnames = (list) =>
    new Set(
      list
        .map((a) => {
          const parts = a.trim().split(/\s+/);
          return parts[parts.length - 1].toLowerCase();
        })
        .filter((s) => s.length > 2 && s !== 'author')
    );

  const setA = extractSurnames(authorsA);
  const setB = extractSurnames(authorsB);

  for (const surname of setA) {
    if (setB.has(surname)) return true;
  }
  return false;
}

/**
 * Checks whether docA and docB are duplicates of the same publication.
 * @param {Object} docA
 * @param {Object} docB
 * @returns {boolean}
 */
function areDuplicates(docA, docB) {
  // 1. Exact DOI match
  const doiA = normalizeDoi(docA.metadata?.doi);
  const doiB = normalizeDoi(docB.metadata?.doi);
  if (doiA && doiB && doiA === doiB) {
    return true;
  }

  // 2. Canonical URL match
  const urlA = normalizeUrl(docA.canonicalUrl || docA.url);
  const urlB = normalizeUrl(docB.canonicalUrl || docB.url);
  if (urlA && urlB && urlA === urlB) {
    return true;
  }

  // 3. Fuzzy title match with Dice coefficient
  const titleSimilarity = diceCoefficient(docA.title, docB.title);
  if (titleSimilarity >= 0.85) {
    const authorsA = docA.metadata?.authors || docA.authors || [];
    const authorsB = docB.metadata?.authors || docB.authors || [];

    // If author overlap exists or title is practically identical (>= 0.92)
    if (hasAuthorOverlap(authorsA, authorsB) || titleSimilarity >= 0.92) {
      return true;
    }
  }

  return false;
}

/**
 * Merges target duplicate into base document, combining provenance.
 * @param {Object} baseDoc
 * @param {Object} newDoc
 * @returns {Object} Merged document
 */
function mergeDocuments(baseDoc, newDoc) {
  // Combine provenance providers
  const existingProviders = new Map();
  for (const p of baseDoc.provenance?.providers || []) {
    const key = `${p.provider}:${p.source || ''}:${p.domain || ''}`;
    existingProviders.set(key, p);
  }

  for (const p of newDoc.provenance?.providers || []) {
    const key = `${p.provider}:${p.source || ''}:${p.domain || ''}`;
    if (!existingProviders.has(key)) {
      existingProviders.set(key, p);
    }
  }

  baseDoc.provenance = {
    providers: Array.from(existingProviders.values()),
  };

  // Preserve the richest abstract
  if ((!baseDoc.abstract || baseDoc.abstract.length < 80) && newDoc.abstract && newDoc.abstract.length >= 80) {
    baseDoc.abstract = newDoc.abstract;
  }

  // Preserve highest citation count
  const baseCitations = baseDoc.metadata?.citationCount || 0;
  const newCitations = newDoc.metadata?.citationCount || 0;
  if (newCitations > baseCitations) {
    baseDoc.metadata.citationCount = newCitations;
  }

  // Preserve open access status / PDF if either has it
  if (!baseDoc.access?.openAccess && newDoc.access?.openAccess) {
    baseDoc.access = { ...newDoc.access };
    baseDoc.metadata.openAccess = true;
    baseDoc.metadata.openAccessPdf = newDoc.access.pdfUrl || baseDoc.metadata.openAccessPdf;
  }

  // Preserve DOI if base missing
  if (!baseDoc.metadata?.doi && newDoc.metadata?.doi) {
    baseDoc.metadata.doi = newDoc.metadata.doi;
  }

  return baseDoc;
}

/**
 * Deduplicates an array of candidate documents across providers.
 * @param {Array<Object>} candidates
 * @returns {Array<Object>} Deduplicated documents with merged provenance
 */
function deduplicate(candidates) {
  if (!Array.isArray(candidates) || candidates.length <= 1) {
    return candidates || [];
  }

  const deduped = [];

  for (const candidate of candidates) {
    let duplicateIndex = -1;

    for (let i = 0; i < deduped.length; i++) {
      if (areDuplicates(deduped[i], candidate)) {
        duplicateIndex = i;
        break;
      }
    }

    if (duplicateIndex !== -1) {
      mergeDocuments(deduped[duplicateIndex], candidate);
    } else {
      deduped.push({ ...candidate });
    }
  }

  return deduped;
}

module.exports = {
  deduplicate,
  areDuplicates,
  diceCoefficient,
  mergeDocuments,
};
