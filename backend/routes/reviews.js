const express = require('express');
const { addReview, listReviews } = require('../services/review-store');
const { getCalibrationModel, MIN_LABELS } = require('../services/calibrated-reranker');

const router = express.Router();
router.get('/', (req, res) => res.json({ count: listReviews().length, minimumLabels: MIN_LABELS, calibration: getCalibrationModel() }));
router.get('/export.jsonl', (req, res) => {
  res.type('application/x-ndjson').send(listReviews().map((review) => JSON.stringify(review)).join('\n') + (listReviews().length ? '\n' : ''));
});
router.post('/', (req, res) => {
  const body = req.body || {};
  const review = {
    query: String(body.query || '').slice(0, 500), documentId: String(body.documentId || '').slice(0, 200),
    title: body.title, abstract: body.abstract,
    label: body.label, useful: Boolean(body.useful), quality: body.quality || 'unknown',
    relevance: body.relevance, goalFit: body.goalFit, evidenceQuality: body.evidenceQuality,
    semanticScore: body.semanticScore, coherence: body.coherence,
  };
  if (!addReview(review)) return res.status(400).json({ error: 'A query, document, valid label, and numeric ranking signals are required.' });
  res.status(201).json({ saved: true, count: listReviews().length, calibration: getCalibrationModel() });
});
module.exports = router;
