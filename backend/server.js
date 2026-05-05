import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

import passport from "./config/passport.js";
import authRoutes from "./routes/authRoutes.js";
import tournamentRoutes from "./routes/tournamentRoutes.js";
import entryRoutes from "./routes/entryRoutes.js";
import weightPresetRoutes from "./routes/weightPresetRoutes.js";
import visitorRoutes from "./routes/visitorRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import teamSubmissionRoutes from "./routes/teamSubmissionRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

import logger, { logMiddleware } from "./utils/logger.js";
import { generalRateLimiter, authRateLimiter } from "./middleware/rateLimiter.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isDev = process.env.NODE_ENV !== "production";

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception - Server crashing", { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection - Server may crash", { reason: String(reason) });
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5174",
  "https://khiladi-khoj.vercel.app",
  "https://khiladi-khoj.com",
];

const vercelPreviewRegex = /^https:\/\/.*\.vercel\.app$/;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || vercelPreviewRegex.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const jsonBodyLimit = process.env.JSON_BODY_LIMIT || "5mb";
const urlEncodedBodyLimit = process.env.URLENCODED_BODY_LIMIT || "1mb";

app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: urlEncodedBodyLimit }));
app.use(cookieParser());
app.use(passport.initialize());

console.log("STATIC UPLOADS PATH:", path.join(__dirname, "uploads"));

app.use("/uploads", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(logMiddleware);

if (process.env.NODE_ENV === "production") {
  app.use("/api/auth", authRateLimiter);
  app.use("/api/tournament", generalRateLimiter);
  app.use("/api/tournaments", generalRateLimiter);
  app.use("/api/weight-presets", generalRateLimiter);
  app.use("/api/visitor", generalRateLimiter);
  app.use("/api/import", generalRateLimiter);
  app.use("/api/team-submissions", generalRateLimiter);
  app.use("/api/admin", generalRateLimiter);
  app.use(generalRateLimiter);
}

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

app.use("/api/auth", authRoutes);
app.use("/api/tournament", tournamentRoutes);
app.use("/api/tournaments", entryRoutes);
app.use("/api/weight-presets", weightPresetRoutes);
app.use("/api/visitor", visitorRoutes);
app.use("/api/import", importRoutes);
app.use("/api/team-submissions", teamSubmissionRoutes);
app.use("/api/admin", adminRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

app.use("*", (req, res) => {
  logger.warn("Route not found", { method: req.method, url: req.originalUrl });
  res.status(404).json({ message: "API route not found" });
});

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

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  if (isDev) console.log(`✅ Server running on http://localhost:${PORT}`);
});

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