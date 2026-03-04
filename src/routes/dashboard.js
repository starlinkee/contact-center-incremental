const express = require('express');
const router = express.Router();
const db = require('../db');
const queue = require('../queue');
const { getTodayUsage } = require('../services/places');
const { checkAndLevelUp, resetDailyCounts } = require('../services/warmup');

router.get('/', (req, res) => {
  const stats = {
    totalBusinesses: db.prepare('SELECT COUNT(*) as c FROM businesses').get().c,
    emailsFound: db.prepare('SELECT COUNT(*) as c FROM businesses WHERE email IS NOT NULL').get().c,
    totalSent: db.prepare('SELECT COUNT(*) as c FROM sent_emails').get().c,
    totalOpened: db.prepare('SELECT COUNT(*) as c FROM sent_emails WHERE opened = 1').get().c,
    totalReplied: db.prepare('SELECT COUNT(*) as c FROM sent_emails WHERE replied = 1').get().c,
  };
  stats.openRate = stats.totalSent > 0 ? ((stats.totalOpened / stats.totalSent) * 100).toFixed(1) : '0';
  stats.replyRate = stats.totalSent > 0 ? ((stats.totalReplied / stats.totalSent) * 100).toFixed(1) : '0';

  const todayUsage = getTodayUsage();
  const jobStats = queue.getStats();

  res.render('dashboard', { stats, todayUsage, jobStats });
});

// Manual warmup actions
router.post('/warmup/check', (req, res) => {
  checkAndLevelUp();
  res.redirect('/');
});

router.post('/warmup/reset', (req, res) => {
  resetDailyCounts();
  res.redirect('/');
});

module.exports = router;
