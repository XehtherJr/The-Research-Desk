const assert = require('assert');
const {
  normalizeDoi,
  normalizeArxivId,
  parsePaperInput,
} = require('../backend/services/paper-resolver');
const { createInvestigation } = require('../backend/models/investigation');

assert.strictEqual(normalizeDoi('https://doi.org/10.1234/ABC'), '10.1234/abc');
assert.strictEqual(normalizeArxivId('https://arxiv.org/pdf/2401.12345.pdf'), '2401.12345');
assert.deepStrictEqual(parsePaperInput({ url: 'https://doi.org/10.1234/example' }), {
  doi: '10.1234/example',
  arxivId: '',
  url: 'https://doi.org/10.1234/example',
});
assert.throws(() => parsePaperInput({}), /required/);

const investigation = createInvestigation({
  id: 'inv_test',
  paper: { id: 'paper_test', title: 'Test paper' },
});
assert.strictEqual(investigation.status, 'complete');
assert.strictEqual(investigation.paperId, 'paper_test');
assert.ok(investigation.createdAt);
console.log('investigation tests passed');