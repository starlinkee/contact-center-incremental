const express = require('express');
const router = express.Router();
const { recordOpen } = require('../services/sendgrid');

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

router.get('/open/:id', (req, res) => {
  const sentEmailId = parseInt(req.params.id, 10);
  if (sentEmailId) {
    try {
      recordOpen(sentEmailId);
    } catch (err) {
      console.error('Failed to record open:', err.message);
    }
  }
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send(PIXEL);
});

module.exports = router;
