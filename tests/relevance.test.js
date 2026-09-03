const assert = require('assert');
const { buildRelevanceProfile, scoreDocumentRelevance } = require('../backend/services/query-relevance');

function document(title, abstract = '') { return { title, abstract }; }

const jarvis = buildRelevanceProfile('JARVIS codebase', ['JARVIS', 'codebase']);
assert.strictEqual(scoreDocumentRelevance(document('MicroscopyGPT: Atomic Structure Captions', 'vision-language transformers and experiments'), jarvis).passes, false);
assert.strictEqual(scoreDocumentRelevance(document('JARVIS codebase', 'A software repository for JARVIS'), jarvis).passes, true);

const speedReading = buildRelevanceProfile('how to speed read books', ['speed', 'read', 'books']);
assert.ok(speedReading.anchors.includes('reading rate'));
assert.strictEqual(scoreDocumentRelevance(document('Using LISREL for Structural Equation Modeling', 'A researcher guide to statistical modeling'), speedReading).passes, false);
assert.strictEqual(scoreDocumentRelevance(document('The speed reading method', 'Reading rate and comprehension strategies for books'), speedReading).passes, true);

console.log('Relevance regression tests passed.');