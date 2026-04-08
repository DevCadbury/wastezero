const mongoose = require('mongoose');
const dns = require('dns');

// Force Node.js to use Google DNS — fixes SRV lookup failures on restricted networks
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    // In Vercel serverless, do not hard-exit the process on transient DB failures.
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
};

module.exports = connectDB;
