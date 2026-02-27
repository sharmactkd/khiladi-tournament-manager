// backend/utils/generateToken.js
import dotenv from 'dotenv';
dotenv.config({ path: 'D:/Khiladi/backend/.env' }); // Add this at the top
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error("JWT_SECRET and JWT_REFRESH_SECRET must be defined in .env file");
}

// Common options for better security
const commonOptions = {
  issuer: "khiladi-khoj.com",
  audience: "khiladi-khoj-users",
};

/**
 * Generate Access Token (short-lived: 15 minutes)
 */
export const generateToken = (user) => {
  if (!user?._id) {
    throw new Error("User ID is required for token generation");
  }

  return jwt.sign(
    {
      id: user._id,
      email: user.email || null,
      phone: user.phone || null,
      role: user.role || "user",
    },
    JWT_SECRET,
    {
      expiresIn: "15m", // Recommended: short-lived access token
      ...commonOptions,
    }
  );
};

/**
 * Generate Refresh Token (long-lived: 7 days)
 */
export const generateRefreshToken = (user) => {
  if (!user?._id) {
    throw new Error("User ID is required for refresh token generation");
  }

  return jwt.sign(
    {
      id: user._id,
      role: user.role || "user",
      // Email/phone nahi daalte refresh token mein (minimal data best)
    },
    JWT_REFRESH_SECRET,
    {
      expiresIn: "7d",
      ...commonOptions,
    }
  );
};

/**
 * Optional: Verify token helper (future mein authMiddleware mein use kar sakte ho)
 */
export const verifyToken = (token, secret) => {
  try {
    return jwt.verify(token, secret, commonOptions);
  } catch (error) {
    return null;
  }
};