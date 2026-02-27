// backend/config/mongoose-connection.js

import mongoose from 'mongoose';
import { logger } from "../utils/logger.js";

let retryCount = 0;
const maxRetries = 10; // Prevent infinite retries
const baseDelay = 5000; // Starting delay: 5 seconds

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI) {
    logger.error("❌ MONGO_URI not found in .env file!");
    process.exit(1);
  }

  try {
   await mongoose.connect(mongoURI, {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10,
  socketTimeoutMS: 45000,
  family: 4,
  heartbeatFrequencyMS: 10000,     // Server monitoring frequency (default 10s, explicit kar dena achha)
  connectTimeoutMS: 10000,        // Initial connection timeout
  serverMonitoringMode: 'auto',    // Future-proof
});

    logger.info("🚀 MongoDB Connected Successfully!");
    retryCount = 0; // Reset retry count on successful connection

    // Connection event listeners
    mongoose.connection.on("disconnected", () => {
      logger.warn("⚠️ MongoDB Disconnected – attempting to reconnect...");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("🔄 MongoDB Reconnected Successfully!");
    });

    mongoose.connection.on("error", (err) => {
      logger.error("❌ MongoDB Connection Error:", err.message);
    });

  } catch (error) {
    logger.error("❌ MongoDB Connection Failed:", error.message);

    if (retryCount < maxRetries) {
      retryCount++;
      // Exponential backoff: 5s, 10s, 15s, ..., up to 30s max delay
      const delay = Math.min(baseDelay * retryCount, 30000);
      logger.info(`🔄 Retrying MongoDB connection in ${delay / 1000} seconds... (Attempt ${retryCount}/${maxRetries})`);

      setTimeout(connectDB, delay);
    } else {
      logger.error(`❌ Maximum retry attempts (${maxRetries}) reached. Shutting down...`);
      process.exit(1); // Critical failure – exit the app
    }
  }
};

export default connectDB;