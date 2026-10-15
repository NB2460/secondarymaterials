/**
 * Owns: /api/events (POST — log analytics event) and /admin/analytics (GET — funnel dashboard).
 * Does NOT own: scan analysis, image uploads, user authentication, lead capture.
 */

const express = require('express');
const router = express.Router();
const { insertEvent, getEventCounts } = require('../db/events');
const { adminAuth } = require('../lib/admin-auth');

const VALID_EVENTS = new Set([
  'page_view',
  'scan_started',
  'scan_completed',
  'lead_gate_shown',
  'lead_submitted',
  'gate_shown',
  'form_submitted',
  'form_abandoned',
]);

// POST /api/events — log a funnel event from the /scan page
router.post('/', async (req, res) => {
  const { event_type, metadata, source } = req.body;

  if (!event_type || !VALID_EVENTS.has(event_type)) {
    return res.status(400).json({
      error: 'Invalid event_type. Must be one of: ' + [...VALID_EVENTS].join(', '),
    });
  }

  try {
    const event = await insertEvent({
      event_type,
      metadata: metadata || null,
      source: source || null,
    });
    res.json({ success: true, event });
  } catch (err) {
    console.error('[events] insertEvent error:', err.message);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

// GET /admin/analytics — funnel metrics dashboard
router.get('/', adminAuth, async (req, res) => {
  const pwQuery = req.query._pw ? '?_pw=' + encodeURIComponent(req.query._pw) : '';
  try {
    const rows = await getEventCounts();

    // Build a quick lookup
    const counts = {};
    rows.forEach((r) => { counts[r.event_type] = parseInt(r.count, 10); });

    const pageViews    = counts.page_view        || 0;
    const scansStarted = counts.scan_started     || 0;
    const scansDone    = counts.scan_completed   || 0;
    const gatesShown   = counts.lead_gate_shown  || 0;
    // /scan sent `form_submitted` before it switched to `lead_submitted` — count both
    const leadsSub     = (counts.lead_submitted || 0) + (counts.form_submitted || 0);

    const scansFromViews   = pageViews > 0 ? ((scansStarted / pageViews) * 100).toFixed(1) : '0.0';
    const completionRate   = scansStarted > 0 ? ((scansDone / scansStarted) * 100).toFixed(1) : '0.0';
    const leadsFromScans   = scansDone > 0 ? ((leadsSub / scansDone) * 100).toFixed(1) : '0.0';
    const leadsFromViews   = pageViews > 0 ? ((leadsSub / pageViews) * 100).toFixed(1) : '0.0';

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Analytics — WastetideOS Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #080e0b; color: #e8f0ec; min-height: 100vh; }
    .header { background: #0d1810; border-bottom: 1px solid rgba(184,240,74,0.15); padding: 20px 40px; display: flex; align-items: center; justify-content: space-between; }
    .header h1 { font-size: 20px; font-weight: 700; color: #fff; }
    .header-sub { font-size: 13px; color: rgba(255,255,255,0.4); margin-top: 2px; }
    .back-link { font-size: 13px; color: #b8f04a; text-decoration: none; display: flex; align-items: center; gap: 6px; }
    .back-link:hover { text-decoration: underline; }
    .container { max-width: 1100px; margin: 0 auto; padding: 32px 40px; }

    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 32px; }
    .kpi { background: #0d1810; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 20px 24px; }
    .kpi-value { font-size: 32px; font-weight: 800; color: #b8f04a; line-height: 1; }
    .kpi-label { font-size: 11px; color: rgba(255,255,255,0.45); margin-top: 6px; text-transform: uppercase; letter-spacing: 0.08em; }

    .funnel-label { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 16px; }
    .funnel-row { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
    .funnel-name { font-size: 14px; font-weight: 500; color: #fff; min-width: 160px; }
    .funnel-bar-wrap { flex: 1; height: 32px; background: rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden; }
    .funnel-bar { height: 100%; background: linear-gradient(90deg, #b8f04a, #6ee7a0); border-radius: 6px; display: flex; align-items: center; padding: 0 12px; min-width: 40px; }
    .funnel-bar-label { font-size: 12px; font-weight: 700; color: #080e0b; }
    .funnel-count { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.5); min-width: 50px; text-align: right; }
    .funnel-rate { font-size: 12px; color: #6ee7a0; min-width: 80px; text-align: right; }

    .rates-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 40px; }
    .rate-card { background: #0d1810; border: 1px solid rgba(184,240,74,0.12); border-radius: 10px; padding: 24px; }
    .rate-value { font-size: 28px; font-weight: 800; color: #6ee7a0; }
    .rate-label { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 6px; line-height: 1.4; }

    .section-title { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 20px; }

    .events-table { width: 100%; border-collapse: collapse; background: #0d1810; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); margin-top: 40px; }
    .events-table thead th { padding: 12px 20px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.4); border-bottom: 1px solid rgba(255,255,255,0.08); }
    .events-table tbody td { padding: 12px 20px; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .events-table tbody tr:last-child td { border-bottom: none; }
    .events-table tbody tr:hover { background: rgba(184,240,74,0.04); }
    .event-name { font-family: 'Courier New', monospace; font-size: 13px; color: #b8f04a; }
    .event-count { font-weight: 700; color: #fff; }
    .no-data { text-align: center; padding: 80px 20px; color: rgba(255,255,255,0.25); font-size: 15px; }

    @media (max-width: 900px) {
      .kpi-grid { grid-template-columns: repeat(3, 1fr); }
      .rates-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>WastetideOS Analytics</h1>
      <div class="header-sub">WasteScope demo funnel — /scan</div>
    </div>
    <a href="/admin/leads${pwQuery}" class="back-link">← Leads</a>
  </div>
  <div class="container">

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-value">${pageViews.toLocaleString()}</div>
        <div class="kpi-label">Page Views</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">${scansStarted.toLocaleString()}</div>
        <div class="kpi-label">Scans Started</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">${scansDone.toLocaleString()}</div>
        <div class="kpi-label">Scans Completed</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">${leadsSub.toLocaleString()}</div>
        <div class="kpi-label">Leads Captured</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">${leadsFromViews}%</div>
        <div class="kpi-label">Views → Lead %</div>
      </div>
    </div>

    <div class="section-title">Funnel Breakdown</div>
    ${pageViews === 0 ? '<div class="no-data">No events yet. Send traffic to /scan to start tracking.</div>' : `
    <div class="funnel-row">
      <div class="funnel-name">Page Views</div>
      <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:100%"><span class="funnel-bar-label">${pageViews.toLocaleString()}</span></div></div>
      <div class="funnel-count">${pageViews.toLocaleString()}</div>
      <div class="funnel-rate">100%</div>
    </div>
    <div class="funnel-row">
      <div class="funnel-name">Scan Started</div>
      <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${scansFromViews}%"><span class="funnel-bar-label">${scansStarted.toLocaleString()}</span></div></div>
      <div class="funnel-count">${scansStarted.toLocaleString()}</div>
      <div class="funnel-rate">${scansFromViews}% of views</div>
    </div>
    <div class="funnel-row">
      <div class="funnel-name">Scan Completed</div>
      <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${scansDone > 0 ? Math.max(5, (scansDone / pageViews) * 100) : 0}%"><span class="funnel-bar-label">${scansDone.toLocaleString()}</span></div></div>
      <div class="funnel-count">${scansDone.toLocaleString()}</div>
      <div class="funnel-rate">${completionRate}% of started</div>
    </div>
    <div class="funnel-row">
      <div class="funnel-name">Lead Gate Shown</div>
      <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${gatesShown > 0 ? Math.max(5, (gatesShown / pageViews) * 100) : 0}%"><span class="funnel-bar-label">${gatesShown.toLocaleString()}</span></div></div>
      <div class="funnel-count">${gatesShown.toLocaleString()}</div>
      <div class="funnel-rate">${gatesShown > 0 ? ((gatesShown / pageViews) * 100).toFixed(1) : '0.0'}% of views</div>
    </div>
    <div class="funnel-row">
      <div class="funnel-name">Lead Submitted</div>
      <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${leadsSub > 0 ? Math.max(5, (leadsSub / pageViews) * 100) : 0}%"><span class="funnel-bar-label">${leadsSub.toLocaleString()}</span></div></div>
      <div class="funnel-count">${leadsSub.toLocaleString()}</div>
      <div class="funnel-rate">${leadsFromScans}% of completed</div>
    </div>
    `}

    <div class="rates-grid" style="margin-top:32px">
      <div class="rate-card">
        <div class="rate-value">${scansFromViews}%</div>
        <div class="rate-label">View → Scan rate<br>(click-through)</div>
      </div>
      <div class="rate-card">
        <div class="rate-value">${completionRate}%</div>
        <div class="rate-label">Scan completion rate<br>(started → done)</div>
      </div>
      <div class="rate-card">
        <div class="rate-value">${leadsFromScans}%</div>
        <div class="rate-label">Scan → Lead rate<br>(gate conversion)</div>
      </div>
      <div class="rate-card">
        <div class="rate-value">${leadsFromViews}%</div>
        <div class="rate-label">Overall view → lead<br>conversion</div>
      </div>
    </div>

    ${rows.length > 0 ? `
    <table class="events-table">
      <thead><tr><th>Event Type</th><th>Count</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr><td class="event-name">${escHtml(r.event_type)}</td><td class="event-count">${parseInt(r.count, 10).toLocaleString()}</td></tr>`).join('')}
      </tbody>
    </table>` : ''}

  </div>
</body>
</html>`);
  } catch (err) {
    console.error('[events] getEventCounts error:', err.message);
    res.status(500).send('Failed to load analytics');
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