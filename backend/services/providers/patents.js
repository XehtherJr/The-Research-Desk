async function searchPatents(query) {
  try {
    const response = await fetch(`https://api.patentsview.org/api/v1/patent/?q=${encodeURIComponent(query)}&f=[\"patent_title\",\"patent_abstract\"]&o={\"size\":5}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.patents || []).map((patent) => ({ id: `patent_${patent.patent_id}`, title: patent.patent_title, canonicalUrl: `https://patents.google.com/patent/${patent.patent_id}`, type: 'patent', metadata: { authors: [], published: patent.patent_date || '', venue: 'PatentView', citationCount: 0 }, access: { openAccess: true }, abstract: patent.patent_abstract || '', provenance: { providers: [{ provider: 'patent', source: 'patentsview', domain: 'patentsview.org' }] } }));
  } catch (error) { return []; }
}
module.exports = { searchPatents };
