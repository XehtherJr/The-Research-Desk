const store = new Map();

function cloneInvestigation(investigation) {
  if (!investigation) return null;
  return JSON.parse(JSON.stringify(investigation));
}

function saveInvestigation(investigation) {
  if (!investigation || !investigation.id) {
    throw new Error('Investigation requires an id to be saved.');
  }

  const snapshot = cloneInvestigation(investigation);
  store.set(snapshot.id, snapshot);
  return snapshot;
}

function getInvestigation(id) {
  if (!id) return null;
  const investigation = store.get(id);
  return investigation ? cloneInvestigation(investigation) : null;
}

function listInvestigations() {
  return Array.from(store.values()).map(cloneInvestigation);
}

module.exports = {
  saveInvestigation,
  getInvestigation,
  listInvestigations,
};
