const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  // Log URI shape (hide password) so we can confirm format in Render logs
  if (!uri) {
    console.error('MONGODB_URI env var is not set!');
    return null;
  }
  try {
    const redacted = uri.replace(/:([^@]+)@/, ':****@');
    console.log(`Connecting to MongoDB: ${redacted}`);
  } catch (_) {}

  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });

      console.log(`MongoDB Connected: ${conn.connection.host}`);

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected. Attempting to reconnect...');
      });
      mongoose.connection.on('reconnected', () => {
        console.log('MongoDB reconnected.');
      });
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB error:', err.message);
      });

      return conn;
    } catch (error) {
      retries++;
      console.error(`MongoDB attempt ${retries} failed: ${error.message}`);

      if (retries >= maxRetries) {
        console.error('Max retries reached. Server stays up but DB unavailable.');
        return null;
      }

      const delay = Math.min(1000 * Math.pow(2, retries), 16000);
      console.log(`Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

module.exports = connectDB;
