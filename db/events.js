/**
 * Owns: scan_events table — insert and query analytics events from the /scan funnel.
 * Does NOT own: user auth, session management, lead data.
 */

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Insert an analytics event from the WasteScope demo funnel.
 * metadata carries context (user agent, referrer, material count, etc.)
 */
async function insertEvent({ event_type, metadata, source }) {
  const result = await pool.query(
    `INSERT INTO scan_events (event_type, metadata, source)
     VALUES ($1, $2, $3)
     RETURNING id, event_type, created_at`,
    [event_type, metadata ? JSON.stringify(metadata) : null, source || null]
  );
  return result.rows[0];
}

/**
 * Return aggregated event counts grouped by event_type.
 * Used by /admin/analytics to compute funnel metrics.
 */
async function getEventCounts() {
  const result = await pool.query(
    `SELECT event_type, COUNT(*) as count
     FROM scan_events
     GROUP BY event_type
     ORDER BY count DESC`
  );
  return result.rows;
}

module.exports = { insertEvent, getEventCounts };