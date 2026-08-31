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
