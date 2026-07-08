/**
 * French waste code (code déchet) mappings per Arrêté du 29 octobre 2012.
 * Maps material types to official 6-digit European Waste Catalogue codes.
 */

// Map material_key from GPT-4o scan → [waste_code, description]
const WASTE_CODE_MAP = {
  copper:            { code: '17 04 07', label: 'Mélanges de cuivre' },
  aluminum:          { code: '17 04 03', label: 'Aluminium' },
  steel:             { code: '17 04 05', label: 'Acier' },
  stainless_steel:   { code: '17 04 05', label: 'Acier' },
  circuit_boards:    { code: '16 02 13*', label: 'Équipements mis au rebut contenant des PCB', danger: true },
  lithium_battery:   { code: '16 06 06*', label: 'Électrolytes de batteries mis au rebut', danger: true },
  brass:             { code: '17 04 07', label: 'Mélanges de métaux non ferreux' },
  lead:              { code: '17 04 04', label: 'Plomb' },
  zinc:              { code: '17 04 02', label: 'Zinc' },
  plastic_hdpe:      { code: '17 02 03', label: 'Plastique' },
  plastic_abs:       { code: '17 02 03', label: 'Plastique' },
  plastic_pp:        { code: '17 02 03', label: 'Plastique' },
  rubber:            { code: '16 02 13', label: 'Pneumatiques usagés' },
  glass:             { code: '17 02 07', label: 'Verre' },
  paper_cardboard:   { code: '20 01 01', label: 'Papier et carton' },
  mixed_electronic:  { code: '16 02 14', label: 'Équipements mis au rebut autres que ceux visés aux rubriques 16 02 09 à 16 02 13' },
  unknown:           { code: '19 12 99', label: 'Déchets non spécifiés ailleurs' },
};

/**
 * Get waste code for a material_key string.
 * Returns { code, label, danger }
 */
function getWasteCode(materialKey) {
  const entry = WASTE_CODE_MAP[materialKey];
  if (!entry) return { code: '19 12 99', label: 'Déchets non spécifiés', danger: false };
  return entry;
}

/**
 * Pick the most dangerous (asterisk *) waste code from a materials array.
 * Used to set the BSD header code when multiple materials are present.
 */
function pickPrimaryWasteCode(materials) {
  let chosen = null;
  for (const m of materials) {
    const entry = getWasteCode(m.material_key);
    if (entry.danger && !chosen) chosen = entry;
    else if (!chosen) chosen = entry;
  }
  return chosen || { code: '19 12 99', label: 'Déchets non spécifiés', danger: false };
}

/**
 * Map scan materials to BSD-compatible form payload.
 */
function buildBsdFormPayload(scanData, generatorInfo = {}) {
  const { materials, summary } = scanData;
  const primaryCode = pickPrimaryWasteCode(materials || []);
  const totalWeight = (materials || []).reduce((s, m) => s + (m.weight_kg || 0), 0);

  return {
    waste_code: primaryCode.code,
    waste_code_label: primaryCode.label,
    waste_dangerous: primaryCode.danger,

    // Quantité
    quantity_kg: Math.round(totalWeight * 10) / 10,
    quantity_unit: 'kg',

    // Nature du déchet
    materials_list: (materials || []).map((m) => {
      const entry = getWasteCode(m.material_key);
      return { key: m.material_key, label: m.label, weight_kg: m.weight_kg, code: entry.code, danger: entry.danger };
    }),

    // Generator info (from form or prior session)
    generator: {
      name: generatorInfo.name || '',
      address: generatorInfo.address || '',
      phone: generatorInfo.phone || '',
      siret: generatorInfo.siret || '',
      country: 'FR',
    },

    // Producer fields (pre-filled)
    producteur: {
      name: generatorInfo.name || '',
      address: generatorInfo.address || '',
      phone: generatorInfo.phone || '',
      siret: generatorInfo.siret || '',
    },

    // Transporteur (empty for MVP)
    transporteur: {
      name: '',
      address: '',
      vehicle_reg: '',
      driver_name: '',
    },

    // Installateur / destination finale (empty for MVP)
    installateur: {
      name: '',
      address: '',
      siret: '',
    },

    // Mentions réglementaires (default checked per danger flag)
    mentions: {
      reglement_2011_97: primaryCode.danger, // *Déchets dangereux
      tri_separation: false,
      manifeste_signe: true,
    },

    // Meta
    created_at: new Date().toISOString(),
    total_value_estimate_eur: summary?.total_value_usd ? +(summary.total_value_usd * 0.92).toFixed(2) : null,
  };
}

module.exports = { getWasteCode, pickPrimaryWasteCode, buildBsdFormPayload, WASTE_CODE_MAP };