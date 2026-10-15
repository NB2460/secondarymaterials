/**
 * Owns: /api/leads (POST — capture a lead from any free tool, notify the team) and /admin/leads (GET — list all leads).
 * Does NOT own: scan analysis, image uploads, user authentication.
 */

const express = require('express');
const router = express.Router();
const { createLead, getAllLeads } = require('../db/leads');
const { adminAuth } = require('../lib/admin-auth');
const { sendEmail } = require('../lib/email-notify');
const { sendInboxMessage } = require('../lib/polsia-notify');

async function notifyNewLead(lead, scanData, source) {
  const materials = scanData?.materials || [];
  const totalValue = scanData?.summary?.total_value_usd;
  const body = [
    `New lead from ${source || 'unknown source'}`,
    ``,
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Company: ${lead.company || '—'}`,
    `Materials detected: ${materials.length}`,
    totalValue !== undefined ? `Estimated total value: $${totalValue}` : null,
    ``,
    `View all leads at: ${process.env.APP_URL || 'https://wastetide.ai'}/admin/leads`,
  ].filter(line => line !== null).join('\n');

  const TO_EMAIL = process.env.LEAD_NOTIFY_EMAIL || 'nicolas@wastetide.ai';
  await sendEmail({ to: TO_EMAIL, subject: `New lead: ${lead.email} (${source || 'unknown'})`, text: body });
  await sendInboxMessage({
    subject: `New lead: ${lead.name}`,
    message: `${lead.name} <${lead.email}> — ${lead.company || 'no company'} — via ${source || 'unknown'}`,
    kind: 'lead',
  });
}

// POST /api/leads — store lead captured after scan
router.post('/', async (req, res) => {
  const { name, email, company, scan_data, source } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!email || !email.trim() || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    const lead = await createLead({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      company: company ? company.trim() : null,
      scan_data: scan_data || null,
      source: source || null,
    });
    notifyNewLead(lead, scan_data, source).catch(err => console.error('[leads] notify error:', err.message));
    res.json({ success: true, lead });
  } catch (err) {
    console.error('[leads] createLead error:', err.message);
    res.status(500).json({ error: 'Failed to save lead' });
  }
});

// GET /admin/leads — simple lead list (also mounted at /api/leads, hence the auth)
router.get('/', adminAuth, async (_req, res) => {
  try {
    const leads = await getAllLeads();
    const leadsHtml = leads.map((l) => {
      const scanSummary = l.scan_data
        ? `$${(l.scan_data.summary?.total_value_usd || 0).toFixed(0)} · ${(l.scan_data.summary?.total_weight_kg || 0).toFixed(1)} kg · ${(l.scan_data.materials || []).length} materials`
        : '—';
      const dateStr = new Date(l.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
      return `
        <tr>
          <td>${escHtml(l.name)}</td>
          <td><a href="mailto:${escHtml(l.email)}">${escHtml(l.email)}</a></td>
          <td>${l.company ? escHtml(l.company) : '<span style="color:#666">—</span>'}</td>
          <td style="font-family:monospace;font-size:13px">${escHtml(scanSummary)}</td>
          <td style="color:#888;font-size:13px;white-space:nowrap">${dateStr}</td>
        </tr>`;
    }).join('');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Leads — WastetideOS Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #080e0b; color: #e8f0ec; min-height: 100vh; }
    .header { background: #0d1810; border-bottom: 1px solid rgba(184,240,74,0.15); padding: 20px 40px; display: flex; align-items: center; justify-content: space-between; }
    .header h1 { font-size: 20px; font-weight: 700; color: #fff; }
    .header-sub { font-size: 13px; color: rgba(255,255,255,0.4); margin-top: 2px; }
    .badge { background: #b8f04a; color: #080e0b; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 20px; }
    .container { max-width: 1100px; margin: 0 auto; padding: 32px 40px; }
    .stats { display: flex; gap: 16px; margin-bottom: 32px; }
    .stat { background: #0d1810; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 20px 24px; flex: 1; }
    .stat-value { font-size: 32px; font-weight: 800; color: #b8f04a; line-height: 1; }
    .stat-label { font-size: 12px; color: rgba(255,255,255,0.45); margin-top: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
    table { width: 100%; border-collapse: collapse; background: #0d1810; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
    thead th { padding: 12px 20px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.4); border-bottom: 1px solid rgba(255,255,255,0.08); }
    tbody td { padding: 14px 20px; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: rgba(184,240,74,0.04); }
    a { color: #b8f04a; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .empty { text-align: center; padding: 80px 20px; color: rgba(255,255,255,0.3); font-size: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>WastetideOS Leads</h1>
      <div class="header-sub">Demo lead capture from /scan</div>
    </div>
    <span class="badge">${leads.length} lead${leads.length !== 1 ? 's' : ''}</span>
  </div>
  <div class="container">
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${leads.length}</div>
        <div class="stat-label">Total Leads</div>
      </div>
      <div class="stat">
        <div class="stat-value">${leads.filter(l => l.scan_data).length}</div>
        <div class="stat-label">With Scan Data</div>
      </div>
      <div class="stat">
        <div class="stat-value">${leads.filter(l => l.company).length}</div>
        <div class="stat-label">With Company</div>
      </div>
    </div>
    ${leads.length === 0
      ? '<div class="empty">No leads yet. Send traffic to /scan to start capturing.</div>'
      : `<table>
          <thead><tr>
            <th>Name</th><th>Email</th><th>Company</th><th>Scan Summary</th><th>Captured</th>
          </tr></thead>
          <tbody>${leadsHtml}</tbody>
        </table>`
    }
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('[leads] getAllLeads error:', err.message);
    res.status(500).send('Failed to load leads');
  }
});

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = router;
