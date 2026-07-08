// Migration: create emanifest_scans table
const { Pool } = require('pg');
const { DATABASE_URL } = process.env;

async function up() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS emanifest_scans (
      id SERIAL PRIMARY KEY,
      photo_url TEXT NOT NULL,
      scan_data JSONB NOT NULL,
      generator_epa_id TEXT,
      generator_name TEXT,
      generator_address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emanifest_scans_created ON emanifest_scans(created_at DESC);`);
  await pool.end();
  console.log('Migration 1717891200_create_emanifest_scans up complete');
}

async function down() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pool.query('DROP TABLE IF EXISTS emanifest_scans;');
  await pool.end();
  console.log('Migration 1717891200_create_emanifest_scans down complete');
}

module.exports = { up, down };
// Run directly: node migrations/1717891200_create_emanifest_scans.js up
if (require.main === module) {
  const cmd = process.argv[2] || 'up';
  if (cmd === 'up') up().catch(e => { console.error(e); process.exit(1); });
  else if (cmd === 'down') down().catch(e => { console.error(e); process.exit(1); });
}