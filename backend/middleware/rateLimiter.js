// backend/middleware/rateLimiter.js

import rateLimit from "express-rate-limit";

// Reusable rate limiter factory with smart key (user ID > IP)
const createRateLimiter = (options) =>
  rateLimit({
    ...options,
    standardHeaders: true,    // Return rate limit headers (RateLimit-*)
    legacyHeaders: false,     // Disable old X-RateLimit-* headers
    keyGenerator: (req) => {
      // Prioritize authenticated user ID (most accurate & fair)
      // Fallback to IP for unauthenticated users
      return req.user?._id?.toString() || req.ip;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: options.message || "Too many requests. Please try again later.",
      });
    },
  });

// 1. General Rate Limiter – For all normal API routes
export const generalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,                 // 300 requests per user/IP (generous but safe)
  message: "Too many requests from this user. Please try again after 15 minutes.",
});

// 2. Strict Limiter – For auth routes (login, register, password reset)
export const authRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 8,                   // Only 8 attempts (strong brute-force protection)
  message: "Too many login/register attempts. Please wait 10 minutes before trying again.",
});

// 3. Sensitive Actions Limiter – For create/update/delete tournament, entries, etc.
export const sensitiveRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15,                  // 15 sensitive actions per hour per user (prevents spam/abuse)
  message: "Too many actions performed. Please wait 1 hour before trying again.",
});