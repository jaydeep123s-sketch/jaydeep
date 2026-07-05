const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PHONEPE_MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID;
const PHONEPE_SALT_KEY = process.env.PHONEPE_SALT_KEY;
const PHONEPE_SALT_INDEX = process.env.PHONEPE_SALT_INDEX || '1';
const PHONEPE_ENV = (process.env.PHONEPE_ENV || 'SANDBOX').toUpperCase(); // SANDBOX | PRODUCTION
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const PRO_PRICE_PAISE = parseInt(process.env.PRO_PRICE_PAISE || '19900', 10); // default ₹199.00

const PHONEPE_HOST =
  PHONEPE_ENV === 'PRODUCTION' ? 'https://api.phonepe.com/apis/hermes' : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Kick off a PhonePe payment for the "Pro" (unlimited) plan.
router.post('/phonepe/initiate', requireAuth, async (req, res) => {
  try {
    if (!PHONEPE_MERCHANT_ID || !PHONEPE_SALT_KEY) {
      return res.status(500).json({ error: 'PhonePe is not configured on the server yet (missing merchant credentials in .env).' });
    }

    const merchantTransactionId = `OM${Date.now()}${Math.floor(Math.random() * 1000)}`;

    req.user.payments.push({ merchantTransactionId, amount: PRO_PRICE_PAISE, status: 'PENDING' });
    await req.user.save();

    const payload = {
      merchantId: PHONEPE_MERCHANT_ID,
      merchantTransactionId,
      merchantUserId: req.user._id.toString(),
      amount: PRO_PRICE_PAISE, // in paise
      redirectUrl: `${APP_BASE_URL}/api/payment/phonepe/redirect?txn=${merchantTransactionId}`,
      redirectMode: 'REDIRECT',
      callbackUrl: `${APP_BASE_URL}/api/payment/phonepe/callback`,
      paymentInstrument: { type: 'PAY_PAGE' },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const checksum = sha256Hex(base64Payload + '/pg/v1/pay' + PHONEPE_SALT_KEY) + '###' + PHONEPE_SALT_INDEX;

    const response = await fetch(`${PHONEPE_HOST}/pg/v1/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        accept: 'application/json',
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    const data = await response.json();
    const redirectUrl = data?.data?.instrumentResponse?.redirectInfo?.url;
    if (!redirectUrl) {
      return res.status(502).json({ error: 'PhonePe did not return a payment link.', details: data });
    }

    res.json({ redirectUrl, merchantTransactionId });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not start payment.' });
  }
});

// PhonePe redirects the user's browser back here after they finish paying.
// We check the real status server-to-server before trusting it, then bounce to the app.
router.get('/phonepe/redirect', async (req, res) => {
  const txn = req.query.txn;
  try {
    const status = await checkStatusAndUpdate(txn);
    res.redirect(`/?payment=${status === 'SUCCESS' ? 'success' : 'failed'}`);
  } catch (err) {
    res.redirect('/?payment=failed');
  }
});

// Server-to-server webhook PhonePe calls directly (in addition to the browser redirect).
router.post('/phonepe/callback', async (req, res) => {
  try {
    const txn = req.body?.data?.merchantTransactionId || req.body?.merchantTransactionId;
    if (txn) await checkStatusAndUpdate(txn);
    res.json({ ok: true });
  } catch (err) {
    res.status(200).json({ ok: false }); // always 200 so PhonePe doesn't endlessly retry
  }
});

router.get('/phonepe/status/:txn', requireAuth, async (req, res) => {
  try {
    const status = await checkStatusAndUpdate(req.params.txn);
    res.json({ status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function checkStatusAndUpdate(merchantTransactionId) {
  const path = `/pg/v1/status/${PHONEPE_MERCHANT_ID}/${merchantTransactionId}`;
  const checksum = sha256Hex(path + PHONEPE_SALT_KEY) + '###' + PHONEPE_SALT_INDEX;

  const response = await fetch(`${PHONEPE_HOST}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': checksum,
      'X-MERCHANT-ID': PHONEPE_MERCHANT_ID,
      accept: 'application/json',
    },
  });
  const data = await response.json();
  const success = data?.code === 'PAYMENT_SUCCESS';

  const user = await User.findOne({ 'payments.merchantTransactionId': merchantTransactionId });
  if (user) {
    const payment = user.payments.find((p) => p.merchantTransactionId === merchantTransactionId);
    if (payment) payment.status = success ? 'SUCCESS' : data?.code === 'PAYMENT_PENDING' ? 'PENDING' : 'FAILED';
    if (success) {
      user.plan = 'pro';
      user.planActivatedAt = new Date();
    }
    await user.save();
  }
  return success ? 'SUCCESS' : 'FAILED';
}

module.exports = router;
