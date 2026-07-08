// Photo upload + AI analysis route
const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const { analyzeWaste } = require('../services/ai-analyzer');
const { createScan } = require('../db/scans');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Upload to Polsia R2
async function uploadToR2(buffer, filename) {
  const apiKey = process.env.POLSIA_API_KEY;
  const res = await fetch('https://polsia.com/api/proxy/r2/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/octet-stream',
      'X-Filename': filename,
    },
    body: buffer,
  });
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`);
  const data = await res.json();
  return data.url || data.publicUrl || data.location || data.key;
}

// POST /api/scan — upload photo, analyze, return results
router.post('/scan', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo provided' });
    }

    const filename = `emanifest/${Date.now()}-${req.file.originalname}`;
    const photoUrl = await uploadToR2(req.file.buffer, filename);

    const result = await analyzeWaste(photoUrl);

    const { generator_epa_id = '', generator_name = '', generator_address = '' } = req.body || {};
    const saved = await createScan({
      photo_url: photoUrl,
      scan_data: result,
      generator_epa_id,
      generator_name,
      generator_address,
    });

    res.json({
      scan_id: saved.rows[0].id,
      photo_url: photoUrl,
      ...result,
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

// GET /api/scan/:id — retrieve scan result
router.get('/scan/:id', async (req, res) => {
  const { getScanById } = require('../db/scans');
  const scan = await getScanById(req.params.id);
  if (!scan) return res.status(404).json({ error: 'Scan not found' });
  res.json(scan);
});

module.exports = router;