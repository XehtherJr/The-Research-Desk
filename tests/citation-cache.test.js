const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { historicalMomentum, classifyCitationContext } = require('../backend/services/citation-enricher');

const momentum = historicalMomentum([
  { year: 2022, cited_by_count: 10 },
  { year: 2023, cited_by_count: 30 },
  { year: 2024, cited_by_count: 70 },
], 1.2);
assert.deepStrictEqual(momentum.timeline.length, 3);
assert.strictEqual(momentum.acceleration, 20);
assert.strictEqual(momentum.accelerating, true);
assert.strictEqual(classifyCitationContext('We use this method as a baseline architecture', 'Target'), 'methodological');
assert.strictEqual(classifyCitationContext('However, this work fails under comparison', 'Target'), 'critical');

const cache = require('../backend/utils/persistent-cache');
const directory = cache.cacheDirectory();
cache.set('test-cache', 'entry', { ok: true });
assert.deepStrictEqual(cache.get('test-cache', 'entry', 1000), { ok: true });
assert.ok(fs.existsSync(path.join(directory, 'test-cache.json')) || process.env.NETLIFY);
if (!process.env.NETLIFY) fs.rmSync(path.join(directory, 'test-cache.json'), { force: true });

console.log('Citation timeline and persistent cache tests passed.');
