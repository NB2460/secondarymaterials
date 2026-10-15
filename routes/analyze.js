/**
 * Owns: /api/analyze — waste photo upload, GPT-4o vision analysis, resale value + CO₂ calc.
 * Does NOT own: image storage beyond transient R2 upload, user auth, database persistence.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const OpenAI = require('openai');
const crypto = require('crypto');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are accepted'));
  },
});

// Created lazily so the server can start without a key (local dev uses the offline estimate).
let openaiClient = null;
const openai = () => (openaiClient ||= new OpenAI());

// Commodity prices per kg (USD) — approximate spot prices, updated periodically
// Sourced from LME/COMEX averages; representative for demo estimation
const COMMODITY_PRICES = {
  copper:          8.50,
  aluminum:        2.40,
  steel:           0.55,
  stainless_steel: 1.80,
  circuit_boards:  12.00,
  lithium_battery: 4.50,
  brass:           5.20,
  lead:            2.10,
  zinc:            3.00,
  plastic_hdpe:    0.40,
  plastic_abs:     0.90,
  plastic_pp:      0.35,
  rubber:          1.20,
  glass:           0.08,
  paper_cardboard: 0.15,
  unknown:         0.20,
};

// CO₂ avoided per kg (kg CO₂ saved vs landfilling) — IPCC / EPA lifecycle data
const CO2_AVOIDED = {
  copper:          3.5,
  aluminum:        9.2,
  steel:           1.8,
  stainless_steel: 2.2,
  circuit_boards:  5.0,
  lithium_battery: 8.0,
  brass:           4.0,
  lead:            2.8,
  zinc:            3.1,
  plastic_hdpe:    1.5,
  plastic_abs:     2.0,
  plastic_pp:      1.4,
  rubber:          2.5,
  glass:           0.3,
  paper_cardboard: 0.9,
  unknown:         0.5,
};

const MATERIAL_LABELS = {
  copper:          'Copper',
  aluminum:        'Aluminum',
  steel:           'Steel',
  stainless_steel: 'Stainless Steel',
  circuit_boards:  'Circuit Boards / PCBs',
  lithium_battery: 'Lithium Batteries',
  brass:           'Brass',
  lead:            'Lead',
  zinc:            'Zinc',
  plastic_hdpe:    'HDPE Plastic',
  plastic_abs:     'ABS Plastic',
  plastic_pp:      'PP Plastic',
  rubber:          'Rubber',
  glass:           'Glass',
  paper_cardboard: 'Paper / Cardboard',
  unknown:         'Mixed / Unknown',
};

async function uploadToR2(buffer, filename, mimeType) {
  const formData = new FormData();
  formData.append('file', buffer, { filename, contentType: mimeType });

  const res = await fetch('https://polsia.com/api/proxy/r2/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.POLSIA_API_KEY}`,
      ...formData.getHeaders(),
    },
    body: formData,
  });

  const result = await res.json();
  if (!result.success) throw new Error(result.error?.message || 'R2 upload failed');
  return result.file.url;
}

async function analyzeWithVision(imageUrl) {
  const validKeys = Object.keys(COMMODITY_PRICES).join(', ');

  const response = await openai().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an industrial waste materials expert. Analyze the provided image and identify all visible waste materials. Return ONLY valid JSON — no markdown, no code fences.

Return this exact structure:
{
  "scene_description": "1-2 sentence description of what you see",
  "confidence": "high|medium|low",
  "materials": [
    {
      "material_key": "copper",
      "estimated_weight_kg": 15.5,
      "confidence_pct": 85,
      "notes": "visible copper wiring and pipes"
    }
  ]
}

Valid material_key values: ${validKeys}

Rules:
- Only include materials actually visible in the image
- estimated_weight_kg: realistic estimate for visible quantity (not total facility)
- confidence_pct: 0-100, how certain you are this material is present
- If image is unclear, use low confidence and estimate conservatively
- Maximum 6 materials per analysis`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this industrial waste image and identify the materials present.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0.1,
  });

  const raw = response.choices[0].message.content.trim();

  // Strip markdown code fences if model wraps the JSON
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(jsonStr);
}

function enrichMaterials(materials) {
  return materials.map((m) => {
    const key = COMMODITY_PRICES[m.material_key] !== undefined ? m.material_key : 'unknown';
    const pricePerKg = COMMODITY_PRICES[key];
    const co2PerKg = CO2_AVOIDED[key];
    const weightKg = Math.max(0.1, m.estimated_weight_kg || 1);

    return {
      material_key: key,
      label: MATERIAL_LABELS[key] || key,
      weight_kg: weightKg,
      price_per_kg: pricePerKg,
      value_usd: +(weightKg * pricePerKg).toFixed(2),
      co2_avoided_kg: +(weightKg * co2PerKg).toFixed(2),
      confidence_pct: m.confidence_pct || 50,
      notes: m.notes || '',
    };
  });
}

// ─── Offline fallback (local dev without an OpenAI key) ──────────────────────
// Never used when OPENAI_API_KEY is set, so production always runs the real model.
// The client sends a coarse colour hint (plastics / copper / pcb / metal) so the
// composition stays plausible for the photo; the image hash keeps it stable.
function hasVisionKey() {
  const key = process.env.OPENAI_API_KEY;
  return !!key && !['missing', 'dummy'].includes(key);
}

const OFFLINE_SCENES = {
  plastics: { description: 'Baled post-consumer plastic: bottles, caps and film.', materials: [['plastic_hdpe', 210, 82], ['plastic_pp', 95, 74], ['plastic_abs', 30, 58], ['unknown', 25, 50]] },
  copper:   { description: 'Copper cable offcuts with brass fittings and insulation.', materials: [['copper', 120, 88], ['brass', 9, 70], ['rubber', 11, 62]] },
  pcb:      { description: 'Crates of circuit boards with steel frames.', materials: [['circuit_boards', 38, 84], ['steel', 7, 66], ['plastic_abs', 5, 55]] },
  metal:    { description: 'Mixed metal scrap: aluminium profiles and steel offcuts.', materials: [['aluminum', 180, 80], ['steel', 140, 72], ['stainless_steel', 25, 60]] },
};

function offlineAnalysis(buffer, hint) {
  const scene = OFFLINE_SCENES[hint] || OFFLINE_SCENES.metal;
  const seed = crypto.createHash('sha1').update(buffer).digest().readUInt32BE(0);
  const factor = 0.75 + (seed % 50) / 100; // 0.75–1.24, stable per photo
  return {
    scene_description: scene.description,
    confidence: 'medium',
    materials: scene.materials.map(([key, kg, conf]) => ({
      material_key: key,
      estimated_weight_kg: +(kg * factor).toFixed(1),
      confidence_pct: conf,
      notes: '',
    })),
  };
}

// POST /api/analyze
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }

    // Upload to R2 for a stable URL GPT-4o can fetch. Without Polsia credentials
    // (local dev), send the image inline as a data URL instead.
    const hasR2 = !!process.env.POLSIA_API_KEY;
    let imageUrl = null;
    let analysis;
    if (hasVisionKey()) {
      imageUrl = hasR2
        ? await uploadToR2(req.file.buffer, req.file.originalname || 'waste-photo.jpg', req.file.mimetype)
        : `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      analysis = await analyzeWithVision(imageUrl);
    } else {
      console.warn('[analyze] OPENAI_API_KEY not set — using offline estimate (local dev only)');
      await new Promise(r => setTimeout(r, 2200));
      analysis = offlineAnalysis(req.file.buffer, req.body.hint);
    }
    const enriched = enrichMaterials(analysis.materials || []);

    const totalValue = enriched.reduce((s, m) => s + m.value_usd, 0);
    const totalCO2 = enriched.reduce((s, m) => s + m.co2_avoided_kg, 0);
    const totalWeight = enriched.reduce((s, m) => s + m.weight_kg, 0);

    // CO₂ equivalents for context (avg passenger car emits ~4.6 tonnes CO₂/yr)
    const carDaysAvoided = +(totalCO2 / (4600 / 365)).toFixed(1);

    res.json({
      success: true,
      image_url: hasR2 ? imageUrl : null,
      offline: !hasVisionKey(),
      scene_description: analysis.scene_description,
      confidence: analysis.confidence,
      materials: enriched,
      summary: {
        total_value_usd: +totalValue.toFixed(2),
        total_weight_kg: +totalWeight.toFixed(1),
        total_co2_avoided_kg: +totalCO2.toFixed(1),
        car_days_avoided: carDaysAvoided,
      },
    });
  } catch (err) {
    console.error('[analyze] Error:', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

module.exports = router;
