const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-env';

function signToken(user) {
  return jwt.sign({ uid: user._id.toString() }, JWT_SECRET, { expiresIn: '30d' });
}

// Requires a valid token. Attaches req.user (full Mongo document).
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Login required.' });

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.uid);
    if (!user) return res.status(401).json({ error: 'Invalid session, please log in again.' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session, please log in again.' });
  }
}

module.exports = { requireAuth, signToken, JWT_SECRET };
