const assert = require('assert');
const { precisionAt, ndcgAt } = require('../backend/utils/ranking-metrics');
const { MIN_HOST_INTERVAL_MS, MAX_RETRIES } = require('../backend/utils/http-client');

const results = [{ document: { id: 'a' } }, { document: { id: 'b' } }, { document: { id: 'c' } }];
assert.strictEqual(precisionAt(results, ['a', 'c'], 2), 0.5);
assert.ok(ndcgAt(results, ['a', 'c'], 3) > 0.6);
assert.strictEqual(MAX_RETRIES, 1);
assert.strictEqual(MIN_HOST_INTERVAL_MS, 250);
console.log('Hardening and ranking metric tests passed.');
