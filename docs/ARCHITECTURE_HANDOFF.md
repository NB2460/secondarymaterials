# WastetideOS — Developer Architecture Handoff

> **Notion import**: Copy everything from this file into Notion. Use "Database" for the Table of Contents section — one property per section, toggle as done. Use "Callout" blocks for ⚠️ warnings. Use "Code" blocks (language: bash) for terminal snippets.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema](#2-database-schema)
3. [API Endpoints](#3-api-endpoints)
4. [WasteScope Scanner](#4-wastescope-scanner)
5. [Form Generation Engines](#5-form-generation-engines) *(planned)*
6. [Design System](#6-design-system)
7. [Deployment](#7-deployment)
8. [Known Issues](#8-known-issues)
9. [Code Quality Standards](#9-code-quality-standards)

---

## 1. Architecture Overview

### Repository
`https://github.com/Polsia-Inc/wastetideos`

### Tech Stack
Express.js · EJS templates · Neon PostgreSQL · Render hosting · OpenAI GPT-4o (vision) · Polsia R2 (file storage)

### Deployed Product
| App | URL | Status |
|-----|-----|--------|
| WastetideOS Core MVP | https://wastetideos.polsia.app | Active |
| trackdechets.ai | — | Planned (French BSD / trackdechets form engine) |
| e-manifest.us | — | Planned (EPA e-Manifest / Form 8700-22) |

### Directory Structure

```
routes/          Express Router modules — one file per endpoint group
db/              Database query functions — pool constructed here only
lib/             Shared utilities (landing-context.js builds EJS render data)
views/           EJS page templates and partials
views/partials/  Landing page section partials (manifesto, problem, etc.)
public/css/      Site CSS — theme.css with all design tokens (single file)
migrations/      DDL migration files — timestamp-prefixed .js files
server.js        Entry point — middleware, route mounts, app.listen
migrate.js       Standalone migration runner (own Pool, not db/)
```

### Key Design Decisions

- **No auth on admin routes** (`/admin/leads`, `/admin/analytics`) — MVP acceptable, requires review before any production traffic.
- **Health check does NOT query DB** — intentionally avoids triggering Neon auto-suspend on cold starts.
- **Image upload → R2 → Vision URL** — photos are uploaded to Polsia R2 first so GPT-4o can fetch via stable URL.
- **Server.js is 54 lines** — well under the 300-line entry-file cap. No refactoring needed.

---

## 2. Database Schema

All tables use `TIMESTAMPTZ DEFAULT NOW()` for `created_at`. All schemas live in `migrations/` (DDL never in runtime files).

### `leads`

Captures demo users who completed a scan and submitted their contact info.

```sql
CREATE TABLE leads (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  company    VARCHAR(255),
  scan_data  JSONB,          -- full GPT-4o analysis response JSON
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Indexes
CREATE INDEX leads_email_idx ON leads (LOWER(email));
CREATE INDEX leads_created_at_idx ON leads (created_at DESC);
```

**Purpose**: Demo lead capture. `scan_data` holds the full material analysis so you can see what the user scanned without re-running the model.

---

### `scan_events`

Funnel analytics for the `/scan` demo — tracks every step of the user journey.

```sql
CREATE TABLE scan_events (
  id         SERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,  -- page_view | scan_started | scan_completed | lead_gate_shown | lead_submitted
  metadata   JSONB,                 -- context: user agent, referrer, material count, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Indexes
CREATE INDEX scan_events_event_type_idx ON scan_events (event_type);
CREATE INDEX scan_events_created_at_idx ON scan_events (created_at DESC);
```

**Purpose**: Funnel analytics. `getEventCounts()` in `db/events.js` groups by `event_type` to drive `/admin/analytics`.

---

### Future Tables (planned, not yet created)

| Table | Purpose | Status |
|-------|---------|--------|
| `waste_scans` | Persistent scan history for trackdechets.ai | Planned |
| `emanifest_scans` | EPA e-Manifest scan records for e-manifest.us | Planned |

---

## 3. API Endpoints

### `POST /api/analyze`

Photo upload → GPT-4o vision → material identification + commodity pricing → CO₂ calculation.

**Request**: `multipart/form-data` with field `photo` (max 20MB, image/* only).

**Response**:
```json
{
  "success": true,
  "image_url": "https://pub-*.r2.dev/...",
  "scene_description": "...",
  "confidence": "high|medium|low",
  "materials": [
    {
      "material_key": "copper",
      "label": "Copper",
      "weight_kg": 15.5,
      "price_per_kg": 8.50,
      "value_usd": 131.75,
      "co2_avoided_kg": 54.25,
      "confidence_pct": 85,
      "notes": "visible copper wiring and pipes"
    }
  ],
  "summary": {
    "total_value_usd": 131.75,
    "total_weight_kg": 15.5,
    "total_co2_avoided_kg": 54.25,
    "car_days_avoided": 4.3
  }
}
```

**Error handling**: Returns 500 with `{ error: "..." }` on any failure. No partial results — if vision fails, the whole request fails.

**Files involved**: `routes/analyze.js`, `db/` (no persistence in this endpoint).

---

### `POST /api/events`

Log a funnel analytics event from the `/scan` page.

**Request body**:
```json
{ "event_type": "scan_started", "metadata": { "material_count": 3 } }
```

**Valid `event_type` values**: `page_view`, `scan_started`, `scan_completed`, `lead_gate_shown`, `lead_submitted`

**Response**: `{ "success": true, "event": { "id": 42, "event_type": "...", "created_at": "..." } }`

**Error**: 400 if `event_type` is invalid. 500 on DB failure.

---

### `POST /api/leads`

Capture a lead after the scan completes.

**Request body**:
```json
{ "name": "Jane Smith", "email": "jane@example.com", "company": "Acme Factory", "scan_data": { ... } }
```

**Validation**: `name` required (non-empty), `email` required (must contain `@`).

**Response**: `{ "success": true, "lead": { "id": 12, "name": "...", "created_at": "..." } }`

---

### `GET /admin/leads`

No auth (MVP). Lists all captured leads with scan summary, sorted newest-first.

---

### `GET /admin/analytics`

No auth (MVP). Funnel dashboard with KPI grid, conversion rate bars, and raw event counts.

---

### `GET /`

Landing page via EJS. `buildLandingContext()` in `lib/landing-context.js` provides page data.

---

### `GET /scan`

Demo scan page via EJS (`views/scan.ejs`).

---

### `GET /health`

Always returns `{ "status": "healthy" }`. Does NOT query the database (prevents Neon auto-suspend on cold starts).

---

## 4. WasteScope Scanner

The core AI scan engine. Lives entirely in `routes/analyze.js`. Reusable across all three products (core MVP, trackdechets, e-manifest) once form generation engines are added.

### How It Works

1. **Upload to R2** (`uploadToR2()`) — `POST /api/analyze` receives the photo, uploads to Polsia R2 via `https://polsia.com/api/proxy/r2/upload`, gets back a stable public URL.
2. **Vision analysis** (`analyzeWithVision()`) — Sends the R2 URL to GPT-4o via `openai.chat.completions.create`. System prompt enforces strict JSON schema response.
3. **Enrichment** (`enrichMaterials()`) — Each material from GPT-4o is enriched with commodity price, CO₂ factor, label, and calculated value.
4. **Aggregation** — `summary` object sums total value, weight, CO₂ avoided across all materials.

### Material Types (16 waste types)

| material_key | Label | Price ($/kg) | CO₂ Avoided (kg/kg) |
|---|---|---|---|
| `copper` | Copper | 8.50 | 3.5 |
| `aluminum` | Aluminum | 2.40 | 9.2 |
| `steel` | Steel | 0.55 | 1.8 |
| `stainless_steel` | Stainless Steel | 1.80 | 2.2 |
| `circuit_boards` | Circuit Boards / PCBs | 12.00 | 5.0 |
| `lithium_battery` | Lithium Batteries | 4.50 | 8.0 |
| `brass` | Brass | 5.20 | 4.0 |
| `lead` | Lead | 2.10 | 2.8 |
| `zinc` | Zinc | 3.00 | 3.1 |
| `plastic_hdpe` | HDPE Plastic | 0.40 | 1.5 |
| `plastic_abs` | ABS Plastic | 0.90 | 2.0 |
| `plastic_pp` | PP Plastic | 0.35 | 1.4 |
| `rubber` | Rubber | 1.20 | 2.5 |
| `glass` | Glass | 0.08 | 0.3 |
| `paper_cardboard` | Paper / Cardboard | 0.15 | 0.9 |
| `unknown` | Mixed / Unknown | 0.20 | 0.5 |

Commodity prices are hardcoded approximate spot prices (LME/COMEX averages). They are not fetched from a live API — this is demo-grade estimation.

### CO₂ Calculation

`co2_avoided_kg = weight_kg × CO2_AVOIDED[key]`

Reference: average passenger car emits ~4.6 tonnes CO₂/year = 4,600 kg/year = ~12.6 kg/day. `car_days_avoided` = `total_co2_avoided_kg / 12.6`.

---

## 5. Form Generation Engines

> ⚠️ **Not yet implemented.** This section documents the planned architecture.

### trackdechets.ai (French BSD)

**Input**: WasteScope scan data (material, weight, classification)

**Output**: Fills the French *Bordereau de Suivi des Déchets* (BSD) electronic form.

**Approach**:
- Map WasteScope material types → French waste codes (CER codes / code déchet)
- Field mapping: scan data → BSD form fields (producer, transporter, consignee info)
- PDF generation via a PDF library (lib TBD — currently none in `package.json`)

### e-manifest.us (EPA Form 8700-22)

**Input**: WasteScope scan data

**Output**: EPA Form 8700-22 (Uniform Hazardous Waste Manifest) field mapping.

**Approach**:
- Map scan data → U.S. DOT shipping descriptions + EPA hazardous waste codes
- Field mapping: scan data → manifest form fields (generator, transporter, TSDF info)
- PDF generation via a PDF library (lib TBD)

---

## 6. Design System

### Fonts

| Role | Font | Fallback |
|------|------|----------|
| Headings | Syne | sans-serif |
| Body / UI | Space Grotesk | sans-serif |
| Mono / data | Space Mono | monospace |

Loaded via Google Fonts: `https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Space+Grotesk:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap`

### Colors

```css
/* Backgrounds */
--bg-dark:     #080e0b   /* page background */
--bg-base:     #0b130e
--bg-card:     #0f1912
--bg-surface:  #f5f4f0   /* light surfaces */
--bg-warm:     #eceae4

/* Brand accent */
--lime:        #b8f04a   /* primary accent — CTAs, highlights */
--lime-dark:   #9cd93a
--lime-pale:   #d4f78a
--lime-dim:    rgba(184, 240, 74, 0.10)

/* Text */
--text:        #eff0ec   /* primary */
--text-dim:    rgba(239, 240, 236, 0.58)
--text-dark:   #181e1a  /* on light backgrounds */
--text-muted:  #5c6660
```

### Component Patterns

| Component | Pattern |
|-----------|---------|
| Buttons | Pill-shaped (`border-radius: 100px`), lime background, dark text |
| Cards | `--bg-card` background, `--border-dark` border, `--radius-lg` corners |
| Data labels | `Space Mono` font, small text, muted color |
| Page sections | `--section-y: 108px` vertical padding |
| Max content width | `--max-w: 1160px` |

### Admin UI

Admin pages (`/admin/leads`, `/admin/analytics`) use inline CSS — no external stylesheet, no framework. Built-in dark theme matches the brand (`#080e0b` background, `#b8f04a` accent).

---

## 7. Deployment

### Infrastructure

- **Hosting**: Render (web service)
- **Database**: Neon PostgreSQL (serverless, auto-suspends)
- **File storage**: Polsia R2 (via `https://polsia.com/api/proxy/r2/upload`)
- **AI**: OpenAI-compatible proxy (`OPENAI_BASE_URL` + `OPENAI_API_KEY`)

### Render Setup

- **Start command**: `npm start` → runs `node server.js`
- **Build command**: `npm install --include=dev && npm run build --if-present` → runs migrations
- **Health check**: `GET /health` → returns `{ "status": "healthy" }`, no DB query
- **Environment variables** (set in Render dashboard):

| Variable | Source | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Render → Neon (via `rdbms`) | Auto-provisioned by Render |
| `OPENAI_BASE_URL` | Manual | e.g. `https://api.openai.com/v1` or proxy |
| `OPENAI_API_KEY` | Manual | API key for vision model |
| `POLSIA_API_KEY` | Manual | For R2 upload auth |
| `PORT` | Render auto | Bind port |

### Custom Domains

`trackdechets.ai` and `e-manifest.us` are planned. No custom domains are currently connected.

### Polsia Infrastructure Notes

- `polsia.toml` at repo root declares Blaxel-compatible config
- `runtime = "node"`, `start = "npm start"`, `build = "npm install ..."`
- No `[[crons]]` entries — no scheduled recurring work yet

---

## 8. Known Issues

### `email_proxy` blocking ~30% of B2B domains

**Impact**: Cold outreach campaigns may have deliverability issues for users with strict corporate email filters.

**Status**: Known platform constraint. Not within WastetideOS codebase to fix — escalate to Polsia support if it becomes a blocker for growth.

---

### Browser automation tasks occasionally getting stuck

**Impact**: Pipeline-level issue affecting automated web tasks.

**Status**: Monitoring in place. Escalated to Polsia team via bug report.

---

### No admin auth on `/admin/leads` and `/admin/analytics`

**Impact**: Anyone who knows/guesses the URLs can see all leads and funnel data.

**Status**: Acceptable for MVP. Must be reviewed before any production traffic or sensitive data accumulation.

---

## 9. Code Quality Standards

### No hardcoded secrets
All credentials live in environment variables. No API keys, connection strings, or tokens in source code.

### No third-party analytics scripts
All events go to the `scan_events` table via `POST /api/events`. No external analytics (Google Analytics, Mixpanel, etc.).

### Form field validation before PDF generation (when form engines are built)
Validate all scan-derived data before passing to PDF render. Never trust GPT-4o output as structural input.

### Error handling on scan API
`POST /api/analyze` returns 500 with a meaningful error message on any failure. No silent drops. If vision model fails, the user sees an error rather than a blank response.

### Schema changes via migrations only
DDL (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`) goes in `migrations/<timestamp>_<name>.js`. No DDL in runtime files.

### Pool construction in `db/` only
`new Pool()` is constructed in `db/events.js` and `db/leads.js`. `server.js` does not touch the database directly.

### Entry file cap: 300 lines
`server.js` is the entry point. It is currently 54 lines. Any future additions must keep it under 300 lines.

### Route files use Express Router
Each endpoint group lives in `routes/<name>.js` using `express.Router()`. Mounted in `server.js` with `app.use('/api/<name>', require('./routes/<name>'))`.

### Inline comments — WHY only
Comments explain workarounds, surprising constraints, and non-obvious invariants. Do not narrate well-named code.

---

*Last updated: 2026-06-08 — WastetideOS Engineering handoff*