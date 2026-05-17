// FILE: backend/routes/authRoutes.js

import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";

import { generateToken, generateRefreshToken } from "../utils/generateToken.js";
import {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  logoutAllUser,
  socialAuthSuccess,
  forgotPassword,
  resetPassword,
  completeProfile,
  buildSafeUserResponse,
  REFRESH_COOKIE_MAX_AGE,
  hashRefreshToken,
  normalizeRefreshTokenSessions,
  addRefreshTokenSession,
  clearAuthCookiesEverywhere,
} from "../controllers/authController.js";

import {
  validateRegister,
  validateLogin,
} from "../middleware/validationMiddleware.js";

import {
  generateOAuthState,
  verifyOAuthState,
} from "../middleware/oauthState.js";

import authMiddleware from "../middleware/authMiddleware.js";
import User from "../models/user.js";
import {
  requireCsrfToken,
  requireRefreshCsrfToken,
  setCsrfCookie,
} from "../middleware/csrfProtection.js";
import logger from "../utils/logger.js";

const router = express.Router();

const isProd = process.env.NODE_ENV === "production";

const getCookieDomain = () => {
  const domain = String(process.env.COOKIE_DOMAIN || "").trim();
  return isProd && domain ? domain : undefined;
};

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax",
  path: "/",
  ...(getCookieDomain() ? { domain: getCookieDomain() } : {}),
};

const setRefreshAuthCookies = (res, { userId, refreshToken }) => {
  clearAuthCookiesEverywhere(res);

  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });

  setCsrfCookie(res, {
    userId,
    rawRefreshToken: refreshToken,
  });
};

router.post("/register", validateRegister, registerUser);

router.post("/login", validateLogin, loginUser);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password/:token", resetPassword);

router.get("/me", authMiddleware, getMe);

router.patch("/complete-profile", authMiddleware, completeProfile);

router.post("/logout", authMiddleware, requireCsrfToken, logoutUser);

router.post("/logout-all", authMiddleware, requireCsrfToken, logoutAllUser);

router.post("/refresh", requireRefreshCsrfToken, async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      clearAuthCookiesEverywhere(res);
      return res.status(401).json({ message: "Refresh token missing" });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, {
      issuer: "khiladi-khoj.com",
      audience: "khiladi-khoj-users",
    });

    const tokenHash = hashRefreshToken(refreshToken);

    const user = await User.findById(decoded.id).select("+refreshTokens");

    if (!user) {
      clearAuthCookiesEverywhere(res);
      return res.status(401).json({ message: "Invalid or revoked refresh token" });
    }

    const sessions = normalizeRefreshTokenSessions(user.refreshTokens);
    const matchedSession = sessions.find(
      (session) => session.tokenHash === tokenHash
    );

    if (!matchedSession) {
      user.refreshTokens = [];
      await user.save({ validateBeforeSave: false });

      clearAuthCookiesEverywhere(res);

      logger.warn("REFRESH_REUSE_DETECTED", {
        userId: user._id,
        ip: req.ip,
        userAgent: req.headers?.["user-agent"] || "",
      });

      return res.status(401).json({
        message: "Session security issue detected. Please login again.",
        code: "REFRESH_REUSE_DETECTED",
      });
    }

    if (user.isDeleted) {
      user.refreshTokens = [];
      await user.save({ validateBeforeSave: false });

      clearAuthCookiesEverywhere(res);

      return res.status(403).json({ message: "This account has been deleted" });
    }

    if (user.isSuspended) {
      user.refreshTokens = [];
      await user.save({ validateBeforeSave: false });

      clearAuthCookiesEverywhere(res);

      return res.status(403).json({ message: "This account has been suspended" });
    }

    const newAccessToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    user.refreshTokens = sessions.filter(
      (session) => session.tokenHash !== tokenHash
    );

    addRefreshTokenSession({
      user,
      rawRefreshToken: newRefreshToken,
      req,
    });

    await user.save({ validateBeforeSave: false });

    setRefreshAuthCookies(res, {
      userId: user._id,
      refreshToken: newRefreshToken,
    });

    return res.json({
      accessToken: newAccessToken,
      user: buildSafeUserResponse(user),
    });
  } catch (error) {
    logger.error("Refresh token error:", error.message);

    clearAuthCookiesEverywhere(res);

    return res.status(401).json({ message: "Invalid refresh token" });
  }
});

router.get(
  "/google",
  generateOAuthState,
  (req, res, next) =>
    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: false,
      state: req.oauthState,
    })(req, res, next)
);

router.get(
  "/google/callback",
  verifyOAuthState,
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`,
    session: false,
  }),
  socialAuthSuccess
);

export { cookieOptions, REFRESH_COOKIE_MAX_AGE };
export default router;