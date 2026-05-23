const mongoose = require('mongoose');

const connectDB = async () => {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });

      console.log(`MongoDB Connected: ${conn.connection.host}`);

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected. Attempting to reconnect...');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('MongoDB reconnected.');
      });

      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
      });

      return conn;
    } catch (error) {
      retries++;
      console.error(`MongoDB connection attempt ${retries} failed: ${error.message}`);

      if (retries >= maxRetries) {
        console.error('Max retries reached. Could not connect to MongoDB.');
        process.exit(1);
      }

      const delay = Math.min(1000 * Math.pow(2, retries), 30000);
      console.log(`Retrying in ${delay / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

module.exports = connectDB;
