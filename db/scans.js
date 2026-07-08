/**
 * emanifest_scans — stores WasteScope scans used for EPA manifest generation.
 * Columns: id, photo_url, scan_data (JSONB), generator_epa_id, generator_name,
 *          generator_address, created_at
 */
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createManifestScan({ photo_url, scan_data, generator_epa_id, generator_name, generator_address }) {
  const res = await pool.query(
    `INSERT INTO emanifest_scans (photo_url, scan_data, generator_epa_id, generator_name, generator_address, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [photo_url, JSON.stringify(scan_data), generator_epa_id || '', generator_name || '', generator_address || '']
  );
  return res.rows[0];
}

async function getScanById(id) {
  const res = await pool.query('SELECT * FROM emanifest_scans WHERE id = $1', [id]);
  return res.rows[0];
}

async function listManifestScans(limit = 50) {
  const res = await pool.query(
    'SELECT id, photo_url, scan_data, generator_epa_id, generator_name, created_at FROM emanifest_scans ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return res.rows;
}

module.exports = { createManifestScan, getScanById, listManifestScans };