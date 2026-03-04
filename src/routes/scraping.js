const express = require('express');
const router = express.Router();
const db = require('../db');
const { addJob } = require('../queue');

router.get('/', (req, res) => {
  const recentJobs = db.prepare(`
    SELECT * FROM jobs WHERE type IN ('places_scrape', 'email_scrape')
    ORDER BY created_at DESC LIMIT 20
  `).all();

  res.render('scraping', { recentJobs });
});

// Start a new places scrape
router.post('/start', (req, res) => {
  const { query, maxResults } = req.body;
  if (!query) {
    return res.redirect('/scraping');
  }

  addJob('places_scrape', {
    query,
    maxResults: parseInt(maxResults, 10) || 20,
  });

  res.redirect('/scraping');
});

// Manually trigger email scraping for businesses without emails
router.post('/scrape-emails', (req, res) => {
  const businesses = db.prepare(`
    SELECT id, website FROM businesses
    WHERE website IS NOT NULL AND email IS NULL AND email_scraped_at IS NULL
    LIMIT 50
  `).all();

  for (const biz of businesses) {
    addJob('email_scrape', { businessId: biz.id, website: biz.website });
  }

  res.redirect('/scraping');
});

module.exports = router;
