const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
  },
  { timestamps: true, _id: false }
);

const ChatSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String, required: true }, // id generated on the frontend, used to sync with localStorage
    title: { type: String, default: 'New chat' },
    messages: { type: [MessageSchema], default: [] },
  },
  { timestamps: true }
);

ChatSchema.index({ userId: 1, clientId: 1 }, { unique: true });

module.exports = mongoose.model('Chat', ChatSchema);
