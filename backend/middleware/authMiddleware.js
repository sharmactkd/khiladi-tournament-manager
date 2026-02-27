// backend/middleware/authMiddleware.js

import jwt from "jsonwebtoken";
import User from "../models/user.js";
import logger from "../utils/logger.js";

const authMiddleware = async (req, res, next) => {
  let token;

  // 1. Bearer token from Authorization header (most common for API requests)
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  // 2. Fallback to refreshToken cookie (only for the refresh endpoint)
  else if (req.cookies.refreshToken && req.path === "/auth/refresh") {
    token = req.cookies.refreshToken;
  }

  // No token → early exit
  if (!token) {
    return res.status(401).json({ message: "Authentication required - no token provided" });
  }

  try {
    let decoded;
    const isRefreshRoute = req.path === "/auth/refresh";

    // Choose the correct secret
    if (isRefreshRoute) {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } else {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    }

    // Find user – exclude password
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      logger.warn("User not found for valid token", {
        userId: decoded.id,
        path: req.path,
      });
      return res.status(401).json({ message: "User not found" });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    // Improved error logging
    logger.error("Authentication failed", {
      error: error.message,
      name: error.name,
      path: req.path,
      ip: req.ip,
      token: token.substring(0, 20) + "...", // partial token for debugging
      stack: error.stack,
    });

    // Specific error responses
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token has expired", code: "TOKEN_EXPIRED" });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token", code: "INVALID_TOKEN" });
    }

    // Fallback for other JWT errors
    return res.status(401).json({ message: "Authentication failed" });
  }
};

export default authMiddleware;