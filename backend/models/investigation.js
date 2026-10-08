function createInvestigation({ id, paper, claims = [], evidence = [], contradictions = [], followUps = [], implementations = [], dependencies = [] }) {
  const now = new Date().toISOString();
  return {
    id,
    paperId: paper.id,
    createdAt: now,
    updatedAt: now,
    paper,
    claims,
    evidence,
    contradictions,
    followUps,
    implementations,
    dependencies,
    status: 'complete',
    lastUpdated: now,
    updateCount: 0,
  };
}

module.exports = { createInvestigation };