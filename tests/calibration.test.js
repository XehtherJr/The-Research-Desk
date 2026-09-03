const assert = require('assert');
const { trainCalibration, MIN_LABELS } = require('../backend/services/calibrated-reranker');

const reviews = Array.from({ length: MIN_LABELS }, (_, index) => ({
  label: index % 2 ? 'not-relevant' : 'relevant',
  relevance: index % 2 ? 10 : 90,
  goalFit: index % 2 ? 20 : 85,
  evidenceQuality: 60,
  semanticScore: index % 2 ? 15 : 88,
  coherence: index % 2 ? 25 : 90,
}));
const model = trainCalibration(reviews);
assert.strictEqual(model.trained, true);
assert.strictEqual(typeof model.promoted, 'boolean');
assert.ok(model.validation && Number.isFinite(model.validation.baselineAccuracy));
assert.ok(model.weights.length === 5);
assert.strictEqual(trainCalibration(reviews.slice(0, MIN_LABELS - 1)).trained, false);
console.log('Calibration tests passed.');
