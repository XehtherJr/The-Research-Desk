function precisionAt(results, relevantIds, k) {
  const relevant = new Set(relevantIds || []);
  const top = results.slice(0, k);
  return top.length ? top.filter((result) => relevant.has(result.document?.id || result.id)).length / top.length : 0;
}

function dcg(results, relevantIds, k) {
  const relevant = new Set(relevantIds || []);
  return results.slice(0, k).reduce((sum, result, index) => {
    const hit = relevant.has(result.document?.id || result.id) ? 1 : 0;
    return sum + hit / Math.log2(index + 2);
  }, 0);
}

function ndcgAt(results, relevantIds, k) {
  const ideal = Math.min(k, (relevantIds || []).length);
  if (!ideal) return 0;
  const idealDcg = Array.from({ length: ideal }, () => 1).reduce((sum, hit, index) => sum + hit / Math.log2(index + 2), 0);
  return dcg(results, relevantIds, k) / idealDcg;
}

module.exports = { precisionAt, dcg, ndcgAt };
