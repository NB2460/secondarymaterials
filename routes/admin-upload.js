/**
 * Routes: /admin/upload — podcast episode upload + processing pipeline.
 * - Password-protected via PODCAST_ADMIN_PASSWORD env var
 * - Upload: receives .mp4/.m4a file, stores to R2
 * - Pipeline: transcribe (Gemini) → show notes (GPT-4o) → thumbnail (DALL-E 3)
 * - Result: draft episode saved in DB with status='draft'
 *
 * Does NOT own YouTube publishing — see routes/admin-podcast.js for that.
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();

const { createEpisode, getEpisode, updateEpisode, listEpisodes } = require('../db/podcast');
const { uploadToR2 } = require('../lib/r2-upload');
const { transcribeAudio } = require('../lib/gemini-transcribe');
const { generateShowNotes } = require('../lib/show-notes-gen');
const { generateEpisodeThumbnail } = require('../lib/thumbnail-gen');
const { adminAuth } = require('../lib/admin-auth');

// Use multer with memory storage (NOT diskStorage — Render fs is ephemeral)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 * 1024 }, // 1GB max
  fileFilter(req, file, cb) {
    const allowed = ['.mp4', '.m4a', '.mp3', '.wav', '.mov', '.webm'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only video/audio files are accepted (.mp4, .m4a, .mp3, .wav, .mov, .webm)'));
    }
  }
});

// ─── GET /admin/upload — upload form page ────────────────────────────────────

router.get('/', adminAuth, async (req, res) => {
  try {
    const episodes = await listEpisodes(20);
    res.render('admin-upload', { episodes, error: null, success: null });
  } catch (err) {
    console.error('[admin-upload] list error:', err.message);
    res.status(500).send('Failed to load episodes');
  }
});

// ─── POST /admin/upload — handle upload + run full pipeline ──────────────────

router.post('/', adminAuth, upload.single('audio_video'), async (req, res) => {
  const { guest_name, guest_title, guest_company } = req.body;

  if (!guest_name || !guest_name.trim()) {
    return res.redirect('/admin/upload?error=Guest name is required');
  }
  if (!req.file) {
    return res.redirect('/admin/upload?error=Audio/video file is required');
  }

  const file = req.file;
  const originalName = file.originalname;
  const mimeType = file.mimetype;

  try {
    // ── Step 1: Upload to R2 ────────────────────────────────────────────────
    console.log(`[admin-upload] uploading ${originalName} (${(file.size / 1024 / 1024).toFixed(1)}MB) to R2...`);
    const videoUrl = await uploadToR2(file.buffer, originalName, mimeType);
    console.log(`[admin-upload] R2 upload done: ${videoUrl}`);

    // ── Step 2: Create draft episode record ────────────────────────────────
    const episode = await createEpisode({
      title: originalName.replace(/\\[^.]+$/, '').replace(/[_-]/g, ' ').trim() || 'Untitled Episode',
      guest_name: guest_name.trim(),
      guest_title: (guest_title || '').trim(),
      guest_company: (guest_company || '').trim(),
      video_url: videoUrl,
      thumbnail_url: null
    });
    const episodeId = episode.id;
    console.log(`[admin-upload] draft episode created: id=${episodeId}`);

    // ── Run pipeline async (don't block the response) ─────────────────────
    runPipeline(episodeId, file.buffer, mimeType, { guest_name: guest_name.trim(), guest_title: guest_title.trim(), guest_company: guest_company.trim() }).catch(err => {
      console.error(`[admin-upload] pipeline error for episode ${episodeId}:`, err.message);
      updateEpisode(episodeId, { status: 'failed', processing_error: err.message }).catch(() => {});
    });

    res.redirect(`/admin/upload?id=${episodeId}&success=1`);
  } catch (err) {
    console.error('[admin-upload] upload error:', err.message);
    res.redirect(`/admin/upload?error=${encodeURIComponent(err.message)}`);
  }
});

// ─── GET /admin/upload/:id — per-episode processing status ──────────────────

router.get('/:id', adminAuth, async (req, res) => {
  try {
    const episode = await getEpisode(Number(req.params.id));
    if (!episode) return res.status(404).send('Episode not found');
    const episodes = await listEpisodes(20);
    const viewId = Number(req.params.id);
    const success = req.query.success === '1' ? `Episode #${viewId} is being processed. Refresh to see progress.` : null;
    const error = req.query.error || null;
    res.render('admin-upload', { episodes, episode, viewId, success, error });
  } catch (err) {
    console.error('[admin-upload] view error:', err.message);
    res.status(500).send('Failed to load episode');
  }
});

// ─── Pipeline ────────────────────────────────────────────────────────────────

async function runPipeline(episodeId, fileBuffer, mimeType, guest) {
  console.log(`[pipeline] starting for episode ${episodeId}`);

  // Step 1: Transcription
  await updateEpisode(episodeId, { status: 'transcribing' });
  const transcript = await transcribeAudio(fileBuffer, mimeType);
  console.log(`[pipeline] transcript done: ${transcript.length} chars`);
  await updateEpisode(episodeId, { status: 'generating_notes', transcript });

  // Step 2: Show notes generation
  const notes = await generateShowNotes({
    transcript,
    guestName: guest.guest_name,
    guestTitle: guest.guest_title,
    guestCompany: guest.guest_company
  });
  console.log(`[pipeline] show notes generated: ${notes.title}`);
  await updateEpisode(episodeId, {
    status: 'generating_thumbnail',
    title: notes.title,
    description: notes.description,
    show_notes: notes.keyTakeaways?.join('\n') || '',
    key_takeaways: JSON.stringify(notes.keyTakeaways || []),
    pull_quotes: JSON.stringify(notes.pullQuotes || []),
    chapter_timestamps: JSON.stringify(notes.chapterTimestamps || []),
    itunes_summary: notes.description
  });

  // Step 3: Thumbnail generation
  const thumbnailUrl = await generateEpisodeThumbnail({
    guestName: guest.guest_name,
    episodeTheme: notes.title
  });
  console.log(`[pipeline] thumbnail generated: ${thumbnailUrl}`);

  // Step 4: Save as draft
  await updateEpisode(episodeId, {
    status: 'draft',
    thumbnail_url: thumbnailUrl
  });
  console.log(`[pipeline] episode ${episodeId} complete — status=draft`);
}

module.exports = router;