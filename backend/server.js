/**
 * server.js — Local development entry point for Document Discovery Engine.
 * Loads env vars and starts the Express app on the configured port.
 */

require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n  📖 Document Discovery Engine (Phase 1)`);
  console.log(`  ──────────────────────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  API:     http://localhost:${PORT}/api/search`);
  console.log(`  Mode:    ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Source:  ✓ OpenAlex (Free, unthrottled scholarly & document catalog)`);
  console.log('');
});
