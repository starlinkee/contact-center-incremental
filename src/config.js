require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  appPassword: process.env.APP_PASSWORD || 'admin',
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
  sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  queuePollInterval: 10000, // 10 seconds
  emailScrapeDelay: 1000,   // 1 second between requests
  warmupLevels: [5, 8, 12, 18, 25, 30, 35, 40, 45, 50],
  warmupDaysPerLevel: 3,
  costPerPlacesCall: 0.085, // $85 per 1000 calls
};
