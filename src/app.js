const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const db = require('./db');
const { authMiddleware, loginRouter } = require('./auth');
const queue = require('./queue');

const app = express();

// Trust proxy (behind nginx/cloudflare)
app.set('trust proxy', 1);

// View engine:)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // EJS templates use inline styles
}));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessions
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: config.appUrl.startsWith('https'),
    sameSite: 'lax',
  }
}));

// Rate limit login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: 'Too many login attempts, try again in 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth/login', loginLimiter);

// Public routes (no auth)
app.use('/auth', loginRouter);
app.use('/track', require('./routes/tracking'));

// Auth wall
app.use(authMiddleware);

// Protected routes
app.use('/', require('./routes/dashboard'));
app.use('/scraping', require('./routes/scraping'));
app.use('/businesses', require('./routes/businesses'));
app.use('/campaigns', require('./routes/campaigns'));
app.use('/analytics', require('./routes/analytics'));

// Start queue processing
queue.start();

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
