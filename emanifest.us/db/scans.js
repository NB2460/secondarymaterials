// emanifest_scans queries
const { query } = require('./index');

async function createScan({ photo_url, scan_data, generator_epa_id, generator_name, generator_address }) {
  return query(
    `INSERT INTO emanifest_scans (photo_url, scan_data, generator_epa_id, generator_name, generator_address, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [photo_url, JSON.stringify(scan_data), generator_epa_id, generator_name, generator_address]
  );
}

async function getScanById(id) {
  const res = await query('SELECT * FROM emanifest_scans WHERE id = $1', [id]);
  return res.rows[0];
}

async function listScans(limit = 50) {
  const res = await query(
    'SELECT id, photo_url, scan_data, generator_epa_id, generator_name, created_at FROM emanifest_scans ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return res.rows;
}

module.exports = { createScan, getScanById, listScans };