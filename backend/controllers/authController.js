import User from "../models/user.js";
import bcrypt from "bcryptjs";
import { generateToken, generateRefreshToken } from "../utils/generateToken.js";
import logger from "../utils/logger.js";

const normalizeRole = (role) => {
  return ["organizer", "coach", "player"].includes(role) ? role : "player";
};

const isProd = process.env.NODE_ENV === "production";
const REFRESH_COOKIE_MAX_AGE = 180 * 24 * 60 * 60 * 1000; // 180 days
const ACCESS_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: REFRESH_COOKIE_MAX_AGE,
};

const accessCookieOptions = {
  httpOnly: false,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: ACCESS_COOKIE_MAX_AGE,
};

/**
 * Get current logged-in user details (Protected route)
 */
export const getMe = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      logger.warn("getMe called without user", { path: req.path, ip: req.ip });
      return res.status(404).json({ message: "User not found" });
    }

    logger.info("getMe successful", { userId: user._id, email: user.email });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      profilePicture: user.profilePicture || null,
      loginProvider: user.loginProvider || "email",
      role: normalizeRole(user.role),
      createdAt: user.createdAt,
    });
  } catch (error) {
    logger.error("getMe failed", { error: error.message, stack: error.stack });
    res.status(500).json({ message: "Server error while fetching user details" });
  }
};

/**
 * Register new user (email + password + role)
 */
export const registerUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      logger.warn("Register attempt with missing fields", { ip: req.ip });
      return res.status(400).json({
        message: "Name, email, password and role are required",
      });
    }

    if (!["organizer", "coach", "player"].includes(role)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const userExists = await User.findOne({ email: normalizedEmail }).lean();
    if (userExists) {
      logger.warn("Register attempt with existing email", {
        email: normalizedEmail,
        ip: req.ip,
      });
      return res.status(400).json({
        message: "User already exists with this email",
      });
    }

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password,
      role,
      isVerified: false,
      loginProvider: "email",
      refreshTokens: [],
    });

    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshTokens.push(refreshToken);
    await user.save({ validateBeforeSave: false });

    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    logger.info("User registered successfully", {
      userId: user._id,
      email: normalizedEmail,
      role,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
      accessToken,
    });
  } catch (error) {
    logger.error("Register failed", { error: error.message, stack: error.stack });
    res.status(500).json({ message: "Server error during registration" });
  }
};

const looksLikeEmail = (value) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizePhone = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, "");
};

const looksLikePhone = (value) =>
  typeof value === "string" && /^\d{10,15}$/.test(normalizePhone(value));

/**
 * Login user (email OR phone + password)
 */
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      logger.warn("Login attempt with missing credentials", { ip: req.ip });
      return res.status(400).json({ message: "Email and password are required" });
    }

    const identifierRaw = String(email).trim();
    const identifier = normalizePhone(identifierRaw);

    let query = null;

    if (looksLikeEmail(identifierRaw)) {
      query = { email: identifierRaw.toLowerCase() };
    } else if (looksLikePhone(identifier)) {
      query = { phone: identifier };
    } else {
      logger.warn("Login attempt with invalid identifier format", {
        identifier: identifierRaw,
        ip: req.ip,
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = await User.findOne(query).select("+password +refreshTokens");
    if (!user || !user.password) {
      logger.warn("Login attempt with invalid identifier", { query, ip: req.ip });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn("Login attempt with wrong password", { query, ip: req.ip });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    user.lastLogin = new Date();

    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshTokens.push(refreshToken);
    await user.save({ validateBeforeSave: false });

    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    logger.info("User logged in successfully", {
      userId: user._id,
      identifier: looksLikeEmail(identifierRaw) ? user.email : user.phone,
      method: looksLikeEmail(identifierRaw) ? "email" : "phone",
      role: normalizeRole(user.role),
    });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email || null,
      phone: user.phone || null,
      role: normalizeRole(user.role),
      accessToken,
    });
  } catch (error) {
    logger.error("Login failed", { error: error.message, stack: error.stack });
    res.status(500).json({ message: "Server error during login" });
  }
};

/**
 * Logout user
 */
export const logoutUser = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken && req.user) {
      req.user.refreshTokens = req.user.refreshTokens.filter((t) => t !== refreshToken);
      await req.user.save({ validateBeforeSave: false });
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/",
    });

    res.clearCookie("accessToken", {
      httpOnly: false,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/",
    });

    logger.info("User logged out successfully", { userId: req.user?._id });

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    logger.error("Logout failed", { error: error.message, stack: error.stack });
    res.status(500).json({ message: "Logout failed" });
  }
};

/**
 * Social auth success
 */
export const socialAuthSuccess = (req, res) => {
  try {
    if (!req.user) {
      logger.warn("Social auth failed - no user", { path: req.path, ip: req.ip });
      return res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=auth_failed`
      );
    }

    const accessToken = generateToken(req.user);
    const refreshToken = generateRefreshToken(req.user);

    req.user.refreshTokens.push(refreshToken);
    req.user.save({ validateBeforeSave: false }).catch((err) =>
      logger.error("Refresh token save failed", { error: err.message })
    );

    res.cookie("refreshToken", refreshToken, refreshCookieOptions);
    res.cookie("accessToken", accessToken, accessCookieOptions);

    logger.info("Social auth successful", {
      userId: req.user._id,
      provider: req.user.loginProvider,
      role: normalizeRole(req.user.role),
    });

    res.redirect(process.env.FRONTEND_URL || "http://localhost:5173");
  } catch (error) {
    logger.error("Social auth success failed", {
      error: error.message,
      stack: error.stack,
    });
    res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=server_error`
    );
  }
};