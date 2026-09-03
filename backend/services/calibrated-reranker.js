const { listReviews } = require('./review-store');

const MIN_LABELS = 50;
const FEATURE_KEYS = ['relevance', 'goalFit', 'evidenceQuality', 'semanticScore', 'coherence'];
function sigmoid(value) { return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value)))); }
function normalize(review) { return FEATURE_KEYS.map((key) => Math.max(0, Math.min(100, Number(review[key]) || 0)) / 100); }

function trainCalibration(reviews = listReviews()) {
  const usable = reviews.filter((review) => review.label && FEATURE_KEYS.every((key) => Number.isFinite(Number(review[key]))));
  if (usable.length < MIN_LABELS || new Set(usable.map((review) => review.label)).size < 2) return { trained: false, sampleSize: usable.length, weights: null };
  const weights = [0, 0, 0, 0, 0];
  let intercept = 0;
  for (let epoch = 0; epoch < 180; epoch++) {
    for (const review of usable) {
      const features = normalize(review);
      const prediction = sigmoid(intercept + weights.reduce((sum, weight, index) => sum + weight * features[index], 0));
      const error = (review.label === 'relevant' ? 1 : 0) - prediction;
      intercept += error * 0.08;
      features.forEach((feature, index) => { weights[index] += error * feature * 0.08; });
    }
  }
  const split = Math.max(1, Math.floor(usable.length * 0.2));
  const validation = usable.slice(-split);
  const baselineAccuracy = validation.filter((review) => (Number(review.relevance) >= 50) === (review.label === 'relevant')).length / validation.length;
  const calibratedAccuracy = validation.filter((review) => (calibrateFeatures({ relevance: review.relevance, goalFit: review.goalFit, evidenceQuality: review.evidenceQuality, semanticScore: review.semanticScore, coherence: review.coherence }, { trained: true, intercept, weights }) >= 0.5) === (review.label === 'relevant')).length / validation.length;
  const promoted = calibratedAccuracy >= baselineAccuracy;
  return { trained: true, promoted, sampleSize: usable.length, intercept, weights, validation: { baselineAccuracy, calibratedAccuracy }, trainedAt: new Date().toISOString() };
}

let cachedModel = null;
let cachedReviewCount = -1;
function getCalibrationModel() {
  const reviews = listReviews();
  if (!cachedModel || reviews.length !== cachedReviewCount) {
    cachedModel = trainCalibration(reviews);
    cachedReviewCount = reviews.length;
  }
  return cachedModel;
}
function calibrateFeatures(features, model = getCalibrationModel()) {
  if (!model.trained || !model.promoted) return null;
  const vector = FEATURE_KEYS.map((key) => Math.max(0, Math.min(100, Number(features[key]) || 0)) / 100);
  return Number(sigmoid(model.intercept + model.weights.reduce((sum, weight, index) => sum + weight * vector[index], 0)).toFixed(4));
}
module.exports = { trainCalibration, getCalibrationModel, calibrateFeatures, MIN_LABELS, FEATURE_KEYS };
