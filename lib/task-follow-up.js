/**
 * lib/task-follow-up — side-effect handlers for completed browser tasks.
 * Each handler inspects result_data, fires notifications, and writes
 * the routing decision (follow_up_action) back to the task record so
 * the polling endpoint can return it.
 */

const { sendEmail } = require('./email-notify');
const { sendInboxMessage } = require('./polsia-notify');
const { updateTaskResult } = require('../db/tasks');

async function handleLeadResearch(task) {
  const scan = task.result_data?.scan_summary || {};
  const materials = scan.materials || [];
  const totalValue = scan.total_value_usd || 0;

  // Build outreach email body
  const materialList = materials.map(m => `• ${m.label}: ${m.weight_kg}kg @ $${m.price_per_kg}/kg = $${m.value_usd}`).join('\n');
  const body = [
    `New lead from WastetideOS scan`,
    ``,
    `File: ${task.input_data?.file_name || 'unknown'}`,
    `Materials detected: ${materials.length}`,
    `Estimated total value: $${totalValue}`,
    ``,
    `Material breakdown:`,
    materialList,
    ``,
    `View lead details at: ${process.env.APP_URL || 'https://wastetide.ai'}/admin/leads`,
  ].join('\n');

  const TO_EMAIL = process.env.LEAD_NOTIFY_EMAIL || 'nicolas@wastetide.ai';
  await sendEmail({ to: TO_EMAIL, subject: 'New lead from WastetideOS scan', text: body });

  await sendInboxMessage({
    subject: 'Lead research complete',
    message: `Lead research complete — ${materials.length} materials, $${totalValue} estimated.`,
    kind: 'lead',
  });

  // Write routing decision back to task so polling endpoint can return it
  await updateTaskResult(task.id, {
    status: 'completed',
    result_data: {
      ...task.result_data,
      follow_up_action: 'show_lead_gate',
    },
  });
}

async function handleContactForm(task) {
  await sendInboxMessage({
    subject: 'Contact form submitted',
    message: 'Contact form submitted — review at /admin/leads',
    kind: 'contact',
  });

  await updateTaskResult(task.id, {
    status: 'completed',
    result_data: {
      ...task.result_data,
      follow_up_action: 'review_contact_form',
    },
  });
}

module.exports = { handleLeadResearch, handleContactForm };