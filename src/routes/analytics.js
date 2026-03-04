const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  // Per-campaign stats
  const campaignStats = db.prepare(`
    SELECT
      c.id,
      c.name,
      COUNT(se.id) as total_sent,
      SUM(CASE WHEN se.opened = 1 THEN 1 ELSE 0 END) as total_opened,
      SUM(CASE WHEN se.replied = 1 THEN 1 ELSE 0 END) as total_replied
    FROM campaigns c
    LEFT JOIN sent_emails se ON se.campaign_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all().map(row => ({
    ...row,
    openRate: row.total_sent > 0 ? ((row.total_opened / row.total_sent) * 100).toFixed(1) : '0',
    replyRate: row.total_sent > 0 ? ((row.total_replied / row.total_sent) * 100).toFixed(1) : '0',
  }));

  // Recent sent emails
  const recentEmails = db.prepare(`
    SELECT se.*, b.name as business_name, b.email as business_email,
           c.name as campaign_name, i.email as inbox_email
    FROM sent_emails se
    JOIN businesses b ON b.id = se.business_id
    JOIN campaigns c ON c.id = se.campaign_id
    LEFT JOIN inboxes i ON i.id = se.inbox_id
    ORDER BY se.sent_at DESC
    LIMIT 50
  `).all();

  // Daily stats for last 7 days
  const dailyStats = db.prepare(`
    SELECT * FROM daily_usage
    ORDER BY date DESC LIMIT 7
  `).all();

  res.render('analytics', { campaignStats, recentEmails, dailyStats });
});

// Mark reply manually
router.post('/reply/:id', (req, res) => {
  db.prepare(`
    UPDATE sent_emails SET replied = 1, replied_at = datetime('now') WHERE id = ?
  `).run(req.params.id);
  res.redirect('/analytics');
});

module.exports = router;
