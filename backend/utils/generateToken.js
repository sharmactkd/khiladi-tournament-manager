// FILE: backend/utils/generateToken.js

import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error("JWT_SECRET and JWT_REFRESH_SECRET must be defined in .env file");
}

const commonOptions = {
  issuer: "khiladi-khoj.com",
  audience: "khiladi-khoj-users",
};

const normalizeRole = (role) => {
  return ["organizer", "coach", "player", "admin", "superadmin"].includes(role)
    ? role
    : "player";
};

export const generateToken = (user) => {
  if (!user?._id) {
    throw new Error("User ID is required for token generation");
  }

  return jwt.sign(
    {
      id: user._id,
      email: user.email || null,
      phone: user.phone || null,
      role: normalizeRole(user.role),
    },
    JWT_SECRET,
    {
     expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "30m",
      ...commonOptions,
    }
  );
};

export const generateRefreshToken = (user) => {
  if (!user?._id) {
    throw new Error("User ID is required for refresh token generation");
  }

  return jwt.sign(
    {
      id: user._id,
      role: normalizeRole(user.role),
    },
    JWT_REFRESH_SECRET,
    {
      expiresIn: "30d",
      ...commonOptions,
    }
  );
};

export const verifyToken = (token, secret) => {
  try {
    return jwt.verify(token, secret, commonOptions);
  } catch (error) {
    return null;
  }
};