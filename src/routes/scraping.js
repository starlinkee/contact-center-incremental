const express = require('express');
const router = express.Router();
const db = require('../db');
const { addJob } = require('../queue');
const config = require('../config');

router.get('/', (req, res) => {
  const recentJobs = db.prepare(`
    SELECT * FROM jobs WHERE type IN ('places_scrape', 'email_scrape')
    ORDER BY created_at DESC LIMIT 20
  `).all();

  const msg = req.query.msg || null;

  res.render('scraping', { recentJobs, costPerCall: config.costPerPlacesCall, msg });
});

// Start a new coordinate-based places scrape
router.post('/start', (req, res) => {
  const { lat, lng, radius, keywords, budget } = req.body;

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const parsedRadius = parseFloat(radius);
  const parsedBudget = parseFloat(budget);

  if (isNaN(parsedLat) || isNaN(parsedLng) || !keywords) {
    return res.redirect('/scraping?msg=Invalid+coordinates+or+keywords');
  }

  const keywordList = keywords.split(',').map(k => k.trim()).filter(Boolean);
  if (keywordList.length === 0) {
    return res.redirect('/scraping');
  }

  if (!parsedBudget || parsedBudget <= 0) {
    return res.redirect('/scraping');
  }

  if (!parsedRadius || parsedRadius <= 0 || parsedRadius > 50) {
    return res.redirect('/scraping?msg=Radius+must+be+between+0.5+and+50+km');
  }

  addJob('places_scrape', {
    lat: parsedLat,
    lng: parsedLng,
    radiusKm: parsedRadius,
    keywords: keywordList,
    budget: parsedBudget,
  });

  res.redirect('/scraping?msg=Scrape+job+queued');
});

module.exports = router;
