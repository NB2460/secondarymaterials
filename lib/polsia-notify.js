/**
 * lib/polsia-notify — wraps dashboard inbox API for in-app notifications.
 * Only used in server-side route handlers (not background jobs or agents).
 */
const POLSIA_API_KEY = process.env.POLSIA_API_KEY;
const COMPANY_ID = process.env.POLSIA_COMPANY_ID;

async function sendInboxMessage({ subject, message, kind = 'summary' }) {
  if (!POLSIA_API_KEY) return;
  const res = await fetch('https://polsia.com/api/dashboard/inbox/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POLSIA_API_KEY}`,
      'X-Company-ID': COMPANY_ID || ''
    },
    body: JSON.stringify({ subject, message, kind })
  });
  if (!res.ok) console.error('[polsia-notify] failed:', res.status);
}

module.exports = { sendInboxMessage };