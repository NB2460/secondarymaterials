/**
 * db/podcast — queries for podcast_episodes, podcast_subscribers,
 *             and podcast_guest_applications tables.
 */
const { pool } = require('./index');

async function listEpisodes(limit = 20) {
  const res = await pool.query(
    `SELECT id, title, guest_name, guest_title, guest_company, description,
            youtube_url, video_url, duration_seconds, thumbnail_url, published_at,
            status, transcript, show_notes, key_takeaways, pull_quotes,
            chapter_timestamps, processing_error, itunes_summary, published_yt_video_id,
            created_at
     FROM podcast_episodes
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function subscribeEmail(email) {
  const res = await pool.query(
    `INSERT INTO podcast_subscribers (email)
     VALUES (LOWER($1))
     ON CONFLICT (LOWER(email)) DO NOTHING
     RETURNING id`,
    [email]
  );
  return res.rows[0];
}

async function saveGuestApplication({ name, title, company, linkedin_url, pitch }) {
  const res = await pool.query(
    `INSERT INTO podcast_guest_applications (name, title, company, linkedin_url, pitch)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [name, title || '', company || '', linkedin_url || '', pitch || '']
  );
  return res.rows[0];
}

async function createEpisode({ title, guest_name, guest_title, guest_company, video_url, thumbnail_url }) {
  const res = await pool.query(
    `INSERT INTO podcast_episodes (title, guest_name, guest_title, guest_company, video_url, thumbnail_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'processing')
     RETURNING *`,
    [title || '', guest_name, guest_title || '', guest_company || '', video_url || '', thumbnail_url || '']
  );
  return res.rows[0];
}

async function getEpisode(id) {
  const res = await pool.query(
    `SELECT * FROM podcast_episodes WHERE id = $1`,
    [id]
  );
  return res.rows[0];
}

async function updateEpisode(id, fields) {
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = $${idx}`);
    vals.push(val);
    idx++;
  }
  if (!sets.length) return null;
  vals.push(id);
  const res = await pool.query(
    `UPDATE podcast_episodes SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );
  return res.rows[0];
}

async function listPublishedEpisodes() {
  const res = await pool.query(
    `SELECT id, title, guest_name, guest_title, guest_company, description,
            youtube_url, duration_seconds, thumbnail_url, published_at,
            show_notes, itunes_summary
     FROM podcast_episodes
     WHERE youtube_url IS NOT NULL AND youtube_url != ''
     ORDER BY published_at DESC`
  );
  return res.rows;
}

module.exports = { listEpisodes, subscribeEmail, saveGuestApplication, createEpisode, getEpisode, updateEpisode, listPublishedEpisodes };