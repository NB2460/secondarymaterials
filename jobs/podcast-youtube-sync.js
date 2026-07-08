/**
 * jobs/podcast-youtube-sync — weekly YouTube metadata sync cron.
 * Guards with POLSIA_IN_PROCESS_CRONS_ENABLED=true and requires
 * GOOGLE_APPLICATION_CREDENTIALS to be set.
 *
 * Run via: node jobs/podcast-youtube-sync.js
 * Schedule (polsia.toml): 0 9 * * 1 (Monday 9am local)
 */
if (process.env.POLSIA_IN_PROCESS_CRONS_ENABLED !== 'true') {
  console.log('[podcast-youtube-sync] disabled (POLSIA_IN_PROCESS_CRONS_ENABLED != true)');
  process.exit(0);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('[podcast-youtube-sync] GOOGLE_APPLICATION_CREDENTIALS not set — aborting');
  process.exit(1);
}

const { getVideoStatus } = require('../lib/youtube-api');
const { listPublishedEpisodes } = require('../db/podcast');

async function main() {
  console.log('[podcast-youtube-sync] starting sync check');

  const episodes = await listPublishedEpisodes();
  let checked = 0;
  let mismatches = 0;

  for (const ep of episodes) {
    // Extract video ID from youtube_url like https://youtu.be/VIDEOID
    const ytMatch = ep.youtube_url && ep.youtube_url.match(/youtu.be\/([^?]+)/);
    if (!ytMatch) {
      console.warn(`[podcast-youtube-sync] episode ${ep.id} has no parseable YouTube URL: ${ep.youtube_url}`);
      continue;
    }
    const videoId = ytMatch[1];
    checked++;

    try {
      const status = await getVideoStatus(videoId);
      if (status.privacyStatus !== 'public') {
        console.warn(`[podcast-youtube-sync] episode ${ep.id} (${ep.title}) YouTube video ${videoId} is ${status.privacyStatus} — expected public`);
        mismatches++;
      } else {
        console.log(`[podcast-youtube-sync] episode ${ep.id} OK — ${videoId} is public`);
      }
    } catch (err) {
      console.error(`[podcast-youtube-sync] episode ${ep.id} API error: ${err.message}`);
    }
  }

  console.log(`[podcast-youtube-sync] done — checked ${checked} episodes, ${mismatches} mismatches`);
  process.exit(0);
}

main().catch(err => {
  console.error('[podcast-youtube-sync] unexpected error:', err.message);
  process.exit(1);
});