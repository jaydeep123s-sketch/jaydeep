const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { requireAuth, signToken } = require('../middleware/auth');

const router = express.Router();

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    plan: user.plan,
    messageCount: user.messageCount,
    freeLimit: user.freeLimit,
    messagesLeft: user.plan === 'pro' ? null : Math.max(user.freeLimit - user.messageCount, 0),
  };
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are all required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), passwordHash });

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Registration failed.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Login failed.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = { router, publicUser };
