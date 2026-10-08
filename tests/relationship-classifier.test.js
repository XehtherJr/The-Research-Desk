const assert = require('assert');
const {
  classifyRelationships,
  classifyRelationship,
  validateModelResults,
  relationshipToEvidenceType,
} = require('../backend/services/relationship-classifier');

assert.strictEqual(
  classifyRelationship({ title: 'Independent replication of the method', abstract: 'We reproduce the reported result.' }).relationship,
  'replicate'
);
assert.strictEqual(
  classifyRelationship({ title: 'A challenge to the method', abstract: 'The effect disappears in our evaluation.' }).relationship,
  'contradict'
);
assert.strictEqual(
  classifyRelationship({ title: 'An extension with improved scaling', abstract: 'We extend the original approach.' }).relationship,
  'extend'
);
assert.strictEqual(
  classifyRelationship({ title: 'Reference implementation', type: 'repository' }).relationship,
  'implement'
);
assert.strictEqual(
  classifyRelationship({ title: 'Unrelated historical context' }).relationship,
  'context'
);
assert.strictEqual(relationshipToEvidenceType('implement'), 'implementation');
const documents = [{ id: 'paper-1', title: 'A paper', abstract: 'A study.' }];
const validated = validateModelResults([
  { documentId: 'paper-1', relationship: 'support', confidence: 1.4, reason: 'It agrees.' },
  { documentId: 'unknown', relationship: 'contradict', confidence: 0.9, reason: 'Ignore me.' },
], documents);
assert.strictEqual(validated.get('paper-1').confidence, 1);
assert.strictEqual(validated.has('unknown'), false);

(async () => {
  const fallback = await classifyRelationships(documents, { title: 'A paper' }, { disableAI: true });
  assert.strictEqual(fallback.get('paper-1').extractionMethod, undefined);
  console.log('relationship classifier tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});