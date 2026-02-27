import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/authRoutes.js";
import tournamentRoutes from "./routes/tournamentRoutes.js";
import entryRoutes from "./routes/entryRoutes.js";
import weightPresetRoutes from "./routes/weightPresetRoutes.js";

import logger, { logMiddleware } from "./utils/logger.js";
import { generalRateLimiter, authRateLimiter } from "./middleware/rateLimiter.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isDev = process.env.NODE_ENV !== "production";

// Global Error Handlers
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception - Server crashing", { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection - Server may crash", { reason: String(reason) });
});

// Helmet
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// CORS
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:5174",
      "https://khiladi-khoj.vercel.app",
      "https://khiladi-khoj.com",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parsing (CRITICAL: must be before routes)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// Static
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Request logging
app.use(logMiddleware);

// Rate limiters (keep existing behavior)
if (process.env.NODE_ENV === "production") {
  app.use("/api/auth", authRateLimiter);
  app.use("/api/tournament", generalRateLimiter);
  app.use("/api/tournaments", generalRateLimiter);
  app.use("/api/weight-presets", generalRateLimiter);
  app.use(generalRateLimiter);
}

// ================ DATABASE CONNECTION ================
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
  logger.error("MONGO_URI not defined in .env file");
  process.exit(1);
}

mongoose
  .connect(mongoURI)
  .then(() => {
    logger.info("MongoDB connected successfully");
    if (isDev) console.log("🚀 MongoDB Connected ✅");
  })
  .catch((err) => {
    logger.error("MongoDB connection failed", { error: err.message, stack: err.stack });
    console.error("❌ MongoDB Connection Failed:", err.message);
    process.exit(1);
  });

// ================ ROUTES ================
app.use("/api/auth", authRoutes);
app.use("/api/tournament", tournamentRoutes);

// ✅ Entry routes mount (correct)
app.use("/api/tournaments", entryRoutes);

// Weight presets
app.use("/api/weight-presets", weightPresetRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// 404 handler
app.use("*", (req, res) => {
  logger.warn("Route not found", { method: req.method, url: req.originalUrl });
  res.status(404).json({ message: "API route not found" });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

// ================ SERVER START ================
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  if (isDev) console.log(`✅ Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);

function shutDown() {
  logger.info("Received shutdown signal. Closing server gracefully...");
  server.close(async () => {
    logger.info("HTTP server closed.");
    await mongoose.disconnect();
    logger.info("MongoDB disconnected.");
    process.exit(0);
  });
}