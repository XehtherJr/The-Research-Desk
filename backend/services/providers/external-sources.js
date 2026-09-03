const sourceProfiles = {
  loc: { label: 'Library of Congress', endpoint: 'https://www.loc.gov/books/', route: /book|literature|history|archive|free books?/i },
  nara: { label: 'National Archives', endpoint: 'https://catalog.archives.gov/api/v2/records/search', route: /archive|history|government|record/i },
  europepmc: { label: 'Europe PMC', endpoint: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search', route: /medical|clinical|health|disease|bipolar|patient|biology|gene|protein/i },
  eric: { label: 'ERIC', endpoint: 'https://api.ies.ed.gov/eric/', route: /education|teaching|learning|school|pedagog/i },
  courtlistener: { label: 'CourtListener', endpoint: 'https://www.courtlistener.com/api/rest/v3/search/', route: /law|legal|court|case|statute|judicial/i },
  core: { label: 'CORE', endpoint: 'https://api.core.ac.uk/v3/search/works', route: /.*/, requiresKey: true },
  crossref: { label: 'Crossref', endpoint: 'https://api.crossref.org/works', route: /psycholog|behavior|econom|repec|nber|geophys|climate|lingu|perseus|smithsonian|psycholing|language/i },
  smithsonian: { label: 'Smithsonian Scholarly Press', endpoint: 'https://api.crossref.org/works', access: 'crossref-metadata-fallback', route: /smithsonian|museum|anthropolog|archaeolog/i },
  maxplanck: { label: 'Max Planck Institute for Psycholinguistics', endpoint: 'https://api.crossref.org/works', access: 'crossref-metadata-fallback', route: /language|lingu|psycholing|speech|lexic/i },
  apa: { label: 'American Psychological Association', endpoint: 'https://api.crossref.org/works', access: 'crossref-metadata-fallback', route: /psycholog|behavior|mental health|bipolar|cognitive/i },
  casbs: { label: 'Center for Advanced Study in the Behavioral Sciences', endpoint: 'https://api.crossref.org/works', access: 'crossref-metadata-fallback', route: /behavior|social science|psycholog|sociolog/i },
  perseus: { label: 'Perseus Digital Library', endpoint: 'https://api.crossref.org/works', access: 'crossref-metadata-fallback', route: /classics|ancient|greek|latin|perseus|literature/i },
  repec: { label: 'RePEc', endpoint: 'https://api.crossref.org/works', access: 'crossref-metadata-fallback', route: /econom|finance|repec|market|labor|trade/i },
  nber: { label: 'National Bureau of Economic Research', endpoint: 'https://api.crossref.org/works', access: 'crossref-metadata-fallback', route: /econom|finance|nber|macroeconom|labor|trade/i },
  agu: { label: 'American Geophysical Union', endpoint: 'https://api.crossref.org/works', access: 'crossref-metadata-fallback', route: /geophys|climate|earth science|seism|ocean|atmospher/i },
};

function makeDocument(id, title, url, abstract, source, type = 'paper', metadata = {}) {
  return { id: `${source}_${id}`, canonicalUrl: url, title: title || `${source} result`, type, metadata: { authors: metadata.authors || [], published: metadata.published || '', venue: sourceProfiles[source]?.label || source, citationCount: metadata.citationCount || 0, doi: metadata.doi || null, sourceAccess: metadata.sourceAccess || sourceProfiles[source]?.access || 'dedicated-public-api' }, access: { openAccess: true }, abstract: abstract || '', provenance: { providers: [{ provider: source, source, domain: new URL(url).hostname, url }] } };
}

async function jsonFetch(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { const response = await fetch(url, { ...options, signal: controller.signal }); return response.ok ? response.json() : null; }
  catch { return null; }
  finally { clearTimeout(timer); }
}

async function searchExternalSource(source, query) {
  const profile = sourceProfiles[source];
  if (!profile || (profile.requiresKey && !process.env.CORE_API_KEY)) return [];
  if (source === 'loc') {
    const data = await jsonFetch(`${profile.endpoint}?q=${encodeURIComponent(query)}&fo=json&c=5`);
    return (data?.results || []).map((item) => makeDocument(item.id || item.title, item.title, item.id || 'https://www.loc.gov/', item.description?.[0] || '', source, 'book'));
  }
  if (source === 'europepmc') {
    const data = await jsonFetch(`${profile.endpoint}?query=${encodeURIComponent(query)}&format=json&pageSize=5`);
    return (data?.resultList?.result || []).map((item) => makeDocument(item.id || item.title, item.title, item.fullTextUrlList?.fullTextUrl?.[0]?.url || `https://europepmc.org/article/${item.source}/${item.id}`, item.abstractText, source, 'paper', { published: item.firstPublicationDate, citationCount: item.citedByCount }));
  }
  if (source === 'eric') {
    const data = await jsonFetch(`${profile.endpoint}?search=${encodeURIComponent(query)}&format=json`);
    return (data?.response?.docs || data?.results || []).slice(0, 5).map((item) => makeDocument(item.id || item.ED || item.title, item.title, item.url || `https://eric.ed.gov/?q=${encodeURIComponent(query)}`, item.description || item.abstract, source, 'paper'));
  }
  if (source === 'nara') {
    const data = await jsonFetch(`${profile.endpoint}?q=${encodeURIComponent(query)}&rows=5`);
    return (data?.opaResponse?.results || data?.results || []).map((item) => makeDocument(item.naId || item.id || item.title, item.title, item.url || 'https://catalog.archives.gov/', item.description || item.scopeAndContentNote, source, 'report'));
  }
  if (source === 'courtlistener') {
    const data = await jsonFetch(`${profile.endpoint}?q=${encodeURIComponent(query)}&type=o&order_by=score%20desc`);
    return (data?.results || []).slice(0, 5).map((item) => makeDocument(item.cluster_id || item.absolute_url, item.caseName || item.case_name, `https://www.courtlistener.com${item.absolute_url || '/'}`, item.citation || '', source, 'report'));
  }
  if (source === 'core') {
    const data = await jsonFetch(`${profile.endpoint}?q=${encodeURIComponent(query)}&limit=5`, { headers: { Authorization: `Bearer ${process.env.CORE_API_KEY}` } });
    return (data?.results || []).map((item) => makeDocument(item.id || item.title, item.title, item.downloadUrl || item.sourceFulltextUrls?.[0] || 'https://core.ac.uk/', item.abstract, source));
  }
  const data = await jsonFetch(`${profile.endpoint}?query.bibliographic=${encodeURIComponent(query)}&rows=5`);
  return (data?.message?.items || []).map((item) => makeDocument(item.DOI || item.title, item.title?.[0], item.URL || `https://api.crossref.org/works/${item.DOI}`, item.abstract, source, 'paper', { doi: item.DOI, published: item.published?.['date-parts']?.[0]?.join('-'), citationCount: item['is-referenced-by-count'], sourceAccess: profile.access || 'dedicated-public-api' }));
}

function routedSources(query, analysis = {}) {
  const domain = analysis.domain?.primary && analysis.domain.primary !== 'general-research' ? analysis.domain.primary : '';
  const text = `${query} ${domain}`;
  return Object.entries(sourceProfiles).filter(([, profile]) => profile.route.test(text) && (!profile.requiresKey || process.env.CORE_API_KEY)).map(([source]) => source);
}

async function searchExternalSources(query, analysis = {}) {
  const sources = routedSources(query, analysis);
  const results = await Promise.all(sources.map(async (source) => ({ source, documents: await searchExternalSource(source, query) })));
  return results.flatMap(({ source, documents }) => documents.map((doc) => ({ ...doc, provenance: { ...doc.provenance, providers: doc.provenance.providers.map((provider) => ({ ...provider, provider: source })) } })));
}

module.exports = { searchExternalSources, searchExternalSource, routedSources, sourceProfiles };