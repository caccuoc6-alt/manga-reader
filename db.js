/**
 * db.js — MongoDB connection via Mongoose
 */
const mongoose = require('mongoose');

module.exports = async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI is not set. Add it to your environment variables.');
    process.exit(1);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log('✅  Connected to MongoDB Atlas');
};
