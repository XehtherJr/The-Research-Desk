# The Research Desk — V2 Architecture

An AI-native, goal-oriented document discovery engine. Rather than simply matching keywords, the system understands your research intent, plans a multi-provider search strategy, queries academic indexes and company research scrapers, evaluates evidence, and organizes results by research role.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D16-green)
![Providers](https://img.shields.io/badge/providers-OpenAlex%20%7C%20Crossref%20%7C%209%20Company%20Scrapers-warm_neutral)

---

## The V2 Discovery Loop

The search pipeline now separates three concerns: broad retrieval, soft domain coherence, and goal-relative usefulness. Query analysis creates an intent-driven search policy with retrieval lanes, but domains remain open: coherence lowers or raises ranking confidence rather than rejecting unexpected disciplines.

```
Query → QueryAnalysis → SearchPolicy/Lanes → Multi-provider Retrieval →
Deduplication → Data Enrichment → Domain Coherence → Evidence Extraction →
Citation Context → Goal Evaluation → Intent-aware Discovery Ranking
```

V2 adds cached deterministic services for query analysis, search policy generation, domain coherence, evidence extraction, methods/dataset/reproducibility signals, and citation momentum. It also queries Zenodo, GitHub, NIH Reporter, and PubMed when appropriate, while preserving graceful degradation for unavailable providers.

## The V1 Discovery Loop

```
User Goal → Search Plan → Multi-Provider Retrieval → Deduplication → Evidence Evaluation → Discovery Ranking → Role-Organized Discovery UI
```

1. **Query Planner**: Infers intent (`building`, `learning`, `understanding`, `researching`), goal, concepts, evidence needs, and subqueries.
2. **Multi-Provider Retrieval**: Queries **OpenAlex**, **Crossref**, and **over 20 Institutional Scrapers** (Anthropic, OpenAI, DeepMind, Meta AI, Microsoft Research, Apple ML, NVIDIA, NASA, Genentech) with 24-hour caching.
3. **Deduplication & Provenance Aggregation**: Merges duplicates by DOI, canonical URL, and Sørensen–Dice title similarity ($\ge 0.85$), aggregating multi-source provenance.
4. **Document Understanding & Evaluation**: Evaluates documents relative to the user's goal, extracting concrete evidence items, contributions, and "Why Useful" explanations.
5. **Goal-Relative Discovery Ranker**: Optimizes for goal-fit, relevance, and evidence quality ($0.5 \cdot \text{goalFit} + 0.3 \cdot \text{relevance} + 0.2 \cdot \text{quality} - \text{redundancyPenalty}$) while applying diversity constraints across roles and authors.
6. **Archival Library UI**: Light paper aesthetic (`#FAFAF8`), display serif typography (*Crimson Pro*), collapsible SearchPlan transparency view, role-based stream navigation, evidence tags, and multi-provider badges.

---

## Research Roles

Results are curated and organized into five distinct research roles:
- 🏛️ **Foundational**: Literature surveys, core theoretical groundings, and landmark frameworks.
- 🔬 **Applied & Methods**: Empirical architectures, algorithms, detection methodologies, and experiments.
- ⚙️ **Implementation**: Working codebases, production frameworks, and practical deployment tools.
- 📊 **Data & Assets**: Evaluation benchmarks, ground truth datasets, and telemetry.
- 💡 **Alternative Perspectives**: Complementary paradigms, orthogonal approaches, and critical analyses.

---

## Quick Start

### Prerequisites
- Node.js 16+
- Works out-of-the-box with deterministic fallbacks even with no API keys.
- (Optional) OpenRouter / Minimax key for AI-assisted query planning and document evaluation.

### Installation

```bash
git clone <your-repo-url>
cd file-search
npm install
cp .env.example .env
```

### Run Locally

```bash
npm run dev
# Open http://localhost:3000
```

---

## Performance Targets & Guardrails

- **Query Planning**: $<1.5$ seconds (AI with 2.5s timeout, deterministic fallback)
- **Retrieval (Parallel)**: $<5$ seconds across OpenAlex, Crossref, and Company Scrapers
- **Deduplication**: $<100$ms
- **Document Evaluation**: Batches of 5 documents with evaluation cache per `(documentId + searchPlanId)`
- **Discovery Ranking**: $<10$ms with role diversity constraint
- **Total Pipeline Latency**: Measured and reported in response metadata

---

## API

### `POST /api/search`

**Request:**
```json
{
  "query": "I want to build a system that detects hallucinations in LLMs",
  "limit": 20
}
```

**Response:**
```json
{
  "query": "I want to build a system that detects hallucinations in LLMs",
  "searchPlan": {
    "intent": {
      "type": "building",
      "goal": "Build an LLM hallucination detection system",
      "confidence": 0.92
    },
    "concepts": ["LLM hallucination", "hallucination detection", "evaluation", "reliability"],
    "evidenceNeeds": [
      { "type": "methodology", "description": "Detection approaches and algorithms" },
      { "type": "benchmark", "description": "Evaluation benchmarks" }
    ],
    "documentTypes": ["research_paper", "technical_report", "dataset", "github_repository"],
    "subqueries": [
      { "query": "LLM hallucination detection", "sources": ["openalex", "crossref"] }
    ],
    "expectedRoles": ["foundational", "applied", "implementation", "dataset"],
    "reasoning": "Searching for methodologies, benchmarks, and working implementations."
  },
  "results": [
    {
      "rank": 1,
      "role": "applied",
      "whyUseful": "Introduces proven methodologies and experimental validations directly applicable to your goal.",
      "discoveredVia": ["OpenAlex", "Company: ANTHROPIC"],
      "document": { ... },
      "evidence": [ ... ]
    }
  ],
  "metadata": {
    "totalCandidates": 54,
    "candidatesAfterDedup": 47,
    "evaluatedCount": 25,
    "returnedCount": 20,
    "timing": {
      "query_planning_ms": 3,
      "retrieval_ms": 766,
      "deduplication_ms": 67,
      "evaluation_ms": 5,
      "ranking_ms": 1,
      "total_ms": 844
    },
    "providers": ["OpenAlex", "Crossref", "Company: ANTHROPIC", "Company: OPENAI"]
  }
}
```

## License

This project is released under the MIT License. See [LICENSE.md](LICENSE.md) for the complete license text.