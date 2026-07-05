const express = require('express');
const Chat = require('../models/Chat');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// List all chats for the logged-in user (most recently updated first)
router.get('/', async (req, res) => {
  const chats = await Chat.find({ userId: req.user._id }).sort({ updatedAt: -1 }).lean();
  res.json({ chats });
});

// Create or update (upsert) a full chat — called whenever the frontend saves locally,
// so every chat and every message is always backed up to MongoDB.
router.put('/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const { title, messages } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages array required.' });

  const cleanMessages = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content }));

  const chat = await Chat.findOneAndUpdate(
    { userId: req.user._id, clientId },
    { title: title || 'New chat', messages: cleanMessages },
    { upsert: true, new: true }
  );
  res.json({ chat });
});

router.delete('/:clientId', async (req, res) => {
  await Chat.deleteOne({ userId: req.user._id, clientId: req.params.clientId });
  res.json({ ok: true });
});

module.exports = router;
