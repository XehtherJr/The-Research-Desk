# Recent Updates

Read [README.md](README.md) first for the full architecture, setup instructions, API contract, and research-role definitions. This file summarizes the latest implementation changes and current operating model.

## Search Precision

- Added hard topical admission rules so coherence, citations, and source authority cannot rescue an irrelevant document.
- Added phrase-aware and boundary-aware matching to prevent substring collisions such as `read` matching `researcher`.
- Added anchor expansion for named projects, code repositories, speed reading, clinical topics, and related domain phrases.
- Added an optional embedding reranker through OpenRouter, with a deterministic lexical fallback when no embedding key is configured.
- Added regression coverage for the JARVIS/codebase and speed-reading false-positive cases.

## Retrieval And Sources

- Limited query planning to a maximum of three structured subqueries.
- Added subquery provenance, lane quotas, convergence bonuses, and a bounded exploration band.
- Added routed external source profiles for books, archives, biomedical research, psychology, education, economics, law, and geoscience.
- Company catalogs are now searched only for AI, software, repository, or named-company queries and no longer pad unrelated searches with arbitrary catalog entries.
- Added provider health and candidate rejection counts to search metadata.

## Ranking And Evidence

- Role ordering is now query-specific. Building and repository searches place Implementation first.
- Citation authority is separated from methodological quality.
- Added age-aware and coarse field-normalized citation velocity metadata.
- Added a calibrated coherence floor and intent-specific coherence thresholds.
- Added request IDs and structured search telemetry for diagnosing retrieval, admission, evaluation, and ranking behavior.

## User Experience

- The frontend follows the backend's role order for both result sections and role tabs.
- Empty searches show intent-aware suggestions instead of arbitrary fallback papers.
- The search API exposes diagnostics that help distinguish unavailable providers from rejected candidates.

## Validation

Run the focused relevance and golden-set checks with:

```bash
npm test
```

The current golden set covers 15 searches across software, books, clinical research, economics, education, law, classics, geoscience, biology, AI, psychology, and datasets. It includes 30 positive checks and 17 deliberate hard negatives. The application still supports deterministic operation without API keys; OpenRouter embeddings and AI evaluation are optional enhancements.

## Remaining Advanced Work

Historical citation timelines and bounded citation-context analysis now use free OpenAlex metadata. Citation context is sampled from at most 8 citing-work requests per search, and search results are persisted locally for 6 hours with a 500-entry / 10 MB cache limit. The cache uses the system temporary directory in Netlify/serverless environments and falls back to memory if disk writes are unavailable.

Citation timelines are also retained as up to 12 historical snapshots per OpenAlex work. Run `npm run snapshots -- W123 DOI` to refresh up to 20 works manually. Institutional source profiles now distinguish dedicated public endpoints from Crossref metadata fallbacks.

The following are not yet complete: dedicated APIs for every institutional source, historical citation snapshots beyond the timeline data exposed by OpenAlex, and a trained cross-encoder or calibrated ranking model. These should be evaluated against a larger labeled query-document set before being introduced into the default ranking path.

Provider requests now use one bounded retry, per-host spacing, short timeouts, and persistent caches. Deterministic relevance includes corpus-aware term rarity, and reusable precision/nDCG helpers support future labeled ranking evaluations.

The default path remains free: OpenAlex, Crossref, Europe PMC, LOC, NARA, GitHub, Zenodo, PubMed, and other public endpoints are used within bounded request limits. Embeddings remain optional; no embedding or AI key is required for search, testing, citation timelines, or citation context analysis.

An optional local review interface now records Relevant / Not relevant judgments on result cards. After 20 or more labeled examples containing both classes, a bounded logistic calibration model adjusts ranking; before that threshold, the deterministic no-key ranker remains active. Reviews are stored locally and are never sent to a paid service.
