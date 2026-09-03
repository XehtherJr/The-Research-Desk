const assert = require('assert');
const cases = require('./golden-set.json');
const { buildRelevanceProfile, scoreDocumentRelevance } = require('../backend/services/query-relevance');

let passed = 0;
let positiveChecks = 0;
let negativeChecks = 0;
let paraphraseCases = 0;
for (const testCase of cases) {
  if (testCase.paraphrase) paraphraseCases++;
  const profile = buildRelevanceProfile(testCase.query, testCase.query.split(/\s+/));
  for (const title of testCase.mustMatch) {
    positiveChecks++;
    assert.strictEqual(scoreDocumentRelevance({ title, abstract: '' }, profile).passes, true, `${testCase.query}: expected ${title}`);
  }
  for (const title of testCase.mustNotMatch) {
    negativeChecks++;
    assert.strictEqual(scoreDocumentRelevance({ title, abstract: 'model experiment' }, profile).passes, false, `${testCase.query}: rejected ${title}`);
  }
  passed++;
}

const totalChecks = positiveChecks + negativeChecks;
console.log(`Golden relevance set passed: ${passed}/${cases.length} cases; precision proxy ${totalChecks}/${totalChecks} (${positiveChecks} positive, ${negativeChecks} negative checks); paraphrase cases ${paraphraseCases}`);