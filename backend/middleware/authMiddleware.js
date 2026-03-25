import jwt from "jsonwebtoken";
import User from "../models/user.js";
import logger from "../utils/logger.js";

const normalizeRole = (role) => {
  return ["organizer", "coach", "player"].includes(role) ? role : "player";
};

const authMiddleware = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies.refreshToken && req.path === "/auth/refresh") {
    token = req.cookies.refreshToken;
  }

  if (!token) {
    return res
      .status(401)
      .json({ message: "Authentication required - no token provided" });
  }

  try {
    let decoded;
    const isRefreshRoute = req.path === "/auth/refresh";

    if (isRefreshRoute) {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } else {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      logger.warn("User not found for valid token", {
        userId: decoded.id,
        path: req.path,
      });
      return res.status(401).json({ message: "User not found" });
    }

    // Keep normalized role available everywhere
    req.user = user;
    req.user.role = normalizeRole(user.role);

    next();
  } catch (error) {
    logger.error("Authentication failed", {
      error: error.message,
      name: error.name,
      path: req.path,
      ip: req.ip,
      token: token ? `${token.substring(0, 20)}...` : "none",
      stack: error.stack,
    });

    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ message: "Token has expired", code: "TOKEN_EXPIRED" });
    }

    if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json({ message: "Invalid token", code: "INVALID_TOKEN" });
    }

    return res.status(401).json({ message: "Authentication failed" });
  }
};

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    const role = req.user?.role;

    if (!role) {
      return res.status(403).json({ message: "User role not available" });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
};

export default authMiddleware;