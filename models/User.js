const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },

    // Plan / billing
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    messageCount: { type: Number, default: 0 }, // total messages used on free plan
    freeLimit: { type: Number, default: () => parseInt(process.env.FREE_MESSAGE_LIMIT || '20', 10) },
    planActivatedAt: { type: Date },
    planExpiresAt: { type: Date }, // null/undefined = lifetime pro after payment

    // PhonePe payment history (lightweight, latest first)
    payments: [
      {
        merchantTransactionId: String,
        amount: Number, // in paise
        status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED'], default: 'PENDING' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
