/**
 * server.js — Local development entry point.
 * Loads env vars and starts the Express app on the configured port.
 */

require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n  🔬 Research Discovery App`);
  console.log(`  ────────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  API:     http://localhost:${PORT}/api/search`);
  console.log(`  Mode:    ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Minimax: ${process.env.MINIMAX_KEY ? '✓ Key configured' : '✗ No key (relationships disabled)'}`);
  console.log(`  Scholar: ${process.env.SCHOLAR_API_KEY ? '✓ Key configured' : '○ Using free tier (1 req/s)'}`);
  console.log('');
});
