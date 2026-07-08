/**
 * lib/show-notes-gen — generate structured show notes from transcript + guest metadata.
 * Uses GPT-4o via OpenAI proxy.
 */
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://polsia.com/ai/openai/v1',
});

/**
 * Generate show notes from a transcript.
 * @param {object} opts
 * @param {string} opts.transcript - plain-text transcript
 * @param {string} opts.guestName
 * @param {string} opts.guestTitle
 * @param {string} opts.guestCompany
 * @returns {Promise<{title, description, keyTakeaways, pullQuotes, chapterTimestamps}>}
 */
async function generateShowNotes({ transcript, guestName, guestTitle, guestCompany }) {
  const guestLine = [guestName, guestTitle, guestCompany].filter(Boolean).join(' · ');

  const prompt = `You are producing show notes for the podcast "Secondary Materials" (wastetide.ai/podcast), hosted by Nicolas Brien.

Guest: ${guestLine}

Below is the full transcript of the episode. Generate the following sections:

1. EPISODE TITLE — punchy, 8 words max, reflects the core topic.
2. EPISODE DESCRIPTION — 150 words, highlights key themes and insights.
3. 5 KEY TAKEAWAYS — bullet points, each 1-2 sentences.
4. 3 PULL QUOTES — one compelling sentence each, as spoken.
5. CHAPTER TIMESTAMPS — 5-7 suggested chapter markers with time (MM:SS) and title. Estimate from content progression.

Return your response as a JSON object with these exact keys:
- title (string)
- description (string, ~150 words)
- keyTakeaways (array of 5 strings)
- pullQuotes (array of 3 strings)
- chapterTimestamps (array of {time: "MM:SS", label: string})

TRANSCRIPT:
${transcript}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a podcast production assistant. Output ONLY valid JSON matching the requested schema — no markdown fences, no explanation, no preamble.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.7,
    max_tokens: 1500,
  });

  const raw = response.choices[0]?.message?.content?.trim() || '';
  // Strip markdown fences if present
  const jsonStr = raw.replace(/^```json\n?/, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    // Attempt to extract JSON from partial output
    const match = jsonStr.match(/(\\{.*\\})/s);
    if (match) {
      try { return JSON.parse(match[1]); } catch (_) {}
    }
    throw new Error(`[show-notes-gen] JSON parse failed: ${err.message}. Raw: ${raw.substring(0, 200)}`);
  }
}

module.exports = { generateShowNotes };