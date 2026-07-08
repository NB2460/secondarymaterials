/**
 * Owns: BSD scan persistence — read/write bsd_scans table.
 * Does NOT own: vision analysis, PDF generation, form display.
 */

const Pool = require('pg').Pool;
const pool = new Pool();

/** Insert a new BSD scan. Returns the inserted row. */
async function createBsdScan({ photoUrl, scanData, wasteCode, generatorName, generatorAddress, generatorPhone, generatorSiret }) {
  const sql = `
    INSERT INTO bsd_scans (photo_url, scan_data, waste_code, generator_name, generator_address, generator_phone, generator_siret)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  const rows = await pool.query(sql, [
    photoUrl,
    JSON.stringify(scanData),
    wasteCode || null,
    generatorName || null,
    generatorAddress || null,
    generatorPhone || null,
    generatorSiret || null,
  ]);
  return rows.rows[0];
}

/** Get a BSD scan by ID. */
async function getBsdScanById(id) {
  const rows = await pool.query('SELECT * FROM bsd_scans WHERE id = $1', [id]);
  return rows.rows[0] || null;
}

/** List recent BSD scans, newest first. */
async function listBsdScans(limit = 50) {
  const rows = await pool.query(
    'SELECT id, photo_url, scan_data, waste_code, generator_name, created_at FROM bsd_scans ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return rows.rows;
}

/** Update BSD form data for a scan. */
async function updateBsdForm(id, formData) {
  const rows = await pool.query(
    'UPDATE bsd_scans SET bsd_form = $2 WHERE id = $1 RETURNING *',
    [id, JSON.stringify(formData)]
  );
  return rows.rows[0] || null;
}

module.exports = { createBsdScan, getBsdScanById, listBsdScans, updateBsdForm };