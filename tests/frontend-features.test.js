const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('frontend/feature-utils.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const features = context.window.ResearchDeskFeatures;
const terms = features.refinementTerms(
  { relevanceProfile: { expandedTerms: ['speed reading', 'model', 'reading rate'] } },
  [
    { evaluation: { relevance: 90, topicalMatch: { passes: true } }, document: { enrichedMetadata: { concepts: ['RSVP', 'approach'] } } },
    { evaluation: { relevance: 0, topicalMatch: { passes: false } }, document: { enrichedMetadata: { concepts: ['irrelevant'] } } },
  ],
);
assert.ok(terms.includes('speed reading'));
assert.ok(terms.includes('RSVP'));
assert.ok(!terms.includes('model'));
assert.ok(!terms.includes('irrelevant'));
assert.strictEqual(features.libraryMatches({ title: 'A paper', abstract: 'RSVP reading rate strategies', text: '', query: '' }, 'RSVP'), true);
assert.strictEqual(features.libraryMatches({ title: 'A paper', abstract: 'RSVP reading rate strategies', text: '', query: '' }, 'unrelated'), false);
console.log('Frontend feature tests passed.');