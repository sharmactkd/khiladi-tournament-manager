// backend/middleware/errorMiddleware.js

import logger from "../utils/logger.js"; // Central logger

const errorMiddleware = (err, req, res, next) => {
  // Log error with full details (file mein save hoga, console par nahi dikhega)
  logger.error("Global error caught", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?._id || "unauthenticated",
  });

  // Default status aur message
  let statusCode = err.status || err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Specific known errors ko handle karo (user-friendly messages)
  if (err.name === "ValidationError") {
    statusCode = 400;
    const errors = Object.values(err.errors).map((e) => e.message);
    message = "Validation failed: " + errors.join(", ");
  }

  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid ID format";
  }

  if (err.code === 11000) { // MongoDB duplicate key
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
  }

  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired";
  }

  // Production mein detailed error mat bhejo
  const response = {
    message,
  };

  // Development mein extra details dikhao (helpful for debugging)
  if (process.env.NODE_ENV === "development") {
    response.error = err.name;
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

export default errorMiddleware;