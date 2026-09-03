async function searchGrants(query) {
  try {
    const response = await fetch(`https://api.reporter.nih.gov/v2/projects/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criteria: { text_search_text: query }, limit: 5, offset: 0 }) });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.results || []).map((grant) => ({ id: `grant_${grant.core_project_num || grant.project_num}`, title: grant.project_title, canonicalUrl: `https://reporter.nih.gov/project-details/${grant.appl_id}`, type: 'grant', metadata: { authors: [grant.principal_investigators?.[0]?.full_name || 'NIH'], published: grant.project_start_date || '', venue: grant.agency_ic_admin?.abbreviation || 'NIH', citationCount: 0 }, access: { openAccess: true }, abstract: grant.abstract_text || '', provenance: { providers: [{ provider: 'grant', source: 'nih-reporter', domain: 'reporter.nih.gov' }] } }));
  } catch (error) { return []; }
}
module.exports = { searchGrants };
