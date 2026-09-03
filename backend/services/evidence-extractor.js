/**
 * evidence-extractor.js - Abstract-level evidence extraction with graceful deterministic behavior.
 */

function extractEvidence(doc) {
  const text = `${doc.title || ''}. ${doc.abstract || ''}`;
  const methods = ['transformers', 'neural networks', 'fine-tuning', 'reinforcement learning', 'knowledge graphs', 'retrieval augmentation', 'meta-analysis', 'cohort study', 'randomized controlled trial', 'benchmark', 'survey'].filter((method) => text.toLowerCase().includes(method));
  const datasetMatches = text.match(/\b[A-Z][A-Za-z0-9-]{2,}(?:\s+[A-Z][A-Za-z0-9-]{2,})?\s+(?:dataset|benchmark|corpus)\b/g) || [];
  const datasets = [...new Set(datasetMatches.map((value) => value.replace(/\s+(dataset|benchmark|corpus)$/i, '')))];
  const findings = (doc.abstract || '').split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3);
  const links = (doc.enrichedMetadata?.externalResources || []).map((resource) => resource.url);
  return { methods, findings, data: { datasets, metrics: (text.match(/\b(?:accuracy|f1|precision|recall|auc|bleu|rouge)\b/gi) || []).map((metric) => metric.toUpperCase()) }, claims: { primary: findings.slice(0, 1), supporting: findings.slice(1), limitations: findings.filter((finding) => /limit|future work|challenge/i.test(finding)) }, implementationResources: { code: links.find((url) => /github/i.test(url)), datasets: links.find((url) => /huggingface|zenodo|figshare/i.test(url)) }, extractedVia: 'abstract' };
}

function extractEvidenceBatch(documents) { return documents.map((doc) => ({ ...doc, extractedEvidence: extractEvidence(doc) })); }

module.exports = { extractEvidence, extractEvidenceBatch };
