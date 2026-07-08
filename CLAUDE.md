# CLAUDE.md — WastetideOS

## What this app does
WastetideOS is an AI-powered industrial waste intelligence platform for Wastetide. It helps factories identify the resale value hidden in their industrial waste. The core demo lets users upload a waste photo and receive instant material identification, live resale value estimates, and CO₂ avoided calculations.

## Stack
Express.js · EJS templates · Neon PostgreSQL · Render hosting · OpenAI proxy (GPT-4o vision) · Polsia R2 (file storage)

## Directory map
- `routes/` — Express Router modules, one per feature group
- `db/` — Database query functions (Pool constructed here; migrate.js has its own Pool for migration runs)
- `lib/` — Shared utilities (AI pipelines, R2 upload, YouTube upload, email, PDF)
- `views/` — EJS page templates and partials
- `views/partials/` — Landing page section partials (manifesto, problem, solution, etc.)
- `public/css/` — Site CSS (theme.css with design tokens)
- `migrations/` — DDL migration files (timestamp-prefixed .js files)
- `jobs/` — Background jobs (podcast-youtube-sync)

## Database
- `users` — App users with subscription fields (synced by Polsia on subscribe)
- `leads` — Demo leads from /scan: name, email, company, scan_data (JSONB), created_at
- `scan_events` — Funnel analytics events: event_type, metadata (JSONB), created_at
- `bsd_scans` — French BSD waste scans: photo_url, scan_data (JSONB), waste_code, generator info, created_at
- `podcast_episodes` — Secondary Materials podcast episodes: all fields including pipeline output (status, transcript, show_notes, key_takeaways, pull_quotes, chapter_timestamps, video_url, thumbnail_url, itunes_summary, youtube_url, published_yt_video_id)
- `podcast_subscribers` — Email subscribers for new episode notifications
- `podcast_guest_applications` — Guest application form submissions
- `_migrations` — Migration tracking table (which migrations have run)

## External integrations
- **OpenAI proxy** (`OPENAI_BASE_URL` + `OPENAI_API_KEY`) — GPT-4o vision for waste photo analysis at `/api/analyze`; GPT-4o for show notes generation; DALL-E 3 for episode thumbnail generation
- **Google Gemini** (`POLSIAGEMINI_API_KEY`) — Gemini 2.0 Flash for audio/video transcription (multimodal API, file passed directly)
- **Polsia R2** (`POLSIA_API_KEY`) — Photo and video uploads to `https://polsia.com/api/proxy/r2/upload`
- **Neon PostgreSQL** (`DATABASE_URL`) — Serverless Postgres, auto-suspends; health check avoids DB queries for this reason
- **YouTube Data API** (`GOOGLE_APPLICATION_CREDENTIALS` service account) — Video upload for podcast publishing

## Recent changes
- 2026-06-26: Built episode upload & processing pipeline at /admin/upload — Gemini transcription, GPT-4o show notes, DALL-E 3 thumbnail; password auth via PODCAST_ADMIN_PASSWORD env var; `podcast_episodes` table extended with pipeline fields (status, transcript, show_notes, key_takeaways, pull_quotes, chapter_timestamps); `routes/admin-upload.js`, `lib/r2-upload.js`, `lib/gemini-transcribe.js`, `lib/show-notes-gen.js`, `lib/thumbnail-gen.js`, `views/admin-upload.ejs`; PATCH /admin/podcast/:id for inline episode editing
- 2026-06-25: Added Secondary Materials podcast at /podcast — dark-theme landing page with hero banner, episode list (seeded with 2 episodes), guest application form, email signup, and Polsia analytics beacon; `podcast_episodes`, `podcast_subscribers`, `podcast_guest_applications` tables; `routes/podcast.js`, `db/podcast.js`, `lib/polsia-notify.js`, `views/podcast.ejs`
- 2026-06-08: Added trackdechets.ai BSD scanner at /bsd — French BSD (bordereau de suivi des déchets) form generation from AI waste photo analysis; maps materials to European Waste Catalogue codes (17 04 07, 16 02 13*, etc.); PDF download via browser print; `bsd_scans` table stores all scans; `routes/bsdscan.js`, `db/bsdscans.js`, `lib/bsd-codes.js`; `views/bsd.ejs` uses same dark theme as wastetide.ai with Space Grotesk + lime #b8f04a; trackdechets.ai custom domain added to Render service (DNS A record needed)
- 2026-06-08: Added analytics tracking to /scan — `scan_events` table logs page_view, scan_started, scan_completed, lead_gate_shown, lead_submitted; POST /api/events fires from JS at each funnel step; /admin/analytics shows KPI grid, funnel bars, and conversion rates
- 2026-05-23: Added lead capture gate to /scan — after scan completes, gated overlay collects name/email/company before revealing full results; stored in `leads` table; `/admin/leads` lists all captured leads with scan summaries
- 2026-05-22: Consolidated theme.css — removed duplicate rule blocks (label, problem, solution defined twice); unified all design tokens, spacing, and typography into single clean file (1178 lines)
- 2026-05-22: Fixed `.label::before` decorator rule (was misnamed `.hero-visual::before`); aligned hero template to single-column layout matching updated CSS
- 2026-05-22: Restyled landing page to match wastetide.ai — Space Grotesk + Space Mono body fonts, brighter lime (#b8f04a), deeper dark bg (#080e0b), lime CTAs, monospace data labels, marquee strip
- 2026-05-22: Full landing page redesign — dark theme, lime accent, sticky frosted nav, pill-shaped CTAs, bento grid cards, founder quote section
