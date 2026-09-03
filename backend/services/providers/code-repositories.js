const { cachedJson } = require('../../utils/http-client');

async function searchCodeRepositories(query) {
  try {
    const cacheKey = query.toLowerCase().trim();
    const response = await cachedJson('github-search', cacheKey, `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=5`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ResearchDesk/2.0' } }, { ttlMs: 6 * 60 * 60 * 1000, timeoutMs: 3000 });
    if (!response.data) return [];
    const data = response.data;
    return (data.items || []).map((repo) => ({ id: `github_${repo.id}`, title: repo.full_name, canonicalUrl: repo.html_url, type: 'repository', metadata: { authors: [repo.owner?.login || 'GitHub'], published: repo.created_at || '', venue: 'GitHub', citationCount: repo.stargazers_count || 0 }, access: { openAccess: true, license: repo.license?.spdx_id || null }, abstract: repo.description || '', provenance: { providers: [{ provider: 'code', source: 'github', domain: 'github.com', url: repo.html_url }] } }));
  } catch (error) { return []; }
}
module.exports = { searchCodeRepositories };
