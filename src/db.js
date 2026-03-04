const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'app.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run migrations
db.exec(`
  CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY,
    place_id TEXT UNIQUE,
    name TEXT,
    address TEXT,
    phone TEXT,
    website TEXT,
    category TEXT,
    rating REAL,
    email TEXT,
    email_scraped_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY,
    type TEXT,
    payload TEXT,
    status TEXT DEFAULT 'pending',
    result TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    run_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inboxes (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE,
    sendgrid_api_key TEXT,
    daily_limit INTEGER DEFAULT 20,
    sent_today INTEGER DEFAULT 0,
    warmup_level INTEGER DEFAULT 1,
    warmup_started_at TEXT DEFAULT (datetime('now')),
    last_level_up TEXT DEFAULT (datetime('now')),
    bounce_count INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY,
    name TEXT,
    subject_1 TEXT,
    body_1 TEXT,
    subject_2 TEXT,
    body_2 TEXT,
    followup_days INTEGER DEFAULT 3,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sent_emails (
    id INTEGER PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id),
    campaign_id INTEGER REFERENCES campaigns(id),
    inbox_id INTEGER REFERENCES inboxes(id),
    sequence_num INTEGER,
    message_id TEXT,
    opened INTEGER DEFAULT 0,
    opened_at TEXT,
    replied INTEGER DEFAULT 0,
    replied_at TEXT,
    sent_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_usage (
    id INTEGER PRIMARY KEY,
    date TEXT,
    places_api_calls INTEGER DEFAULT 0,
    places_api_cost REAL DEFAULT 0,
    emails_sent INTEGER DEFAULT 0,
    UNIQUE(date)
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, run_at);
`);

// Migrations for existing databases
try {
  db.exec(`ALTER TABLE jobs ADD COLUMN result TEXT`);
} catch (e) {
  // Column already exists
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_businesses_email ON businesses(email);
  CREATE INDEX IF NOT EXISTS idx_sent_emails_business ON sent_emails(business_id);
  CREATE INDEX IF NOT EXISTS idx_sent_emails_campaign ON sent_emails(campaign_id);
`);

module.exports = db;
