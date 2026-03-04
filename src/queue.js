const db = require('./db');
const config = require('./config');

const workers = {};

function registerWorker(type, handler) {
  workers[type] = handler;
}

function addJob(type, payload, runAt = null) {
  const stmt = db.prepare(`
    INSERT INTO jobs (type, payload, run_at)
    VALUES (?, ?, COALESCE(?, datetime('now')))
  `);
  return stmt.run(type, JSON.stringify(payload), runAt);
}

function processJobs() {
  const jobs = db.prepare(`
    SELECT * FROM jobs
    WHERE status = 'pending'
      AND run_at <= datetime('now')
      AND attempts < max_attempts
    ORDER BY run_at ASC
    LIMIT 5
  `).all();

  for (const job of jobs) {
    const worker = workers[job.type];
    if (!worker) {
      console.error(`No worker registered for job type: ${job.type}`);
      db.prepare(`UPDATE jobs SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(job.id);
      continue;
    }

    // Mark as running
    db.prepare(`UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?`).run(job.id);

    const payload = JSON.parse(job.payload);
    worker(payload, job)
      .then((result) => {
        const resultJson = result ? JSON.stringify(result) : null;
        db.prepare(`UPDATE jobs SET status = 'done', result = ?, updated_at = datetime('now') WHERE id = ?`).run(resultJson, job.id);
      })
      .catch((err) => {
        console.error(`Job ${job.id} (${job.type}) failed:`, err.message);
        const newStatus = job.attempts + 1 >= job.max_attempts ? 'failed' : 'pending';
        db.prepare(`UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(newStatus, job.id);
      });
  }
}

let interval = null;

function start() {
  // Register all workers
  const scraperWorker = require('./workers/scraper');
  const emailScraperWorker = require('./workers/emailScraper');
  const emailSenderWorker = require('./workers/emailSender');

  registerWorker('places_scrape', scraperWorker);
  registerWorker('email_scrape', emailScraperWorker);
  registerWorker('send_email', emailSenderWorker);

  console.log('Queue started, polling every', config.queuePollInterval / 1000, 'seconds');
  interval = setInterval(processJobs, config.queuePollInterval);
  // Run once immediately
  processJobs();
}

function stop() {
  if (interval) clearInterval(interval);
}

function getStats() {
  return db.prepare(`
    SELECT status, COUNT(*) as count
    FROM jobs
    GROUP BY status
  `).all();
}

module.exports = { addJob, start, stop, getStats, registerWorker };
