/**
 * Owns: browser_tasks table — create and query in-flight browser tasks.
 * Does NOT own: scan analysis logic, lead capture, email sending.
 */

const { pool } = require('./index');

const VALID_TASK_TYPES = ['lead_research', 'contact_form'];

async function createTask({ task_type, input_data }) {
  if (!VALID_TASK_TYPES.includes(task_type)) {
    throw new Error(`Invalid task_type: ${task_type}`);
  }
  const result = await pool.query(
    `INSERT INTO browser_tasks (task_type, input_data, status)
     VALUES ($1, $2, 'pending')
     RETURNING id, task_type, status, input_data, created_at`,
    [task_type, JSON.stringify(input_data || {})]
  );
  return result.rows[0];
}

async function getTask(id) {
  const result = await pool.query(
    `SELECT id, task_type, status, input_data, result_data, created_at, updated_at
     FROM browser_tasks
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function updateTaskResult(id, { status, result_data }) {
  const result = await pool.query(
    `UPDATE browser_tasks
     SET status = $2, result_data = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING id, task_type, status, result_data, updated_at`,
    [id, status, JSON.stringify(result_data || {})]
  );
  return result.rows[0] || null;
}

async function listPendingTasks(task_type, limit = 10) {
  const result = await pool.query(
    `SELECT id, task_type, status, input_data, created_at
     FROM browser_tasks
     WHERE status = 'pending' AND task_type = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [task_type, limit]
  );
  return result.rows;
}

module.exports = { createTask, getTask, updateTaskResult, listPendingTasks, VALID_TASK_TYPES };