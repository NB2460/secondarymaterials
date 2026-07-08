/**
 * Routes: /admin/podcast — podcast admin (episode list + publish to YouTube).
 * Also serves /admin/podcast/feed.xml as the RSS feed endpoint.
 */
const express = require('express');
const router = express.Router();
const { listEpisodes, getEpisode, updateEpisode, listPublishedEpisodes } = require('../db/podcast');
const { uploadVideo } = require('../lib/youtube-api');
const { sendEmail } = require('../lib/email-notify');

const PODCAST_COVER = 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/generated-images/company_139569/730922fc-7031-4a9c-ab11-4677fa581438.jpg';

// PATCH /admin/podcast/:id — update episode fields (title, show notes, description, etc.)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const allowedFields = ['title', 'description', 'show_notes', 'itunes_summary', 'duration_seconds', 'thumbnail_url', 'youtube_url'];
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields provided' });
  }

  try {
    const updated = await updateEpisode(Number(id), updates);
    if (!updated) return res.status(404).json({ error: 'Episode not found' });
    res.json({ ok: true, episode: updated });
  } catch (err) {
    console.error('[admin-podcast] patch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /admin/podcast — episode list with publish controls
router.get('/', async (req, res) => {
  try {
    const episodes = await listEpisodes(50);
    const published = episodes.filter(e => e.youtube_url && e.youtube_url.trim()).length;
    const drafts = episodes.length - published;
    res.render('admin-podcast', { episodes, published, drafts, success: req.query.published === '1', error: req.query.error || null });
  } catch (err) {
    console.error('[admin-podcast] list error:', err.message);
    res.status(500).send('Failed to load episodes');
  }
});

// POST /admin/podcast/publish — upload to YouTube and mark published
router.post('/publish', async (req, res) => {
  const { episodeId } = req.body;
  if (!episodeId) return res.redirect('/admin/podcast?error=episodeId required');

  try {
    const episode = await getEpisode(Number(episodeId));
    if (!episode) return res.redirect('/admin/podcast?error=Episode not found');

    if (!episode.video_url) {
      return res.redirect(`/admin/podcast?error=${encodeURIComponent('Episode has no video_url — set video_url before publishing')}`);
    }

    // uploadVideo reads the R2 URL, fetches the file, and uploads it
    const videoId = await uploadVideo({
      videoFilePath: episode.video_url, // local path (polsia_infra downloads R2 file to temp path before calling job)
      metadata: {
        title: episode.title,
        description: buildDescription(episode),
        tags: ['waste management', 'circularity', 'sustainability', 'e-waste', 'podcast']
      }
    });

    const youtubeUrl = `https://youtu.be/${videoId}`;
    await updateEpisode(Number(episodeId), {
      youtube_url: youtubeUrl,
      published_yt_video_id: videoId,
      published_at: new Date()
    });

    await sendEmail({
      to: 'wastetideos@polsia.app',
      subject: `🎬 Episode Published: ${episode.title}`,
      text: `${episode.title} is now live on YouTube.\n\nYouTube URL: ${youtubeUrl}\n\nManage in admin: https://wastetide.ai/admin/podcast`
    });

    res.redirect('/admin/podcast?published=1');
  } catch (err) {
    console.error('[admin-podcast] publish error:', err.message);
    res.redirect(`/admin/podcast?error=${encodeURIComponent(err.message)}`);
  }
});

// GET /admin/podcast/feed.xml — RSS 2.0 feed with iTunes tags
router.get('/feed.xml', async (_req, res) => {
  try {
    const episodes = await listPublishedEpisodes();
    res.render('feed', {
      episodes,
      podcastCover: PODCAST_COVER,
      buildPubDate,
      formatDuration
    }, (err, html) => {
      if (err) {
        console.error('[admin-podcast/feed] render error:', err.message);
        return res.status(500).send('Failed to render feed');
      }
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.send(html);
    });
  } catch (err) {
    console.error('[admin-podcast/feed] error:', err.message);
    res.status(500).send('Failed to render feed');
  }
});

function buildDescription(episode) {
  const parts = [];
  if (episode.description) parts.push(episode.description);
  if (episode.show_notes) parts.push(`\n\n---\n\n${episode.show_notes}`);
  parts.push(`\n\nHosted by Nicolas Brien · WastetideOS\nhttps://wastetide.ai/podcast`);
  return parts.join('');
}

function buildPubDate(date) {
  if (!date) return '';
  return new Date(date).toUTCString();
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = router;