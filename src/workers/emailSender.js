const db = require('../db');
const { sendEmail } = require('../services/sendgrid');
const { pickInbox, incrementSentCount } = require('../services/warmup');
const { addJob } = require('../queue');

function applyTemplate(template, business) {
  return template
    .replace(/\{\{name\}\}/g, business.name || '')
    .replace(/\{\{company\}\}/g, business.name || '')
    .replace(/\{\{address\}\}/g, business.address || '')
    .replace(/\{\{category\}\}/g, business.category || '');
}

async function emailSenderWorker(payload) {
  const { businessId, campaignId, sequenceNum = 1 } = payload;

  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId);
  if (!business || !business.email) {
    console.log(`Business #${businessId} has no email, skipping`);
    return;
  }

  // Check if already sent this sequence
  const alreadySent = db.prepare(`
    SELECT id FROM sent_emails
    WHERE business_id = ? AND campaign_id = ? AND sequence_num = ?
  `).get(businessId, campaignId, sequenceNum);
  if (alreadySent) {
    console.log(`Already sent sequence ${sequenceNum} to business #${businessId}`);
    return;
  }

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign || !campaign.active) {
    console.log(`Campaign #${campaignId} not found or inactive`);
    return;
  }

  const inbox = pickInbox();
  if (!inbox) {
    throw new Error('No available inbox (all at daily limit)');
  }

  const subject = sequenceNum === 1 ? campaign.subject_1 : campaign.subject_2;
  const body = sequenceNum === 1 ? campaign.body_1 : campaign.body_2;
  if (!subject || !body) {
    console.log(`No template for sequence ${sequenceNum} in campaign #${campaignId}`);
    return;
  }

  // Insert tracking record first to get the ID
  const result = db.prepare(`
    INSERT INTO sent_emails (business_id, campaign_id, inbox_id, sequence_num)
    VALUES (?, ?, ?, ?)
  `).run(businessId, campaignId, inbox.id, sequenceNum);
  const sentEmailId = result.lastInsertRowid;

  const messageId = await sendEmail({
    to: business.email,
    from: inbox.email,
    subject: applyTemplate(subject, business),
    htmlBody: applyTemplate(body, business),
    inboxApiKey: inbox.sendgrid_api_key,
    trackingId: sentEmailId,
  });

  // Update with message ID
  db.prepare('UPDATE sent_emails SET message_id = ? WHERE id = ?').run(messageId, sentEmailId);
  incrementSentCount(inbox.id);

  console.log(`Sent sequence ${sequenceNum} to ${business.email} via ${inbox.email}`);

  // Queue follow-up if this was sequence 1
  if (sequenceNum === 1 && campaign.subject_2) {
    const followupDate = new Date();
    followupDate.setDate(followupDate.getDate() + campaign.followup_days);
    addJob('send_email', {
      businessId,
      campaignId,
      sequenceNum: 2,
    }, followupDate.toISOString().replace('T', ' ').slice(0, 19));
  }
}

module.exports = emailSenderWorker;
