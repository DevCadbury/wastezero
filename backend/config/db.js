const mongoose = require('mongoose');
const dns = require('dns');

// Force Node.js to use Google DNS — fixes SRV lookup failures on restricted networks
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

let connectPromise = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2 && connectPromise) {
    return connectPromise;
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured');
  }

  connectPromise = mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await connectPromise;
    return mongoose.connection;
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    throw error;
  } finally {
    connectPromise = null;
  }
};

module.exports = connectDB;
