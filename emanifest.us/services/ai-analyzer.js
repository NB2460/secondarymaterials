// AI waste analyzer — maps scan photo to EPA waste type, composition, weight estimates
const OpenAI = require('openai');

const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY,
});

// Maps waste type to DOT hazard class, UN number, packing group, and EPA waste codes
const WASTE_TYPE_MAP = {
  'copper_wire': {
    shipping_name: 'Copper waste, unalloyed, non-spontaneously combustible',
    hazard_class: '8', // Corrosive
    un_number: 'UN3077', // Not classified above, may vary by composition
    packing_group: 'III',
    waste_codes: ['D006', 'D008'], // Cadmium, Lead
    dot_description: 'Environmentally hazardous substance, solid, n.o.s. (copper)', // adjusted for actual haz
  },
  'circuit_boards': {
    shipping_name: 'Articles containing non-fibrous glass',
    hazard_class: '9', // Miscellaneous
    un_number: 'UN3077',
    packing_group: 'III',
    waste_codes: ['D006', 'D008', 'F001', 'F006'],
  },
  'steel_scrap': {
    shipping_name: 'Metal scrap, ferrous',
    hazard_class: '4.1', // Flammable solid (coated oils)
    un_number: 'UN3179',
    packing_group: 'III',
    waste_codes: ['D006'],
  },
  'aluminum_scrap': {
    shipping_name: 'Aluminium scrap, unrinsed',
    hazard_class: '4.1',
    un_number: 'UN3179',
    packing_group: 'III',
    waste_codes: ['D009'], // Mercury
  },
  'batteries': {
    shipping_name: 'Batteries, wet, filled with acid',
    hazard_class: '8',
    un_number: 'UN2794',
    packing_group: 'III',
    waste_codes: ['D008', 'D006'], // Lead, Cadmium
  },
  'lead_acid_batteries': {
    shipping_name: 'Batteries, wet, filled with acid',
    hazard_class: '8',
    un_number: 'UN2794',
    packing_group: 'III',
    waste_codes: ['D008', 'D006'],
  },
  'mixed_metals': {
    shipping_name: 'Metal waste, miscellaneous',
    hazard_class: '9',
    un_number: 'UN3077',
    packing_group: 'III',
    waste_codes: ['D006', 'D008', 'D009'],
  },
  'oil_filters': {
    shipping_name: 'Oil filter, spent',
    hazard_class: '4.1',
    un_number: 'UN3179',
    packing_group: 'III',
    waste_codes: ['D001', 'D018'], // Ignitable, benzene
  },
  'coolants': {
    shipping_name: 'Refrigerant gas, n.o.s.',
    hazard_class: '2',
    un_number: 'UN1078',
    packing_group: null,
    waste_codes: ['F001', 'D039'], // TCE, Tetrachloroethylene
  },
  'hydraulic_fluid': {
    shipping_name: 'Hydraulic fluid, waste',
    hazard_class: '3',
    un_number: 'UN1993',
    packing_group: 'III',
    waste_codes: ['D001', 'F001'],
  },
  'ink_waste': {
    shipping_name: 'Printing ink waste',
    hazard_class: '3',
    un_number: 'UN1210',
    packing_group: 'III',
    waste_codes: ['D001', 'F001', 'F002'],
  },
  'solvent_waste': {
    shipping_name: 'Waste solvent, n.o.s.',
    hazard_class: '3',
    un_number: 'UN1993',
    packing_group: 'II',
    waste_codes: ['D001', 'F001', 'F002', 'F003'],
  },
  'acid_waste': {
    shipping_name: 'Acid waste, inorganic, n.o.s.',
    hazard_class: '8',
    un_number: 'UN3264',
    packing_group: 'II',
    waste_codes: ['D002', 'D003', 'D004'], // Corrosive, Reactive, Arsenic
  },
  'caustic_waste': {
    shipping_name: 'Base waste, inorganic, n.o.s.',
    hazard_class: '8',
    un_number: 'UN3266',
    packing_group: 'II',
    waste_codes: ['D002'],
  },
  'paint_waste': {
    shipping_name: 'Paint waste, flammable',
    hazard_class: '3',
    un_number: 'UN1263',
    packing_group: 'II',
    waste_codes: ['D001', 'F001', 'F002'],
  },
};

const DEFAULT_MAP = {
  shipping_name: 'Hazardous waste, n.o.s.',
  hazard_class: '9',
  un_number: 'UN3077',
  packing_group: 'III',
  waste_codes: ['D001'],
};

function mapWasteType(type) {
  const key = (type || '').toLowerCase().replace(/[\/\\_-]/g, '_');
  return WASTE_TYPE_MAP[key] || DEFAULT_MAP;
}

async function analyzeWaste(photoUrl) {
  const prompt = `You are a waste identification expert for industrial waste compliance. Analyze this waste photo and return a structured identification. For each material detected, estimate the weight in lbs.

Respond ONLY with valid JSON matching this schema. No markdown, no extra text:
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
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: photoUrl } },
        ],
      },
    ],
    max_tokens: 800,
  });

  const raw = completion.choices[0].message.content.trim();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    // Try stripping markdown fences
    const cleaned = raw.replace(/```json\n?/i, '').replace(/\n?```$/, '').trim();
    json = JSON.parse(cleaned);
  }

  const dotMapping = mapWasteType(json.waste_type);

  return {
    ...json,
    dot_info: dotMapping,
  };
}

module.exports = { analyzeWaste, mapWasteType };