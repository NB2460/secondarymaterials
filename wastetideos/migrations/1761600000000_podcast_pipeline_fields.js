/**
 * Migration: podcast_pipeline_fields
 * Adds pipeline-related fields for the episode upload & processing pipeline.
 * Idempotent — uses DO blocks so adding a column that already exists is safe.
 */
exports.up = async (db) => {
  // status — from pipeline
  await db.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='podcast_episodes' AND column_name='status') THEN
    ALTER TABLE podcast_episodes ADD COLUMN status VARCHAR(50) DEFAULT 'draft';
  END IF;
END $$`);

  // transcript — from Gemini
  await db.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='podcast_episodes' AND column_name='transcript') THEN
    ALTER TABLE podcast_episodes ADD COLUMN transcript TEXT;
  END IF;
END $$`);

  // key_takeaways — from GPT-4o
  await db.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='podcast_episodes' AND column_name='key_takeaways') THEN
    ALTER TABLE podcast_episodes ADD COLUMN key_takeaways TEXT;
  END IF;
END $$`);

  // pull_quotes — from GPT-4o
  await db.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='podcast_episodes' AND column_name='pull_quotes') THEN
    ALTER TABLE podcast_episodes ADD COLUMN pull_quotes TEXT;
  END IF;
END $$`);

  // chapter_timestamps — from GPT-4o
  await db.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='podcast_episodes' AND column_name='chapter_timestamps') THEN
    ALTER TABLE podcast_episodes ADD COLUMN chapter_timestamps TEXT;
  END IF;
END $$`);

  // processing_error — pipeline error log
  await db.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='podcast_episodes' AND column_name='processing_error') THEN
    ALTER TABLE podcast_episodes ADD COLUMN processing_error TEXT;
  END IF;
END $$`);

  // Ensure video_url exists (may already exist from youtube_fields migration)
  await db.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='podcast_episodes' AND column_name='video_url') THEN
    ALTER TABLE podcast_episodes ADD COLUMN video_url VARCHAR(500);
  END IF;
END $$`);

  // Ensure itunes_summary exists (may already exist)
  await db.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='podcast_episodes' AND column_name='itunes_summary') THEN
    ALTER TABLE podcast_episodes ADD COLUMN itunes_summary TEXT;
  END IF;
END $$`);

  // Ensure published_yt_video_id exists (may already exist)
  await db.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='podcast_episodes' AND column_name='published_yt_video_id') THEN
    ALTER TABLE podcast_episodes ADD COLUMN published_yt_video_id VARCHAR(50);
  END IF;
END $$`);
};

exports.down = async (db) => {
  for (const col of ['status', 'transcript', 'key_takeaways', 'pull_quotes', 'chapter_timestamps', 'processing_error']) {
    await db.query(`DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='podcast_episodes' AND column_name='${col}') THEN
    ALTER TABLE podcast_episodes DROP COLUMN ${col};
  END IF;
END $$`);
  }
};