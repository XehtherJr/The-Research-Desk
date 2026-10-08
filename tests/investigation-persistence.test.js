const assert = require('node:assert/strict');
const { saveInvestigation, getInvestigation } = require('../backend/services/investigation-store');

const investigation = {
  id: 'investigation_123',
  paperId: 'paper_abc',
  paper: {
    id: 'paper_abc',
    title: 'Sample paper',
  },
  claims: [
    {
      id: 'claim_1',
      text: 'This paper is notable.',
      evidence: [],
      contradictions: [],
    },
  ],
  evidence: [],
  contradictions: [],
  followUps: [],
  implementations: [],
  dependencies: [],
  status: 'complete',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
  updateCount: 0,
};

const saved = saveInvestigation(investigation);
assert.deepEqual(saved, investigation);
assert.deepEqual(getInvestigation('investigation_123'), investigation);
assert.equal(getInvestigation('missing_investigation'), null);

console.log('investigation persistence ok');
