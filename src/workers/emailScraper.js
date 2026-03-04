const db = require('../db');
const { scrapeEmailsFromUrl } = require('../services/emailExtractor');
const config = require('../config');

async function emailScraperWorker(payload) {
  const { businessId, website } = payload;

  console.log(`Scraping emails from ${website} for business #${businessId}`);

  // Rate limit
  await new Promise(r => setTimeout(r, config.emailScrapeDelay));

  const emails = await scrapeEmailsFromUrl(website);

  if (emails.length > 0) {
    const email = emails[0]; // Use the first email found
    db.prepare(`
      UPDATE businesses SET email = ?, email_scraped_at = datetime('now') WHERE id = ?
    `).run(email, businessId);
    console.log(`Found email ${email} for business #${businessId}`);
  } else {
    // Mark as scraped even if no email found
    db.prepare(`
      UPDATE businesses SET email_scraped_at = datetime('now') WHERE id = ?
    `).run(businessId);
    console.log(`No email found for business #${businessId}`);
  }
}

module.exports = emailScraperWorker;
