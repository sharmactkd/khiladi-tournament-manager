// backend/utils/logger.js
import winston from "winston";
import "winston-daily-rotate-file";
import fs from "fs";
import path from "path";

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Common format
const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }), // Stack trace include karo
  winston.format.json()
);

// Environment-based format
const getFormat = () => {
  if (process.env.NODE_ENV === "production") {
    return baseFormat;
  }
  // Development mein pretty print + color
  return winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(
      ({ level, message, timestamp, stack }) =>
        `${timestamp} [${level}]: ${stack || message}`
    )
  );
};

// Daily Rotate Transport for combined logs
const dailyRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, "combined-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true, // Old logs zip kar do
  maxSize: "20m",      // Max 20MB per file
  maxFiles: "30d",     // 30 days tak rakho
  level: "info",
});

// Error-only transport
const errorTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "60d",
  level: "error",
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: getFormat(),
  transports: [
   new winston.transports.Console({
  format: getFormat(),
  silent: process.env.NODE_ENV === "production", // Prod mein console mat dikhao
}),
    errorTransport,
    dailyRotateTransport,
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, "exceptions.log") }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, "rejections.log") }),
  ],
});

// Middleware for request logging (safe — no sensitive headers)
export const logMiddleware = (req, res, next) => {
  const safeHeaders = { ...req.headers };
  // Mask sensitive headers
  if (safeHeaders.authorization) safeHeaders.authorization = "[MASKED]";
  if (safeHeaders.cookie) safeHeaders.cookie = "[MASKED]";
  if (safeHeaders["x-api-key"]) safeHeaders["x-api-key"] = "[MASKED]";

  logger.info("HTTP Request", {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get("User-Agent"),
    headers: safeHeaders,
    body: req.body ? { ...req.body, password: req.body.password ? "[MASKED]" : undefined } : undefined,
  });

  // Log response on finish
  res.on("finish", () => {
    logger.info("HTTP Response", {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: Date.now() - req.startTime,
    });
  });

  req.startTime = Date.now(); // For duration
  next();
};

export default logger;