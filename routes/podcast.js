/**
 * routes/podcast — page and API for Secondary Materials podcast landing page.
 * Does NOT own episode video hosting (YouTube links only).
 */
const express = require('express');
const router = express.Router();
const { listEpisodes, subscribeEmail, saveGuestApplication } = require('../db/podcast');
const { sendInboxMessage } = require('../lib/polsia-notify');

const DB_TIMEOUT_MS = 5000;

// ─── Page ───────────────────────────────────────────────────────────────────
// Data is hardcoded here (not fetched at render time) so the page loads
// instantly without a DB cold-start hit. Episode data comes from the
// migration seed and can be updated via the API when needed.
const SEEDED_EPISODES = [
  {
    id: 1,
    title: 'Closing the Loop on Battery Metals',
    guest_name: 'Geert Olbrechts',
    guest_title: 'Chief Technology Officer',
    guest_company: 'Umicore',
    description: 'Geert Olbrechts, CTO of Umicore, explores the critical role of closed-loop metallurgy in the battery revolution. From hydrometallurgy to urban mining, we trace the path from spent EV packs back to cathode precursors — and what it means for manufacturers, recyclers, and the grid.',
    duration_seconds: 3420,
    youtube_url: '',
    published_at: new Date('2026-06-18T08:26:15Z')
  },
  {
    id: 2,
    title: 'Fiction, Reality and the Future of E-Waste',
    guest_name: 'Chen Qiufan',
    guest_title: 'Author, Waste Tide',
    guest_company: 'Independent',
    description: 'Chen Qiufan — author of Waste Tide and one of China\u2019s most acclaimed science fiction writers — joins us to examine the real-world e-waste crisis through the lens of fiction, journalism, and emerging policy. We discuss transmedia storytelling, the Silicon Valley of e-waste, and why thecli\u2019s future depends on what we do with our old phones.',
    duration_seconds: 2880,
    youtube_url: '',
    published_at: new Date('2026-06-24T08:26:15Z')
  }
];

router.get('/', async (_req, res) => {
  res.render('podcast', {
    pageTitle: 'Secondary Materials \u2014 Podcast',
    episodes: SEEDED_EPISODES,
    defaultThumbnail: 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/generated-images/company_139569/730922fc-7031-4a9c-ab11-4677fa581438.jpg'
  });
});

// ─── Email subscribe ────────────────────────────────────────────────────────

router.post('/subscribe', express.urlencoded({ extended: false }), async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !/^[^\/\/@]+@[^\/@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  try {
    const row = await withTimeout(subscribeEmail(email), DB_TIMEOUT_MS);
    res.json({ ok: true, added: !!row });
  } catch (err) {
    console.error('[podcast] subscribe error:', err.message);
    res.status(500).json({ error: 'Server error, please try again' });
  }
});

// ─── Guest application ───────────────────────────────────────────────────────

router.post('/apply', express.urlencoded({ extended: false }), async (req, res) => {
  const { name, title, company, linkedin_url, pitch } = req.body;
  if (!name || !pitch) {
    return res.status(400).json({ error: 'Name and pitch are required' });
  }
  try {
    await withTimeout(saveGuestApplication({ name, title, company, linkedin_url, pitch }), DB_TIMEOUT_MS);

    sendInboxMessage({
      subject: `Guest Application: ${name} — ${company || 'no company'}`,
      message: `**New guest application for Secondary Materials podcast**\n\n**Name:** ${name}\n**Title:** ${title || '—'}\n**Company:** ${company || '—'}\n**LinkedIn:** ${linkedin_url || '—'}\n\n**Pitch:**\n${pitch}`,
      kind: 'summary'
    }).catch(() => { /* non-critical */ });

    res.json({ ok: true });
  } catch (err) {
    console.error('[podcast] apply error:', err.message);
    res.status(500).json({ error: 'Server error, please try again' });
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), ms))
  ]);
}

module.exports = router;