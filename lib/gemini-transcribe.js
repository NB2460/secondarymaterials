/**
 * lib/gemini-transcribe — audio/video transcription via Google Gemini multimodal API.
 * Passes the file directly to Gemini (no pre-processing/encoding required).
 * Uses POLSIA_API_TOKEN for auth via Polsia proxy.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.POLSIAGEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '');

const MODEL = 'gemini-2.0-flash';

/**
 * Transcribe an audio or video file.
 * @param {Buffer} fileBuffer - raw file bytes
 * @param {string} mimeType - MIME type (video/mp4, audio/m4a, etc.)
 * @returns {Promise<string>} plain-text transcript
 */
async function transcribeAudio(fileBuffer, mimeType) {
  const model = genAI.getGenerativeModel({ model: MODEL });

  // Gemini multimodal API accepts audio/video directly as base64-encoded data
  const base64Data = fileBuffer.toString('base64');

  const result = await model.generateContent({
    inlineData: {
      mimeType,
      data: base64Data,
    },
    prompt: 'Please provide a full, accurate transcript of this audio/video content. Preserve speaker labels if clearly indicated. If there are multiple speakers, use [Speaker 1], [Speaker 2] etc. Give the complete transcript without summarizing or omitting content.',
  });

  const response = result.response;
  const transcript = response.text().trim();

  if (!transcript) {
    throw new Error('[gemini-transcribe] Empty transcript returned');
  }

  return transcript;
}

module.exports = { transcribeAudio };