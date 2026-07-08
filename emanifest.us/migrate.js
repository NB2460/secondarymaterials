// migrate.js — run all pending migrations in order
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const applied = await pool.query('SELECT name FROM _migrations');
  const appliedSet = new Set(applied.rows.map(r => r.name));

  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.js') && f !== 'migrate.js')
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    console.log(`Running migration: ${file}`);
    const mod = require(path.join(__dirname, file));
    if (mod.up) await mod.up();
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    console.log(`Applied: ${file}`);
  }

  await pool.end();
  console.log('All migrations complete');
}

run().catch(err => { console.error(err); process.exit(1); });