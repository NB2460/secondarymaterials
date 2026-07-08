// EPA Form 8700-22 generation route
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getScanById } = require('../db/scans');
const { generateManifestPDF } = require('../services/pdf-generator');

const router = express.Router();

function buildFormData(scan, body) {
  return {
    manifest_tracking_number: body.manifest_tracking_number || uuidv4().replace(/-/g, '').substring(0, 10).toUpperCase(),
    generator_epa_id: body.generator_epa_id || scan?.generator_epa_id || '',
    generator_name: body.generator_name || scan?.generator_name || '',
    generator_address: body.generator_address || scan?.generator_address || '',
    transporter1_epa_id: body.transporter1_epa_id || '',
    transporter1_name: body.transporter1_name || '',
    transporter2_epa_id: body.transporter2_epa_id || '',
    transporter2_name: body.transporter2_name || '',
    designated_facility_id: body.designated_facility_id || '',
    designated_facility_name: body.designated_facility_name || '',
    designated_facility_address: body.designated_facility_address || '',
    special_handling: body.special_handling || scan?.scan_data?.notes || '',
    dot_description: body.dot_description || '',
    total_quantity_lbs: body.total_quantity_lbs || scan?.scan_data?.total_estimated_weight_lbs || 0,
    container_type: body.container_type || 'DT', // Drum, Type
    container_count: body.container_count || '1',
    waste_codes: body.waste_codes || scan?.scan_data?.dot_info?.waste_codes || [],
    management_method: body.management_method || 'H141',
    scan_data: scan?.scan_data || {},
  };
}

// POST /api/manifest/generate — generate PDF
router.post('/generate', async (req, res) => {
  try {
    const { scan_id, ...formFields } = req.body;

    let scan = null;
    if (scan_id) {
      scan = await getScanById(scan_id);
    }

    const formData = buildFormData(scan, formFields);
    const pdfBuffer = await generateManifestPDF(formData);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="EPA-Manifest-${formData.manifest_tracking_number}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Manifest generate error:', err);
    res.status(500).json({ error: err.message || 'PDF generation failed' });
  }
});

// POST /api/manifest/preview — return form data JSON (no PDF)
router.post('/preview', async (req, res) => {
  try {
    const { scan_id, ...formFields } = req.body;
    let scan = null;
    if (scan_id) {
      scan = await getScanById(scan_id);
    }
    const formData = buildFormData(scan, formFields);
    res.json(formData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;