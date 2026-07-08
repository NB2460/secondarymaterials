/**
 * lib/thumbnail-gen — generate podcast episode thumbnails via OpenAI image generation.
 * Uses OpenAI proxy (DALL-E under the hood).
 */
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://polsia.com/ai/openai/v1',
});

/**
 * Generate a thumbnail image for a podcast episode.
 * @param {object} opts
 * @param {string} opts.guestName
 * @param {string} opts.episodeTheme - short theme/topical keyword
 * @param {string} opts.episodeTitle - full episode title (optional, for context)
 * @returns {Promise<string>} URL of generated image
 */
async function generateEpisodeThumbnail({ guestName, episodeTheme, episodeTitle }) {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: `Podcast episode thumbnail for "Secondary Materials". Dark background (#080e0b), vivid lime accent (#b8f04a). Shows abstract industrial/waste/material imagery with clean typography. No text in image. Cinematic and editorial feel, suitable for a podcast cover. Design style inspired by wastetide.ai brand — dark, modern, minimal.`,
    size: '1792x1024',
    quality: 'hd',
    style: 'vivid',
    n: 1,
  });

  const url = response.data?.[0]?.url;
  if (!url) throw new Error('[thumbnail-gen] No image URL returned');
  return url;
}

module.exports = { generateEpisodeThumbnail };