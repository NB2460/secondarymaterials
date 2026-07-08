// e-manifest.us — EPA Form 8700-22 generator from WasteScope scans
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check (no DB query — allows Neon auto-suspend)
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy' });
});

// API routes
app.use('/api', require('./routes/upload'));
app.use('/api/manifest', require('./routes/manifest'));

// SPA — single page app at root
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`e-manifest.us running on port ${port}`);
});

module.exports = app;