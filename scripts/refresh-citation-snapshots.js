const { recordSnapshot } = require('../backend/services/citation-snapshots');
const { fetchJson } = require('../backend/utils/http-client');

const identifiers = process.argv.slice(2).slice(0, 20);
if (!identifiers.length) {
  console.error('Usage: node scripts/refresh-citation-snapshots.js <OpenAlex work ID or DOI> ...');
  process.exitCode = 1;
} else {
  (async () => {
    let refreshed = 0;
    for (const identifier of identifiers) {
      const encoded = identifier.startsWith('https://openalex.org/')
        ? `https://api.openalex.org/works/${identifier.split('/').pop()}`
        : /^W\d+$/i.test(identifier)
          ? `https://api.openalex.org/works/${identifier}`
          : `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(identifier)}`;
      const response = await fetchJson(encoded, { headers: { Accept: 'application/json' } }, { timeoutMs: 3000 });
      if (response.data?.id && recordSnapshot(response.data.id, response.data.counts_by_year || [])) refreshed++;
    }
    console.log(`Citation snapshots refreshed: ${refreshed}/${identifiers.length}`);
  })();
}