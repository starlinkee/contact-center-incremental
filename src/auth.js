const express = require('express');
const bcrypt = require('bcrypt');
const config = require('./config');

const router = express.Router();

// Hash the password on first use
let hashedPassword = null;
async function getHashedPassword() {
  if (!hashedPassword) {
    hashedPassword = await bcrypt.hash(config.appPassword, 10);
  }
  return hashedPassword;
}

// Login page
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Login handler
router.post('/login', async (req, res) => {
  const { password } = req.body;
  const valid = await bcrypt.compare(password, await getHashedPassword());
  if (valid) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.render('login', { error: 'Invalid password' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/auth/login');
});

// Auth middleware
function authMiddleware(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/auth/login');
}

module.exports = { authMiddleware, loginRouter: router };
