# Research Discovery App

Find and explore academic sources with AI-powered semantic relationship detection.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D16-green)

## Features

- 🔍 **Search** academic papers via Semantic Scholar
- 🧠 **AI Relationship Detection** — Minimax M3 classifies papers as conceptually-similar, builds-on, responds-to, alternative-method, shared-dataset, or explicit-critique
- 📊 **Interactive Table** — sortable columns, color-coded relationship badges
- 🎛️ **Client-side Filtering** — filter by relationship type, date range, open access
- 📥 **Export** — download filtered results as CSV
- 🔢 **JSON View** — toggle raw API response
- ⚡ **Fast** — batched M3 calls (5 papers/batch), parallel execution

## Quick Start

### Prerequisites
- Node.js 16+
- Minimax API key ([get one here](https://platform.minimax.io/))

### Installation

```bash
git clone <your-repo-url>
cd research-discovery-app
npm install
cp .env.example .env
# Edit .env: add your MINIMAX_KEY
```

### Run Locally

```bash
npm run dev
# Open http://localhost:3000
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MINIMAX_KEY` | Yes | Minimax M3 API key for relationship detection |
| `SCHOLAR_API_KEY` | No | Semantic Scholar API key (higher rate limits) |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `development` or `production` |

## Project Structure

```
├── backend/
│   ├── server.js              # Local dev entry point
│   ├── app.js                 # Express app (shared)
│   ├── routes/search.js       # POST /api/search
│   ├── services/
│   │   ├── semantic-scholar.js  # Scholar API client
│   │   └── minimax.js           # M3 relationship classifier
│   └── utils/normalize.js     # Result normalization
├── frontend/
│   ├── index.html             # Main page
│   ├── styles.css             # Dark mode design system
│   └── app.js                 # Client-side logic
├── netlify/functions/api.js   # Serverless wrapper
├── netlify.toml               # Netlify config
└── package.json
```

## Deployment (Netlify)

1. Push to GitHub
2. Connect repo on [netlify.com](https://netlify.com)
3. Set environment variables in Netlify dashboard:
   - `MINIMAX_KEY` = your API key
4. Deploy — auto-deploys on every push to `main`

## API

### POST /api/search

```json
{
  "query": "quantum error correction",
  "limit": 25
}
```

**Response:**
```json
{
  "query": "quantum error correction",
  "limit_requested": 25,
  "results_returned": 23,
  "duration_ms": 4200,
  "timestamp": "2024-08-28T14:30:00Z",
  "results": [...]
}
```

## Cost

~$0.01 per search (25 papers × Minimax M3 batched calls). Semantic Scholar API is free.

## License

MIT