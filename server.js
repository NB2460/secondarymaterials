const express = require('express');
const path = require('path');
const { buildLandingContext } = require('./lib/landing-context');

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Health check — intentionally does NOT query database (allows Neon auto-suspend)
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy' });
});

// Static overrides — must be BEFORE static middleware so these paths
// are handled by explicit handlers instead of falling through to file serving.
app.get('/emanifest', (req, res) => {
  res.sendFile('emanifest.html', { root: path.join(__dirname, 'public') }, err => {
    if (err) console.error('[emanifest] sendFile FAILED:', err.message);
  });
});

// API routes — BEFORE static so API paths don't accidentally hit static files
app.use('/api/analyze',    require('./routes/analyze'));
app.use('/api/leads',      require('./routes/leads'));
app.use('/api/events',     require('./routes/events'));
app.use('/api/bsd',       require('./routes/bsdscan'));
app.use('/api/emanifest', require('./routes/emanifest-scan'));
app.use('/api/emanifest', require('./routes/emanifest-pdf'));
app.use('/podcast/api',   require('./routes/podcast'));
app.use('/api/tasks',     require('./routes/tasks'));

// Admin pages — password-protected via PODCAST_ADMIN_PASSWORD
app.use('/admin/leads',     require('./routes/leads'));
app.use('/admin/analytics', require('./routes/events'));
app.use('/admin/podcast',   require('./routes/admin-podcast'));
app.use('/admin/upload',    require('./routes/admin-upload'));

// /admin → /admin/upload
app.get('/admin', (_req, res) => { res.redirect('/admin/upload'); });

// Page routes — EJS renders, no DB on request
app.get('/', (_req, res) => {
  res.render('layout', buildLandingContext());
});
app.get('/scan', (_req, res) => { res.render('scan'); });
app.get('/bsd',  (_req, res) => { res.render('bsd'); });

// Secondary Materials podcast — serves at /podcast on main domain
// and at secondarymaterials.wastetide.ai (via subdomain routing via x-original-host).
const PODCAST_EPISODES = [
  {
    id: 1,
    title: 'Closing the Loop on Battery Metals',
    guest_name: 'Geert Olbrechts',
    guest_title: 'Chief Technology Officer',
    guest_company: 'Umicore',
    description: 'Geert Olbrechts, CTO of Umicore, explores the critical role of closed-loop metallurgy in the battery revolution. From hydrometallurgy to urban mining, we trace the path from spent EV packs back to cathode precursors \u2014 and what it means for manufacturers, recyclers, and the grid.',
    youtube_url: '',
    duration_seconds: 3420,
    published_at: new Date('2026-06-18T08:26:15Z')
  },
  {
    id: 2,
    title: 'Fiction, Reality and the Future of E-Waste',
    guest_name: 'Chen Qiufan',
    guest_title: 'Author, Waste Tide',
    guest_company: 'Independent',
    description: "Chen Qiufan \u2014 author of Waste Tide and one of China\u2019s most acclaimed science fiction writers \u2014 joins us to examine the real-world e-waste crisis through the lens of fiction, journalism, and emerging policy. We discuss transmedia storytelling, the Silicon Valley of e-waste, and why this planet\u2019s future depends on what we do with our old phones.",
    youtube_url: '',
    duration_seconds: 2880,
    published_at: new Date('2026-06-24T08:26:15Z')
  }
];
const PODCAST_THUMB = 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/generated-images/company_139569/730922fc-7031-4a9c-ab11-4677fa581438.jpg';

function resolvePodcastHost(req) {
  const h = req.headers['x-original-host'] || req.headers['x-forwarded-host'] || '';
  // Normalize comma-separated lists and strip port
  return h.split(',')[0].trim().split(':')[0];
}

app.get('/podcast', (req, res) => {
  const canonicalHost = resolvePodcastHost(req);
  // If accessed via secondarymaterials.wastetide.ai subdomain, render podcast page
  // (x-original-host carries the original subdomain even when proxied to polsia.app)
  if (canonicalHost && canonicalHost !== req.headers.host) {
    res.setHeader('Cache-Control', 'no-store');
    res.render('podcast', {
      pageTitle: 'Secondary Materials \u2014 Podcast',
      episodes: PODCAST_EPISODES,
      defaultThumbnail: PODCAST_THUMB
    });
    return;
  }
  // On main domain: render podcast page at /podcast
  res.render('podcast', {
    pageTitle: 'Secondary Materials \u2014 Podcast',
    episodes: PODCAST_EPISODES,
    defaultThumbnail: PODCAST_THUMB
  });
});

// Catch-all static files — comes LAST so explicit routes above always take priority.
// `index: false` prevents public/index.html shadowing the EJS layout.
// `fallthrough: true` means a request that doesn't match a real file (e.g. /podcast
// with index:false) falls through to the next handler rather than sending 404,
// which OpenResty then treats as an error -> 502.
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  fallthrough: true,
}));

// ─── Startup ──────────────────────────────────────────────────────────────────
// Block server start until DB pool is warm. Neon cold-starts can take 5–10s;
// without this, the first user hits a 502 before the pool is ready.
const { pool } = require('./db/index');
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('[db-warmup] pool ready');
  } catch (err) {
    console.error('[db-warmup] failed — proceeding anyway:', err.message);
  }
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
})();