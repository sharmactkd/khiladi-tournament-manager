// backend/controllers/authController.js

import User from "../models/user.js";
import bcrypt from "bcryptjs";
import { generateToken, generateRefreshToken } from "../utils/generateToken.js";
import logger from "../utils/logger.js";

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
      role: user.role || "user",
      createdAt: user.createdAt,
    });
  } catch (error) {
    logger.error("getMe failed", { error: error.message, stack: error.stack });
    res.status(500).json({ message: "Server error while fetching user details" });
  }
};

/**
 * Register new user (email + password)
 */
export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      logger.warn("Register attempt with missing fields", { ip: req.ip });
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email }).lean();
    if (userExists) {
      logger.warn("Register attempt with existing email", { email, ip: req.ip });
      return res.status(400).json({ message: "User already exists with this email" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      isVerified: false,
      loginProvider: "email",
      refreshTokens: [],
    });

    // Generate long-lived tokens
    const accessToken = generateToken(user);        // expiresIn: '7d' (set in generateToken.js)
    const refreshToken = generateRefreshToken(user); // expiresIn: '30d'

    // Store refresh token in DB
    user.refreshTokens.push(refreshToken);
    await user.save({ validateBeforeSave: false });

    // Long-lived secure refresh token cookie (30 days)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    logger.info("User registered successfully", { userId: user._id, email });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      accessToken,
    });
  } catch (error) {
    logger.error("Register failed", { error: error.message, stack: error.stack });
    res.status(500).json({ message: "Server error during registration" });
  }
};

/**
 * Login user (email + password)
 */
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      logger.warn("Login attempt with missing credentials", { ip: req.ip });
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email }).select("+password +refreshTokens");
    if (!user || !user.password) {
      logger.warn("Login attempt with invalid email", { email, ip: req.ip });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn("Login attempt with wrong password", { email, ip: req.ip });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate long-lived tokens
    const accessToken = generateToken(user);        // 7 days
    const refreshToken = generateRefreshToken(user); // 30 days

    // Store refresh token in DB
    user.refreshTokens.push(refreshToken);
    await user.save({ validateBeforeSave: false });

    // Long-lived secure cookie (30 days)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    logger.info("User logged in successfully", { userId: user._id, email });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      accessToken,
    });
  } catch (error) {
    logger.error("Login failed", { error: error.message, stack: error.stack });
    res.status(500).json({ message: "Server error during login" });
  }
};

/**
 * Logout user - ONLY manual logout works now
 */
export const logoutUser = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken && req.user) {
      // Remove this refresh token from user's array
      req.user.refreshTokens = req.user.refreshTokens.filter(t => t !== refreshToken);
      await req.user.save({ validateBeforeSave: false });
    }

    // Clear cookies
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    res.clearCookie("accessToken", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
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
 * Social auth success (Google, etc.)
 */
export const socialAuthSuccess = (req, res) => {
  try {
    if (!req.user) {
      logger.warn("Social auth failed - no user", { path: req.path, ip: req.ip });
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=auth_failed`);
    }

    const accessToken = generateToken(req.user);        // 7 days
    const refreshToken = generateRefreshToken(req.user); // 30 days

    // Store refresh token in DB
    req.user.refreshTokens.push(refreshToken);
    req.user.save({ validateBeforeSave: false }).catch(err =>
      logger.error("Refresh token save failed", { error: err.message })
    );

    // Long-lived refresh token cookie (30 days)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Optional: short-lived access token cookie (frontend can read)
    res.cookie("accessToken", accessToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    logger.info("Social auth successful", { userId: req.user._id, provider: req.user.loginProvider });

    res.redirect(process.env.FRONTEND_URL || "http://localhost:5173");
  } catch (error) {
    logger.error("Social auth success failed", { error: error.message, stack: error.stack });
    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=server_error`);
  }
};