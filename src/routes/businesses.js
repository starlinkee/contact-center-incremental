const express = require('express');
const router = express.Router();
const db = require('../db');
const { addJob } = require('../queue');

router.get('/', (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;
  const filter = req.query.filter || 'all'; // all, with_email, no_email

  let where = '';
  if (filter === 'with_email') where = 'WHERE email IS NOT NULL';
  if (filter === 'no_email') where = 'WHERE email IS NULL';

  const total = db.prepare(`SELECT COUNT(*) as c FROM businesses ${where}`).get().c;
  const businesses = db.prepare(`SELECT * FROM businesses ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);

  res.render('businesses', {
    businesses,
    page,
    totalPages: Math.ceil(total / limit),
    total,
    filter,
  });
});

// Delete a business
router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM businesses WHERE id = ?').run(req.params.id);
  res.redirect('/businesses');
});

// Re-scrape email for a single business
router.post('/:id/scrape-email', (req, res) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id);
  if (biz && biz.website) {
    addJob('email_scrape', { businessId: biz.id, website: biz.website });
  }
  res.redirect('/businesses');
});

module.exports = router;
