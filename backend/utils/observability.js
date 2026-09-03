const crypto = require('crypto');

function requestId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function logSearch(event) {
  console.info(JSON.stringify({ service: 'research-desk', event: 'search', ...event }));
}

module.exports = { requestId, logSearch };