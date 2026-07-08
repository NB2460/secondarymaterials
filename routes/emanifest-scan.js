/**
 * Owns: /api/emanifest/scan — photo upload, EPA waste type analysis, DOT mapping.
 * Does NOT own: PDF generation, form storage beyond scan record.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const OpenAI = require('openai');
const { createManifestScan } = require('../db/scans');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Reuse the same OpenAI client from analyze route
let _openaiClient;
function getOpenAI() {
  if (!_openaiClient) {
    _openaiClient = new OpenAI();
  }
  return _openaiClient;
}

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

// Maps waste type to DOT hazard class, UN number, packing group, EPA waste codes
const DOT_MAP = {
  copper_wire:       { shipping_name: 'Copper waste, unalloyed, non-spontaneously combustible', hazard_class: '8',  un_number: 'UN3077', packing_group: 'III', waste_codes: ['D006', 'D008'] },
  circuit_boards:    { shipping_name: 'Articles containing non-fibrous glass',                  hazard_class: '9',  un_number: 'UN3077', packing_group: 'III', waste_codes: ['D006', 'D008', 'F001', 'F006'] },
  steel_scrap:       { shipping_name: 'Metal scrap, ferrous',                                    hazard_class: '4.1', un_number: 'UN3179', packing_group: 'III', waste_codes: ['D006'] },
  aluminum_scrap:    { shipping_name: 'Aluminium scrap, unrinsed',                              hazard_class: '4.1', un_number: 'UN3179', packing_group: 'III', waste_codes: ['D009'] },
  batteries:         { shipping_name: 'Batteries, wet, filled with acid',                        hazard_class: '8',  un_number: 'UN2794', packing_group: 'III', waste_codes: ['D008', 'D006'] },
  lead_acid_batteries: { shipping_name: 'Batteries, wet, filled with acid',                     hazard_class: '8',  un_number: 'UN2794', packing_group: 'III', waste_codes: ['D008', 'D006'] },
  mixed_metals:      { shipping_name: 'Metal waste, miscellaneous',                             hazard_class: '9',  un_number: 'UN3077', packing_group: 'III', waste_codes: ['D006', 'D008', 'D009'] },
  oil_filters:       { shipping_name: 'Oil filter, spent',                                       hazard_class: '4.1', un_number: 'UN3179', packing_group: 'III', waste_codes: ['D001', 'D018'] },
  coolants:          { shipping_name: 'Refrigerant gas, n.o.s.',                                hazard_class: '2',  un_number: 'UN1078', packing_group: null,  waste_codes: ['F001', 'D039'] },
  hydraulic_fluid:  { shipping_name: 'Hydraulic fluid, waste',                                   hazard_class: '3',  un_number: 'UN1993', packing_group: 'III', waste_codes: ['D001', 'F001'] },
  ink_waste:         { shipping_name: 'Printing ink waste',                                      hazard_class: '3',  un_number: 'UN1210', packing_group: 'III', waste_codes: ['D001', 'F001', 'F002'] },
  solvent_waste:     { shipping_name: 'Waste solvent, n.o.s.',                                    hazard_class: '3',  un_number: 'UN1993', packing_group: 'II',  waste_codes: ['D001', 'F001', 'F002', 'F003'] },
  acid_waste:        { shipping_name: 'Acid waste, inorganic, n.o.s.',                           hazard_class: '8',  un_number: 'UN3264', packing_group: 'II',  waste_codes: ['D002', 'D003', 'D004'] },
  caustic_waste:     { shipping_name: 'Base waste, inorganic, n.o.s.',                            hazard_class: '8',  un_number: 'UN3266', packing_group: 'II',  waste_codes: ['D002'] },
  paint_waste:       { shipping_name: 'Paint waste, flammable',                                  hazard_class: '3',  un_number: 'UN1263', packing_group: 'II',  waste_codes: ['D001', 'F001', 'F002'] },
};

const DEFAULT_DOT = { shipping_name: 'Hazardous waste, n.o.s.', hazard_class: '9', un_number: 'UN3077', packing_group: 'III', waste_codes: ['D001'] };

function lookupDotInfo(wasteType) {
  const key = (wasteType || '').toLowerCase().replace(/[\/\\_-]/g, '_');
  return DOT_MAP[key] || DEFAULT_DOT;
}

async function analyzeWithVision(imageUrl) {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are a waste identification expert for EPA RCRA hazardous waste compliance. Analyze this industrial waste photo and identify materials. Respond ONLY with valid JSON — no markdown, no extra text:

{
  "waste_type": "string — one of: copper_wire, circuit_boards, steel_scrap, aluminum_scrap, batteries, lead_acid_batteries, mixed_metals, oil_filters, coolants, hydraulic_fluid, ink_waste, solvent_waste, acid_waste, caustic_waste, paint_waste, other",
  "materials": [
    {
      "name": "string — e.g. Copper wire, Circuit boards, Steel",
      "description": "string — brief description of composition",
      "estimated_weight_lbs": "number — rough weight estimate in lbs"
    }
  ],
  "total_estimated_weight_lbs": "number",
  "primary_hazard": "string — brief description of primary hazard",
  "is_rcra_hazardous": "boolean — true if likely EPA RCRA hazardous waste",
  "notes": "string — any additional compliance notes"
}`,
          },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    max_tokens: 800,
  });

  const raw = response.choices[0].message.content.trim();
  const cleaned = raw.replace(/```json\n?/i, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}

// POST /api/emanifest/scan
router.post('/scan', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo provided' });

    const photoUrl = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    const analysis = await analyzeWithVision(photoUrl);
    const dotInfo = lookupDotInfo(analysis.waste_type);

    const result = {
      ...analysis,
      dot_info: dotInfo,
    };

    const { generator_epa_id = '', generator_name = '', generator_address = '' } = req.body || {};
    const saved = await createManifestScan({
      photo_url: photoUrl,
      scan_data: result,
      generator_epa_id,
      generator_name,
      generator_address,
    });

    res.json({
      scan_id: saved.id,
      photo_url: photoUrl,
      ...result,
    });
  } catch (err) {
    console.error('[emanifest-scan] Error:', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

module.exports = router;