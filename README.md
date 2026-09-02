# Document Discovery Engine — Phase 1

An intentional, AI-native document discovery engine for searching, cataloging, and navigating scholarly papers, books, technical reports, empirical datasets, and code repositories.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D16-green)
![Catalog](https://img.shields.io/badge/catalog-OpenAlex-warm_neutral)

## Features

- 🔍 **Broad Document Discovery** — Search 250M+ scholarly works across papers, books, technical reports, datasets, and repositories via OpenAlex.
- 🏛️ **Library + Taxonomy + Minimalist Design** — Grounded in archival research aesthetics (warm off-white background, hairline dividers, display serif typography, square borders, generous whitespace).
- 🏷️ **Taxonomy Reading Path** — Built-in structural indicator orienting users from foundational theory to applied methods and data assets.
- 🎛️ **Multi-attribute Filtering** — Filter by document type, publication year range, and open access availability.
- ↕️ **Flexible Sorting** — Sort by OpenAlex relevance ranking, citation count, publication date, or title.
- 📥 **Export** — Download filtered search results as formatted CSV or JSON files.
- ⚡ **Zero Rate-Limiting Bottlenecks** — Powered by OpenAlex's unthrottled public API (no API keys required for Phase 1).

## Quick Start

### Prerequisites
- Node.js 16+
- No API keys required for Phase 1

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

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: `3000`) |
| `NODE_ENV` | No | `development` or `production` |

## Project Structure

```
file-search/
├── backend/
│   ├── server.js              # Local dev entry point
│   ├── app.js                 # Express app (shared)
│   ├── routes/search.js       # POST /api/search (OpenAlex search)
│   ├── services/
│   │   ├── openalex.js        # Primary OpenAlex search & abstract inverted index reconstruction
│   │   └── minimax.js         # Preserved for Phase 4+ AI evaluation
│   └── utils/normalize.js     # Standardized document normalization
├── frontend/
│   ├── index.html             # Semantic Library + Taxonomy structure
│   ├── styles.css             # Archival minimalist design system
│   └── app.js                 # Client-side controller (search, sort, filter, export)
├── netlify/functions/api.js   # Serverless API wrapper
├── netlify.toml               # Netlify configuration
└── package.json
```

## Deployment (Netlify)

1. Push code to GitHub repository
2. Connect repository on [Netlify](https://netlify.com)
3. Deploy — auto-deploys on push to `main`

## API

### `POST /api/search`

**Request:**
```json
{
  "query": "quantum error correction surface codes",
  "limit": 25
}
```

**Response:**
```json
{
  "query": "quantum error correction surface codes",
  "limit_requested": 25,
  "results_returned": 25,
  "total_matches": 255807,
  "duration_ms": 780,
  "timestamp": "2026-09-02T11:20:00.000Z",
  "source": "openalex",
  "results": [
    {
      "id": "openalex_W2060887031",
      "title": "Mixed-state entanglement and quantum error correction",
      "authors": ["Charles H. Bennett", "David P. DiVincenzo", "John A. Smolin", "William K. Wootters"],
      "date": "1996-11-01",
      "type": "paper",
      "abstract": "Entanglement purification protocols (EPPs) and quantum error-correcting codes...",
      "url": "https://doi.org/10.1103/physreva.54.3824",
      "metadata": {
        "openAccess": true,
        "openAccessPdf": "https://arxiv.org/pdf/quant-ph/9604024",
        "doi": "10.1103/physreva.54.3824",
        "venue": "Physical Review A",
        "citationCount": 5423,
        "source": "openalex",
        "referencedWorksCount": 45
      }
    }
  ]
}
```

## License

MIT