const db = require('../db');
const config = require('../config');

function getDailyLimit(warmupLevel) {
  const idx = Math.max(0, Math.min(warmupLevel - 1, config.warmupLevels.length - 1));
  return config.warmupLevels[idx];
}

function checkAndLevelUp() {
  const inboxes = db.prepare('SELECT * FROM inboxes WHERE active = 1').all();
  const now = new Date();

  for (const inbox of inboxes) {
    if (inbox.warmup_level >= config.warmupLevels.length) continue;

    const lastLevelUp = new Date(inbox.last_level_up);
    const daysSince = (now - lastLevelUp) / (1000 * 60 * 60 * 24);

    if (daysSince >= config.warmupDaysPerLevel && inbox.bounce_count === 0) {
      const newLevel = Math.min(inbox.warmup_level + 1, config.warmupLevels.length);
      db.prepare(`
        UPDATE inboxes SET warmup_level = ?, last_level_up = datetime('now'), daily_limit = ? WHERE id = ?
      `).run(newLevel, getDailyLimit(newLevel), inbox.id);
      console.log(`Inbox ${inbox.email} leveled up to ${newLevel}`);
    }
  }
}

function resetDailyCounts() {
  db.prepare('UPDATE inboxes SET sent_today = 0').run();
  console.log('Reset daily send counts for all inboxes');
}

function pickInbox() {
  // Round-robin: pick inbox with lowest sent_today that hasn't hit its limit
  return db.prepare(`
    SELECT * FROM inboxes
    WHERE active = 1 AND sent_today < daily_limit
    ORDER BY sent_today ASC
    LIMIT 1
  `).get();
}

function incrementSentCount(inboxId) {
  db.prepare('UPDATE inboxes SET sent_today = sent_today + 1 WHERE id = ?').run(inboxId);
}

module.exports = { getDailyLimit, checkAndLevelUp, resetDailyCounts, pickInbox, incrementSentCount };
