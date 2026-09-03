/**
 * app.js — Express application instance (no listen).
 * Used by both the local dev server and the Netlify serverless wrapper.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- API Routes ---
const searchRouter = require('./routes/search');
app.use('/api/search', searchRouter);
const reviewsRouter = require('./routes/reviews');
app.use('/api/reviews', reviewsRouter);

// Proxy direct document files so the browser can download cross-origin PDFs.
app.get('/api/download', async (req, res) => {
  const sourceUrl = String(req.query.url || '');
  if (!/^https?:\/\//i.test(sourceUrl)) return res.status(400).json({ error: 'A valid source URL is required.' });

  try {
    const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'ResearchDesk/1.0' } });
    if (!response.ok) return res.status(response.status).json({ error: 'The source file could not be retrieved.' });
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const filename = String(req.query.filename || 'research-document').replace(/[^a-z0-9._-]/gi, '_').slice(0, 120);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.status(502).json({ error: 'The source file could not be retrieved.' });
  }
});

// --- Static frontend files ---
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// --- Fallback: serve index.html for SPA-style routing ---
app.get('*', (req, res) => {
  // Don't catch API routes
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

module.exports = app;
