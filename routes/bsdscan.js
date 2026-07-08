/**
 * Owns: /api/bsd/* — BSD scan creation, retrieval, PDF generation.
 * Does NOT own: scanner UI, CSS, vision model.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const OpenAI = require('openai');
const { buildBsdFormPayload } = require('../lib/bsd-codes');
const { createBsdScan, getBsdScanById } = require('../db/bsdscans');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files accepted'));
  },
});

const openai = new OpenAI();

// --- BSD material key → French waste codes ---
const MATERIAL_TO_CODE = {
  copper:          { code: '17 04 07', label: 'Mélanges de cuivre, bronze, laiton' },
  aluminum:        { code: '17 04 03', label: 'Aluminium' },
  steel:           { code: '17 04 05', label: 'Acier' },
  stainless_steel: { code: '17 04 05', label: 'Acier' },
  circuit_boards:  { code: '16 02 13*', label: 'Equipements avec PCB', danger: true },
  lithium_battery: { code: '16 06 06*', label: 'Electrolytes batteries', danger: true },
  brass:           { code: '17 04 07', label: 'Metaux non ferreux' },
  lead:            { code: '17 04 04', label: 'Plomb' },
  zinc:            { code: '17 04 02', label: 'Zinc' },
  plastic_hdpe:    { code: '17 02 03', label: 'Plastique' },
  plastic_abs:     { code: '17 02 03', label: 'Plastique' },
  plastic_pp:      { code: '17 02 03', label: 'Plastique' },
  rubber:          { code: '16 02 13', label: 'Pneumatiques' },
  glass:           { code: '17 02 07', label: 'Verre' },
  paper_cardboard: { code: '20 01 01', label: 'Papier / carton' },
  unknown:         { code: '19 12 99', label: 'Non specifie' },
};

function getCodeForMaterial(key) {
  return MATERIAL_TO_CODE[key] || { code: '19 12 99', label: 'Non specifie' };
}

async function uploadToR2(buffer, filename, mimeType) {
  const formData = new FormData();
  formData.append('file', buffer, { filename, contentType: mimeType });
  const res = await fetch('https://polsia.com/api/proxy/r2/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.POLSIA_API_KEY}`, ...formData.getHeaders() },
    body: formData,
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error?.message || 'R2 upload failed');
  return result.file.url;
}

async function analyzeWaste(imageUrl) {
  const validKeys = Object.keys(MATERIAL_TO_CODE).join(', ');
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Tu es un expert en gestion des dechets industriels francias. Analyse l'image et identifie tous les materiaux visibles. Retourne uniquement du JSON valide.

Format attendu:
{
  "scene_description": "description courte de la scene",
  "confidence": "high|medium|low",
  "materials": [
    {
      "material_key": "copper",
      "estimated_weight_kg": 15.5,
      "confidence_pct": 85,
      "notes": "cables et tuyaux en cuivre visibles"
    }
  ]
}

Materiaux valides: ${validKeys}
Poids: estimation realiste pour la quantite visible (pas le total de l'usine).
Confiance: 0-100%.
Max 6 materiaux.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyse cette image de dechets industriels et identifie les materiaux presents.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0.1,
  });
  const raw = response.choices[0].message.content.trim();
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(jsonStr);
}

// POST /api/bsd/scan — full scan + BSD form generation
router.post('/scan', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucune photo' });

    const { generator_name, generator_address, generator_phone, generator_siret } = req.body;

    // Upload to R2
    const imageUrl = await uploadToR2(
      req.file.buffer,
      req.file.originalname || 'bsd-photo.jpg',
      req.file.mimetype
    );

    // Vision analysis
    const analysis = await analyzeWaste(imageUrl);
    const materials = (analysis.materials || []).map((m) => {
      const entry = getCodeForMaterial(m.material_key);
      return {
        material_key: m.material_key,
        label: m.label || entry.label,
        weight_kg: Math.max(0.1, m.estimated_weight_kg || 1),
        confidence_pct: m.confidence_pct || 50,
        notes: m.notes || '',
        waste_code: entry.code,
        waste_code_label: entry.label,
        danger: !!entry.danger,
      };
    });

    const totalWeight = materials.reduce((s, m) => s + m.weight_kg, 0);

    // Determine primary waste code (prefer hazardous)
    let primaryCode = { code: '19 12 99', label: 'Non specifie' };
    for (const m of materials) {
      if (m.danger) { primaryCode = { code: m.waste_code, label: m.waste_code_label }; break; }
      if (!primaryCode.danger) primaryCode = { code: m.waste_code, label: m.waste_code_label };
    }

    // Build BSD form payload
    const generatorInfo = { name: generator_name, address: generator_address, phone: generator_phone, siret: generator_siret };
    const bsdForm = buildBsdFormPayload({ materials, summary: { total_weight_kg: totalWeight } }, generatorInfo);

    // Persist to DB
    const scan = await createBsdScan({
      photoUrl: imageUrl,
      scanData: { materials, scene_description: analysis.scene_description, confidence: analysis.confidence },
      wasteCode: primaryCode.code,
      generatorName: generator_name || null,
      generatorAddress: generator_address || null,
      generatorPhone: generator_phone || null,
      generatorSiret: generator_siret || null,
    });

    res.json({
      success: true,
      scan_id: scan.id,
      image_url: imageUrl,
      scene_description: analysis.scene_description,
      confidence: analysis.confidence,
      materials,
      total_weight_kg: +totalWeight.toFixed(1),
      primary_waste_code: primaryCode,
      bsd_form: bsdForm,
    });
  } catch (err) {
    console.error('[bsd/scan] Error:', err.message);
    res.status(500).json({ error: err.message || 'Scan failed' });
  }
});

// GET /api/bsd/route-check — confirm routing + SSL status
router.get('/route-check', (req, res) => {
  res.json({
    ok: true,
    host: req.headers.host,
    'x-forwarded-host': req.headers['x-forwarded-host'],
    'x-original-host': req.headers['x-original-host'],
    timestamp: new Date().toISOString(),
  });
});

// GET /api/bsd/:id — retrieve a BSD scan
router.get('/:id', async (req, res) => {
  try {
    const scan = await getBsdScanById(parseInt(req.params.id));
    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    res.json({ success: true, scan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bsd/:id/pdf — generate printable PDF
router.get('/:id/pdf', async (req, res) => {
  try {
    const scan = await getBsdScanById(parseInt(req.params.id));
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    const materials = scan.scan_data?.materials || [];
    const bsdForm = buildBsdFormPayload(scan.scan_data || {}, {
      name: scan.generator_name,
      address: scan.generator_address,
      phone: scan.generator_phone,
      siret: scan.generator_siret,
    });

    // Build HTML for PDF
    const html = buildPdfHtml(scan, materials, bsdForm);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildPdfHtml(scan, materials, form) {
  const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const matRows = materials.map((m) => `
    <tr>
      <td>${escHtml(m.label || m.material_key)}</td>
      <td>${m.waste_code || '—'}</td>
      <td>${(m.weight_kg || 0).toFixed(1)} kg</td>
      <td>${m.confidence_pct || 0}%</td>
      <td>${m.notes ? escHtml(m.notes) : '—'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>BSD ${scan.id} — ${date}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 11px; color: #111; background: #fff; padding: 20mm; }
  .header { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 16px; }
  .header h1 { font-size: 20px; font-weight: bold; }
  .header .subtitle { font-size: 12px; color: #555; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
  .meta-box { border: 1px solid #000; padding: 6px 8px; flex: 1; margin-right: 8px; }
  .meta-box:last-child { margin-right: 0; }
  .meta-box .label { font-weight: bold; font-size: 9px; text-transform: uppercase; }
  .meta-box .value { font-size: 12px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border: 1px solid #000; padding: 5px 6px; }
  th { background: #eee; font-weight: bold; font-size: 9px; text-transform: uppercase; }
  .section-title { font-weight: bold; font-size: 12px; margin: 12px 0 6px; border-bottom: 1px solid #000; padding-bottom: 3px; }
  .footer { margin-top: 24px; border-top: 1px solid #000; padding-top: 8px; font-size: 9px; color: #555; display: flex; justify-content: space-between; }
  .stamp-box { border: 1.5px solid #000; width: 120px; height: 80px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; text-align: center; }
  .warning { background: #ff0; padding: 4px 8px; font-weight: bold; font-size: 11px; display: inline-block; margin-bottom: 8px; }
</style>
</head>
<body>

<div class="header">
  <h1>BORDEREAU DE SUIVI DES DÉCHETS (BSD)</h1>
  <div class="subtitle">Generé par TrackDechets AI — ${date} ${time}</div>
</div>

<div class="meta-row">
  <div class="meta-box">
    <div class="label">N° BSD</div>
    <div class="value">TD-${String(scan.id).padStart(6, '0')}</div>
  </div>
  <div class="meta-box">
    <div class="label">Code Dechet</div>
    <div class="value">${scan.waste_code || '—'}</div>
  </div>
  <div class="meta-box">
    <div class="label">Date Emission</div>
    <div class="value">${date}</div>
  </div>
</div>

<div class="section-title">1. PRODUCTEUR / DÉTENTEUR</div>
<div class="meta-row">
  <div class="meta-box">
    <div class="label">Nom / Raison sociale</div>
    <div class="value">${escHtml(scan.generator_name || '—')}</div>
  </div>
  <div class="meta-box">
    <div class="label">SIRET</div>
    <div class="value">${escHtml(scan.generator_siret || '—')}</div>
  </div>
</div>
<div class="meta-row">
  <div class="meta-box">
    <div class="label">Adresse</div>
    <div class="value">${escHtml(scan.generator_address || '—')}</div>
  </div>
  <div class="meta-box">
    <div class="label">Telephone</div>
    <div class="value">${escHtml(scan.generator_phone || '—')}</div>
  </div>
</div>

<div class="section-title">2. NATURE DES DÉCHETS</div>
${materials.some(m => m.danger) ? '<div class="warning">⚠ DECHETS DANGEREUX — code avec asterisque *</div>' : ''}
<table>
  <tr>
    <th>Materiau</th>
    <th>Code Dechet</th>
    <th>Poids Estime</th>
    <th>Confiance</th>
    <th>Observations</th>
  </tr>
  ${matRows}
</table>
<div style="font-size:10px; margin-bottom:12px;">Poids total estime: <strong>${(scan.scan_data?.materials || []).reduce((s,m) => s+(m.weight_kg||0), 0).toFixed(1)} kg</strong></div>

<div class="section-title">3. TRANSPORTEUR (a remplir)</div>
<div class="meta-row">
  <div class="meta-box">
    <div class="label">Nom transporteur</div>
    <div class="value">—</div>
  </div>
  <div class="meta-box">
    <div class="label">N° Immatriculation</div>
    <div class="value">—</div>
  </div>
</div>

<div class="section-title">4. INSTALLATION DE DESTINATION (a remplir)</div>
<div class="meta-row">
  <div class="meta-box">
    <div class="label">Nom installateur</div>
    <div class="value">—</div>
  </div>
  <div class="meta-box">
    <div class="label">N° SIRET</div>
    <div class="value">—</div>
  </div>
</div>

<div class="section-title">MENTIONS REGLEMENTAIRES</div>
<div style="font-size:10px; line-height:1.8;">
  ☐ Le bordereau est signe par le producteur<br>
  ☐ Les dechets sont contnus et identifies<br>
  ☐ Le transporteur declare avoir pris connaissance des informations<br>
</div>

<div class="footer">
  <span>TrackDechets AI — Document non officiel. A verifier et signer avant utilisation.</span>
  <span>${date}</span>
</div>

</body>
</html>`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = router;