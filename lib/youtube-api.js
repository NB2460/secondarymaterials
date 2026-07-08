/**
 * lib/youtube-api — YouTube Data API v3 upload helper.
 * Auth via GOOGLE_APPLICATION_CREDENTIALS (service account JSON keyfile).
 */
const { google } = require('googleapis');
const fs = require('fs');

async function getYouTubeClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/youtube.upload']
  });
  const authClient = await auth.getClient();
  return google.youtube({ version: 'v3', auth: authClient });
}

/**
 * Upload a video to YouTube.
 * @param {object} opts
 * @param {string} opts.videoFilePath - local path to video file
 * @param {string} opts.title
 * @param {string} opts.description
 * @param {string[]} opts.tags
 * @param {string} opts.thumbnailPath - local path to thumbnail image
 * @returns {string} videoId
 */
async function uploadVideo({ videoFilePath, metadata = {} }) {
  const youtube = await getYouTubeClient();
  const { title, description, tags = [], thumbnailPath } = metadata;

  // Read video file as buffer for resumable upload
  const videoBuffer = fs.readFileSync(videoFilePath);

  // Step 1: insert the video
  const insertRes = await youtube.videos.insert(
    {
      part: 'snippet,status',
      notifySubscribers: false,
      requestBody: {
        snippet: {
          title: title || 'Untitled Episode',
          description: description || '',
          tags: tags.length ? tags : ['waste management', 'circularity', 'sustainability', 'e-waste', 'podcast'],
          categoryId: '27', // Education
          defaultLanguage: 'en'
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: videoBuffer
      }
    }
  );

  const videoId = insertRes.data.id;
  console.log(`[youtube-api] uploaded video ID: ${videoId}`);

  // Step 2: upload thumbnail if provided
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    try {
      const thumbBuffer = fs.readFileSync(thumbnailPath);
      await youtube.thumbnails.set(
        { videoId, part: 'snippet' },
        { media: { body: thumbBuffer } }
      );
      console.log(`[youtube-api] thumbnail set for ${videoId}`);
    } catch (err) {
      console.warn('[youtube-api] thumbnail upload failed:', err.message);
    }
  }

  return videoId;
}

/**
 * Get video privacy status.
 * @param {string} videoId
 * @returns {{ privacyStatus: string, title: string }}
 */
async function getVideoStatus(videoId) {
  const youtube = await getYouTubeClient();
  const res = await youtube.videos.list({
    part: 'snippet,status',
    id: [videoId]
  });
  if (!res.data.items || !res.data.items.length) {
    return { privacyStatus: 'not_found', title: '' };
  }
  const item = res.data.items[0];
  return { privacyStatus: item.status.privacyStatus, title: item.snippet.title };
}

module.exports = { uploadVideo, getVideoStatus };