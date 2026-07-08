/**
 * db/index — central DB module (required by db/scans.js for Pool access).
 * Re-exports Pool so consuming modules can get the shared connection pool.
 */
const { Pool } = require('pg');
const pool = new Pool();
module.exports = { pool };