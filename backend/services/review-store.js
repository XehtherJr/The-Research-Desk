const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_REVIEWS = 5000;
function storePath() {
  const directory = process.env.RESEARCH_DESK_CACHE_DIR || (process.env.NETLIFY ? os.tmpdir() : path.join(__dirname, '../../.cache'));
  return path.join(directory, 'reviews.json');
}
function readReviews() {
  try { const reviews = JSON.parse(fs.readFileSync(storePath(), 'utf8')); return Array.isArray(reviews) ? reviews : []; } catch { return []; }
}
function writeReviews(reviews) {
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    const temporary = `${storePath()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(reviews.slice(-MAX_REVIEWS)), 'utf8');
    fs.renameSync(temporary, storePath());
    return true;
  } catch { return false; }
}
function addReview(review) {
  const normalized = { ...review, title: String(review.title || '').slice(0, 500), abstract: String(review.abstract || '').slice(0, 2000), relevance: Number(review.relevance), goalFit: Number(review.goalFit), evidenceQuality: Number(review.evidenceQuality), semanticScore: Number(review.semanticScore), coherence: Number(review.coherence), createdAt: new Date().toISOString() };
  if (!normalized.query || !normalized.documentId || !['relevant', 'not-relevant'].includes(normalized.label) || FEATURE_KEYS.some((key) => !Number.isFinite(normalized[key]))) return false;
  return writeReviews([...readReviews(), normalized]);
}
function listReviews() { return readReviews(); }
const FEATURE_KEYS = ['relevance', 'goalFit', 'evidenceQuality', 'semanticScore', 'coherence'];
module.exports = { addReview, listReviews, storePath, MAX_REVIEWS };
