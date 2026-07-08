/**
 * Owns: leads table — insert and query captured demo leads.
 * Does NOT own: user auth, session management, scan analysis logic.
 */

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Insert a new lead captured from the /scan demo.
 * scan_data is the full analysis JSON response stored for context.
 */
async function createLead({ name, email, company, scan_data, source }) {
  const result = await pool.query(
    `INSERT INTO leads (name, email, company, scan_data, source)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, company, created_at`,
    [name, email, company || null, scan_data ? JSON.stringify(scan_data) : null, source || null]
  );
  return result.rows[0];
}

/**
 * Return all leads ordered newest-first for the /admin/leads page.
 */
async function getAllLeads() {
  const result = await pool.query(
    `SELECT id, name, email, company, scan_data, created_at
     FROM leads
     ORDER BY created_at DESC`
  );
  return result.rows;
}

module.exports = { createLead, getAllLeads };
