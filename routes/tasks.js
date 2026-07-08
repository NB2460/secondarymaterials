/**
 * routes/tasks — POST /api/tasks (create), GET /api/tasks/:taskId (poll).
 * Task record is created at scan-start; frontend polls for completion.
 */

const express = require('express');
const router = express.Router();
const { createTask, getTask, updateTaskResult, VALID_TASK_TYPES } = require('../db/tasks');
const { handleLeadResearch, handleContactForm } = require('../lib/task-follow-up');

router.post('/', async (req, res) => {
  const { task_type, input_data } = req.body;

  if (!task_type || !VALID_TASK_TYPES.includes(task_type)) {
    return res.status(400).json({
      success: false,
      error: `task_type must be one of: ${VALID_TASK_TYPES.join(', ')}`,
    });
  }

  try {
    const task = await createTask({ task_type, input_data: input_data || {} });

    // Fire-and-forget: process the task immediately so polling resolves.
    // scan_summary is not available yet (scan hasn't run), so the email
    // notification will have empty materials — acceptable for this path.
    if (task.task_type === 'lead_research') {
      handleLeadResearch(task).catch(err => console.error('[POST /api/tasks handleLeadResearch]', err.message));
    } else if (task.task_type === 'contact_form') {
      handleContactForm(task).catch(err => console.error('[POST /api/tasks handleContactForm]', err.message));
    }

    return res.json({ success: true, task });
  } catch (err) {
    console.error('[/api/tasks POST]', err.message);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.get('/:taskId', async (req, res) => {
  const { taskId } = req.params;

  // UUID format check
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(taskId)) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  try {
    const task = await getTask(taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (task.status === 'pending') {
      const ageMs = Date.now() - new Date(task.created_at).getTime();
      if (ageMs > 5 * 60 * 1000) {
        // Belt-and-suspenders: fail tasks that somehow stayed pending > 5 min
        await updateTaskResult(task.id, {
          status: 'failed',
          result_data: { error: 'task timed out — no worker completed it within 5 minutes' },
        });
        return res.json({ success: false, status: 'failed', error: 'Task timed out' });
      }
      return res.json({ success: true, status: 'pending' });
    }

    if (task.status === 'completed') {
      // Fire-and-forget follow-up handler (does not block response)
      if (task.task_type === 'lead_research') {
        handleLeadResearch(task).catch(err => console.error('[handleLeadResearch]', err.message));
      } else if (task.task_type === 'contact_form') {
        handleContactForm(task).catch(err => console.error('[handleContactForm]', err.message));
      }

      return res.json({
        success: true,
        status: 'completed',
        result: task.result_data,
      });
    }

    if (task.status === 'failed') {
      return res.json({
        success: false,
        status: 'failed',
        error: task.result_data?.error || 'Task failed',
      });
    }
  } catch (err) {
    console.error('[/api/tasks GET]', err.message);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

module.exports = router;