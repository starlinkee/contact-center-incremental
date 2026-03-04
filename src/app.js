const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');
const db = require('./db');
const { authMiddleware, loginRouter } = require('./auth');
const queue = require('./queue');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessions
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

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
