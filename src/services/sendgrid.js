const sgMail = require('@sendgrid/mail');
const config = require('../config');
const db = require('../db');
const crypto = require('crypto');

async function sendEmail({ to, from, subject, htmlBody, inboxApiKey, trackingId }) {
  const apiKey = inboxApiKey || config.sendgridApiKey;
  sgMail.setApiKey(apiKey);

  // Append tracking pixel
  const pixelUrl = `${config.appUrl}/track/open/${trackingId}`;
  const trackingPixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;
  const fullHtml = htmlBody + trackingPixel;

  const msg = {
    to,
    from,
    subject,
    html: fullHtml,
  };

  const [response] = await sgMail.send(msg);
  const messageId = response.headers['x-message-id'] || crypto.randomUUID();

  // Track daily usage
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO daily_usage (date, emails_sent) VALUES (?, 1)
    ON CONFLICT(date) DO UPDATE SET emails_sent = emails_sent + 1
  `).run(today);

  return messageId;
}

function recordOpen(sentEmailId) {
  db.prepare(`
    UPDATE sent_emails
    SET opened = 1, opened_at = datetime('now')
    WHERE id = ? AND opened = 0
  `).run(sentEmailId);
}

module.exports = { sendEmail, recordOpen };
