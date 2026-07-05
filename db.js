const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return mongoose.connection;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in .env — database features will not work.');
    return null;
  }
  try {
    await mongoose.connect(uri, {
      maxPoolSize: 10, // connection pooling for speed under load
      serverSelectionTimeoutMS: 8000,
    });
    isConnected = true;
    console.log('MongoDB connected');
    return mongoose.connection;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    return null;
  }
}

module.exports = { connectDB };
