const express = require('express');
const router = express.Router();
const db = require('../db');
const { addJob } = require('../queue');

router.get('/', (req, res) => {
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
  const inboxes = db.prepare('SELECT * FROM inboxes ORDER BY created_at DESC').all();
  res.render('campaigns', { campaigns, inboxes });
});

// Create campaign
router.post('/create', (req, res) => {
  const { name, subject_1, body_1, subject_2, body_2, followup_days } = req.body;
  db.prepare(`
    INSERT INTO campaigns (name, subject_1, body_1, subject_2, body_2, followup_days)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, subject_1, body_1, subject_2 || null, body_2 || null, parseInt(followup_days, 10) || 3);
  res.redirect('/campaigns');
});

// Toggle campaign active/inactive
router.post('/:id/toggle', (req, res) => {
  db.prepare('UPDATE campaigns SET active = NOT active WHERE id = ?').run(req.params.id);
  res.redirect('/campaigns');
});

// Delete campaign
router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(req.params.id);
  res.redirect('/campaigns');
});

// Send campaign to businesses with emails
router.post('/:id/send', (req, res) => {
  const campaignId = parseInt(req.params.id, 10);
  const { filter } = req.body; // 'all' or 'unsent'

  let businesses;
  if (filter === 'unsent') {
    businesses = db.prepare(`
      SELECT b.id FROM businesses b
      WHERE b.email IS NOT NULL
        AND b.id NOT IN (SELECT business_id FROM sent_emails WHERE campaign_id = ?)
    `).all(campaignId);
  } else {
    businesses = db.prepare('SELECT id FROM businesses WHERE email IS NOT NULL').all();
  }

  for (const biz of businesses) {
    addJob('send_email', { businessId: biz.id, campaignId, sequenceNum: 1 });
  }

  res.redirect('/campaigns');
});

// Add inbox
router.post('/inboxes/add', (req, res) => {
  const { email, sendgrid_api_key } = req.body;
  db.prepare(`
    INSERT OR IGNORE INTO inboxes (email, sendgrid_api_key) VALUES (?, ?)
  `).run(email, sendgrid_api_key || null);
  res.redirect('/campaigns');
});

// Toggle inbox
router.post('/inboxes/:id/toggle', (req, res) => {
  db.prepare('UPDATE inboxes SET active = NOT active WHERE id = ?').run(req.params.id);
  res.redirect('/campaigns');
});

// Delete inbox
router.post('/inboxes/:id/delete', (req, res) => {
  db.prepare('DELETE FROM inboxes WHERE id = ?').run(req.params.id);
  res.redirect('/campaigns');
});

module.exports = router;
