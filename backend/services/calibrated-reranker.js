const { listReviews } = require('./review-store');

const MIN_LABELS = 20;
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
  return { trained: true, sampleSize: usable.length, intercept, weights, trainedAt: new Date().toISOString() };
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
  if (!model.trained) return null;
  const vector = FEATURE_KEYS.map((key) => Math.max(0, Math.min(100, Number(features[key]) || 0)) / 100);
  return Number(sigmoid(model.intercept + model.weights.reduce((sum, weight, index) => sum + weight * vector[index], 0)).toFixed(4));
}
module.exports = { trainCalibration, getCalibrationModel, calibrateFeatures, MIN_LABELS, FEATURE_KEYS };
