/**
 * data-enricher.js - Fast deterministic methods, dataset, URL, and reproducibility extraction.
 */

const URL_PATTERNS = {
  github: /https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/gi,
  huggingface: /https?:\/\/(?:www\.)?huggingface\.co\/(?:datasets\/)?[\w.-]+\/[\w.-]+/gi,
  zenodo: /https?:\/\/(?:www\.)?zenodo\.org\/(?:records?|record)\/[\w.-]+/gi,
  figshare: /https?:\/\/(?:www\.)?figshare\.com\/[\w./-]+/gi,
  arxiv: /https?:\/\/(?:arxiv\.org|doi\.org\/10\.48550\/arxiv\.)[\w./-]+/gi,
};

const METHOD_PATTERNS = [
  'neural networks', 'transformers', 'knowledge graphs', 'retrieval augmentation',
  'retrieval-augmented generation', 'fine-tuning', 'reinforcement learning',
  'reinforcement learning from human feedback', 'RLHF', 'self-consistency',
  'chain-of-thought', 'sparse autoencoders', 'contrastive learning',
  'supervised learning', 'large language models', 'deep learning', 'machine learning',
];

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function extractUrls(text) {
  return unique(Object.values(URL_PATTERNS).flatMap((pattern) => text.match(pattern) || []));
}

function enrichDocument(doc) {
  const title = doc.title || '';
  const abstract = doc.abstract || '';
  const text = `${title}. ${abstract}`;
  const lower = text.toLowerCase();
  const urls = extractUrls(text);
  const methods = unique(METHOD_PATTERNS.filter((method) => lower.includes(method.toLowerCase())))
    .map((name) => ({ name, extractedFrom: lower.includes(name.toLowerCase()) && title.toLowerCase().includes(name.toLowerCase()) ? 'title' : 'abstract' }));
  const datasetMatches = unique((text.match(/\b[A-Z][A-Za-z0-9-]{2,}(?:\s+[A-Z][A-Za-z0-9-]{2,})?\s+(?:dataset|benchmark|corpus)\b/g) || []));
  const datasets = datasetMatches.map((name) => ({
    name: name.replace(/\s+(dataset|benchmark|corpus)$/i, ''),
    type: /benchmark/i.test(name) ? 'benchmark' : 'other',
    availability: 'public',
    extractedFrom: 'abstract',
  }));
  const codeUrl = urls.find((url) => /github/i.test(url));
  const dataUrl = urls.find((url) => /huggingface|zenodo|figshare/i.test(url));
  const licenseOpen = Boolean(doc.access?.license || doc.access?.openAccess || /open access|creative commons|mit license|apache license/i.test(text));
  const codeAvailable = Boolean(codeUrl || doc.type === 'repository');
  const dataAvailable = Boolean(dataUrl || doc.type === 'dataset');
  const signals = Number(codeAvailable) + Number(dataAvailable) + Number(licenseOpen);
  return {
    methods,
    datasets,
    concepts: unique(lower.split(/[^a-z0-9-]+/).filter((word) => word.length > 5)).slice(0, 12),
    reproducibility: {
      codeAvailable, codeUrl, dataAvailable, dataUrl, licenseOpen,
      score: signals >= 3 ? 'high' : signals >= 1 ? 'medium' : 'low',
    },
    externalResources: urls.map((url) => ({ type: url.includes('github') ? 'github' : url.includes('huggingface') ? 'huggingface' : url.includes('zenodo') ? 'zenodo' : url.includes('arxiv') ? 'arxiv' : 'other', url })),
    extractionMethod: 'deterministic',
    confidence: 0.78,
    lastUpdated: new Date().toISOString(),
  };
}

async function enrichDocuments(documents) { return documents.map((doc) => ({ ...doc, enrichedMetadata: enrichDocument(doc) })); }

module.exports = { enrichDocument, enrichDocuments, extractUrls };
