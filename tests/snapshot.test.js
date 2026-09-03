const assert = require('assert');
const fs = require('fs');
const { recordSnapshot, getSnapshotHistory, snapshotPath, MAX_WORKS, MAX_BYTES } = require('../backend/services/citation-snapshots');

assert.ok(MAX_WORKS > 0);
assert.ok(MAX_BYTES > 0);
assert.strictEqual(recordSnapshot('W_TEST', [{ year: 2024, citations: 3 }]), true);
assert.strictEqual(getSnapshotHistory('W_TEST').at(-1).timeline[0].citations, 3);
if (fs.existsSync(snapshotPath()) && !process.env.NETLIFY) fs.rmSync(snapshotPath(), { force: true });
console.log('Citation snapshot tests passed.');