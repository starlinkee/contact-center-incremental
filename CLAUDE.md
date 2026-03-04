# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LeadScraper — a lead scraping and cold email outreach platform. Searches businesses via Google Places API, extracts contact emails from websites, manages email campaigns with warmup functionality, and tracks opens/replies.

## Tech Stack

- **Backend**: Express.js 5 (Node.js, CommonJS)
- **Database**: SQLite3 (better-sqlite3, WAL mode) in `data/app.db`
- **Templates**: EJS
- **Styling**: Tailwind CSS 4 (dark theme, gray-950/gray-900)
- **Email**: SendGrid
- **Auth**: Single password (APP_PASSWORD env var), bcrypt, express-session

## Commands

```bash
npm run dev          # Start dev server with --watch (auto-restart on changes)
npm start            # Production start
npm run build:css    # Rebuild Tailwind CSS (input.css → public/styles.css)
```

Docker:
```bash
docker compose up -d --build   # Build and run
docker compose logs -f app     # View logs
```

## Architecture

**Entry point**: `src/app.js` — Express server, mounts routes, starts queue processor.

### Job Queue System (`src/queue.js`)
Custom SQLite-backed queue polling every 10s. Three job types:
- `places_scrape` → `src/workers/scraper.js` (Google Places API)
- `email_scrape` → `src/workers/emailScraper.js` (website crawling with cheerio)
- `send_email` → `src/workers/emailSender.js` (SendGrid dispatch)

Workers register via `registerWorker(type, handler)`. Auto-retry up to 3 attempts.

### Data Flow
```
Google Places API → scraper worker → businesses table
→ emailScraper worker → extract emails → update businesses.email
→ emailSender worker → SendGrid → sent_emails (with tracking pixel)
→ tracking route ← email opens
```

### Email Warmup (`src/services/warmup.js`)
10-level progression (5→50 emails/day). Level-up after 3 days without bounces. Round-robin inbox selection with per-inbox daily limits.

### Routes (all behind `authMiddleware` except `/auth` and `/track`)
- `/` — Dashboard (stats, queue overview)
- `/scraping` — Places search & email scraping triggers
- `/businesses` — Paginated business list with filtering
- `/campaigns` — Campaign CRUD, inbox management, bulk sending
- `/analytics` — Campaign performance metrics
- `/track/open/:id` — 1x1 GIF tracking pixel

### Database Tables
`businesses`, `jobs`, `inboxes`, `campaigns`, `sent_emails`, `daily_usage` — migrations run automatically in `src/db.js`.

### Config (`src/config.js`)
Key tunables: `queuePollInterval` (10s), `emailScrapeDelay` (1s), `warmupLevels` array, `warmupDaysPerLevel` (3).

## Environment Variables

Required in `.env`: `PORT`, `SESSION_SECRET`, `APP_PASSWORD`, `GOOGLE_PLACES_API_KEY`, `SENDGRID_API_KEY`, `APP_URL` (base URL for tracking pixel).

## Workflow

- **Always create a new git branch** for each new feature or task before making changes. Never work directly on `main`.

## Deployment

CI/CD via GitHub Actions (`.github/workflows/deploy.yml`) — pushes to `main` trigger SSH deploy to VPS with Docker rebuild. See `DEPLOY.md` for VPS setup details.
