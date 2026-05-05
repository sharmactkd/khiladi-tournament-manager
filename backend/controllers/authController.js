// FILE: backend/controllers/authController.js

import crypto from "crypto";
import User from "../models/user.js";
import bcrypt from "bcryptjs";
import { generateToken, generateRefreshToken } from "../utils/generateToken.js";
import logger from "../utils/logger.js";
import sendEmail from "../utils/emailSender.js";
import {
  getPasswordResetEmailHtml,
  getPasswordResetEmailText,
} from "../utils/passwordResetEmail.js";

const normalizeRole = (role) => {
  const allowedRoles = ["organizer", "coach", "player", "admin", "superadmin"];
  return allowedRoles.includes(role) ? role : "player";
};

const isStrongPassword = (password) => {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(
    String(password || "")
  );
};

const isProd = process.env.NODE_ENV === "production";
export const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_EXPIRE_MINUTES = 15;
const MAX_ACTIVE_REFRESH_SESSIONS = 5;

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: REFRESH_COOKIE_MAX_AGE,
};

const getFrontendUrl = () => {
  return String(process.env.FRONTEND_URL || "http://localhost:5173").replace(
    /\/+$/,
    ""
  );
};

const hashResetToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const hashRefreshToken = (token) => {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
};

const getRequestIp = (req) => {
  const forwardedFor = req.headers?.["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "";
};

export const normalizeRefreshTokenSessions = (sessions = []) => {
  const now = Date.now();

  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => {
      if (!session || typeof session !== "object" || Array.isArray(session)) return false;
      if (!session.tokenHash || typeof session.tokenHash !== "string") return false;

      const expiresAt = session.expiresAt ? new Date(session.expiresAt).getTime() : 0;
      return expiresAt > now;
    })
    .map((session) => ({
      tokenHash: String(session.tokenHash),
      createdAt: session.createdAt ? new Date(session.createdAt) : new Date(),
      expiresAt: session.expiresAt
        ? new Date(session.expiresAt)
        : new Date(Date.now() + REFRESH_COOKIE_MAX_AGE),
      userAgent: String(session.userAgent || ""),
      ip: String(session.ip || ""),
      lastUsedAt: session.lastUsedAt ? new Date(session.lastUsedAt) : null,
    }));
};

export const addRefreshTokenSession = ({ user, rawRefreshToken, req }) => {
  const now = new Date();

  const sessions = normalizeRefreshTokenSessions(user.refreshTokens);

  sessions.push({
    tokenHash: hashRefreshToken(rawRefreshToken),
    createdAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_COOKIE_MAX_AGE),
    userAgent: String(req?.headers?.["user-agent"] || ""),
    ip: getRequestIp(req || {}),
    lastUsedAt: now,
  });

  user.refreshTokens = sessions
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, MAX_ACTIVE_REFRESH_SESSIONS);
};

export const removeRefreshTokenSession = ({ user, rawRefreshToken }) => {
  const tokenHash = hashRefreshToken(rawRefreshToken);

  user.refreshTokens = normalizeRefreshTokenSessions(user.refreshTokens).filter(
    (session) => session.tokenHash !== tokenHash
  );
};

const isProfileCompleteForResponse = (user) => {
  if (!user) return false;

  if (user.isProfileComplete === true) return true;

  if (user.loginProvider === "email") return true;

  if (["admin", "superadmin"].includes(user.role)) return true;

  return false;
};

export const buildSafeUserResponse = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email || null,
  phone: user.phone || null,
  profilePicture: user.profilePicture || null,
  loginProvider: user.loginProvider || "email",
  role: normalizeRole(user.role),
  isProfileComplete: isProfileCompleteForResponse(user),
  isSuspended: Boolean(user.isSuspended),
  isDeleted: Boolean(user.isDeleted),
  createdAt: user.createdAt,
});

const rejectInactiveUser = (user, res) => {
  if (!user) return false;

  if (user.isDeleted) {
    return res.status(403).json({
      message: "This account has been deleted",
    });
  }

  if (user.isSuspended) {
    return res.status(403).json({
      message: "This account has been suspended",
    });
  }

  return false;
};

export const getMe = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      logger.warn("getMe called without user", { path: req.path, ip: req.ip });
      return res.status(404).json({ message: "User not found" });
    }

    if (rejectInactiveUser(user, res)) return;

    logger.info("getMe successful", { userId: user._id, email: user.email });

    res.json(buildSafeUserResponse(user));
  } catch (error) {
    logger.error("getMe failed", { error: error.message, stack: error.stack });
    res.status(500).json({ message: "Server error while fetching user details" });
  }
};

export const registerUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      logger.warn("Register attempt with missing fields", { ip: req.ip });
      return res.status(400).json({
        message: "Name, email, password and role are required",
      });
    }

    if (!isStrongPassword(password)) {
      logger.warn("Register attempt with weak password", { email, ip: req.ip });
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character",
      });
    }

    if (!["organizer", "coach", "player"].includes(role)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const userExists = await User.findOne({
      email: normalizedEmail,
      isDeleted: { $ne: true },
    }).lean();

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
      isProfileComplete: true,
      isSuspended: false,
      isDeleted: false,
      loginProvider: "email",
      refreshTokens: [],
    });

    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    addRefreshTokenSession({ user, rawRefreshToken: refreshToken, req });
    await user.save({ validateBeforeSave: false });

    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    logger.info("User registered successfully", {
      userId: user._id,
      email: normalizedEmail,
      role,
    });

    res.status(201).json({
      ...buildSafeUserResponse(user),
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

    if (user.isDeleted) {
      logger.warn("Deleted user login attempt", {
        userId: user._id,
        query,
        ip: req.ip,
      });
      return res.status(403).json({ message: "This account has been deleted" });
    }

    if (user.isSuspended) {
      logger.warn("Suspended user login attempt", {
        userId: user._id,
        query,
        ip: req.ip,
      });
      return res.status(403).json({ message: "This account has been suspended" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn("Login attempt with wrong password", { query, ip: req.ip });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    user.lastLogin = new Date();

    if (user.isProfileComplete !== true) {
      user.isProfileComplete = true;
    }

    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    addRefreshTokenSession({ user, rawRefreshToken: refreshToken, req });
    await user.save({ validateBeforeSave: false });

    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    logger.info("User logged in successfully", {
      userId: user._id,
      identifier: looksLikeEmail(identifierRaw) ? user.email : user.phone,
      method: looksLikeEmail(identifierRaw) ? "email" : "phone",
      role: normalizeRole(user.role),
    });

    res.json({
      ...buildSafeUserResponse(user),
      accessToken,
    });
  } catch (error) {
    logger.error("Login failed", { error: error.message, stack: error.stack });
    res.status(500).json({ message: "Server error during login" });
  }
};

export const completeProfile = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (rejectInactiveUser(user, res)) return;

    const { role, name, phone } = req.body || {};
    const allowedProfileRoles = ["organizer", "coach", "player"];

    if (!role || !allowedProfileRoles.includes(role)) {
      return res.status(400).json({
        message: "Please select a valid role",
      });
    }

    if (["admin", "superadmin"].includes(role)) {
      return res.status(403).json({
        message: "You are not allowed to assign this role",
      });
    }

    const trimmedName = String(name || "").trim();
    const normalizedPhone = normalizePhone(String(phone || "").trim());

    if (trimmedName) {
      if (trimmedName.length > 50) {
        return res.status(400).json({
          message: "Name cannot exceed 50 characters",
        });
      }

      user.name = trimmedName;
    }

    if (normalizedPhone) {
      if (!/^\+?\d{10,15}$/.test(normalizedPhone)) {
        return res.status(400).json({
          message: "Invalid phone number (10-15 digits, optional + prefix)",
        });
      }

      const phoneOwner = await User.findOne({
        phone: normalizedPhone,
        _id: { $ne: user._id },
        isDeleted: { $ne: true },
      }).lean();

      if (phoneOwner) {
        return res.status(400).json({
          message: "This phone number is already linked with another account",
        });
      }

      user.phone = normalizedPhone;
    }

    user.role = role;
    user.isProfileComplete = true;

    await user.save({ validateBeforeSave: false });

    logger.info("Profile completed successfully", {
      userId: user._id,
      email: user.email,
      role: user.role,
      loginProvider: user.loginProvider,
    });

    return res.status(200).json(buildSafeUserResponse(user));
  } catch (error) {
    logger.error("Complete profile failed", {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });

    return res.status(500).json({
      message: "Server error while completing profile",
    });
  }
};

export const forgotPassword = async (req, res) => {
  const genericMessage =
    "If an account exists with this email, a password reset link has been sent.";

  try {
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!email || !looksLikeEmail(email)) {
      return res.status(200).json({ message: genericMessage });
    }

    const user = await User.findOne({
      email,
      isDeleted: { $ne: true },
    }).select("+resetPasswordToken +resetPasswordExpire");

    if (!user || user.loginProvider !== "email" || !user.email || user.isSuspended) {
      logger.info("Forgot password requested for non-existing, suspended or non-email account", {
        email,
        ip: req.ip,
      });
      return res.status(200).json({ message: genericMessage });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = hashResetToken(rawToken);

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = new Date(
      Date.now() + PASSWORD_RESET_EXPIRE_MINUTES * 60 * 1000
    );

    await user.save({ validateBeforeSave: false });

    const resetUrl = `${getFrontendUrl()}/reset-password/${rawToken}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Reset your KHILADI password",
        html: getPasswordResetEmailHtml({
          name: user.name,
          resetUrl,
          expiresInMinutes: PASSWORD_RESET_EXPIRE_MINUTES,
        }),
        text: getPasswordResetEmailText({
          name: user.name,
          resetUrl,
          expiresInMinutes: PASSWORD_RESET_EXPIRE_MINUTES,
        }),
      });

      logger.info("Password reset email sent", {
        userId: user._id,
        email: user.email,
      });
    } catch (emailError) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      logger.error("Password reset email failed", {
        userId: user._id,
        email: user.email,
        error: emailError.message,
      });
    }

    return res.status(200).json({ message: genericMessage });
  } catch (error) {
    logger.error("Forgot password failed", {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
    });

    return res.status(200).json({ message: genericMessage });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const token = String(req.params?.token || "").trim();
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    if (!password) {
      return res.status(400).json({ message: "New password is required" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character",
      });
    }

    const hashedToken = hashResetToken(token);

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: new Date() },
      isDeleted: { $ne: true },
    }).select("+password +refreshTokens +resetPasswordToken +resetPasswordExpire");

    if (!user || user.isSuspended) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.refreshTokens = [];

    if (user.loginProvider === "email") {
      user.isProfileComplete = true;
    }

    await user.save();

    logger.info("Password reset successful", {
      userId: user._id,
      email: user.email,
    });

    return res.status(200).json({
      message: "Password reset successful. Please login with your new password.",
    });
  } catch (error) {
    logger.error("Reset password failed", {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
    });

    return res.status(500).json({ message: "Server error while resetting password" });
  }
};

export const logoutUser = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      const user = req.user
        ? await User.findById(req.user._id).select("+refreshTokens")
        : await User.findOne({ "refreshTokens.tokenHash": tokenHash }).select("+refreshTokens");

      if (user) {
        removeRefreshTokenSession({ user, rawRefreshToken: refreshToken });
        await user.save({ validateBeforeSave: false });
      }
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/",
    });

    res.clearCookie("accessToken", {
      httpOnly: true,
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

export const socialAuthSuccess = (req, res) => {
  try {
    if (!req.user) {
      logger.warn("Social auth failed - no user", { path: req.path, ip: req.ip });
      return res.redirect(`${getFrontendUrl()}/login?error=auth_failed`);
    }

    if (req.user.isDeleted || req.user.isSuspended) {
      logger.warn("Inactive social auth user blocked", {
        userId: req.user._id,
        email: req.user.email,
        isDeleted: Boolean(req.user.isDeleted),
        isSuspended: Boolean(req.user.isSuspended),
      });

      return res.redirect(`${getFrontendUrl()}/login?error=account_blocked`);
    }

    const refreshToken = generateRefreshToken(req.user);

    addRefreshTokenSession({ user: req.user, rawRefreshToken: refreshToken, req });

    req.user.save({ validateBeforeSave: false }).catch((err) =>
      logger.error("Refresh token session save failed", { error: err.message })
    );

    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    logger.info("Social auth successful", {
      userId: req.user._id,
      provider: req.user.loginProvider,
      role: normalizeRole(req.user.role),
      isProfileComplete: isProfileCompleteForResponse(req.user),
    });

    return res.redirect(`${getFrontendUrl()}/social-login`);
  } catch (error) {
    logger.error("Social auth success failed", {
      error: error.message,
      stack: error.stack,
    });

    return res.redirect(`${getFrontendUrl()}/login?error=server_error`);
  }
};