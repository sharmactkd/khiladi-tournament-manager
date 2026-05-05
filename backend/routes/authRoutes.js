// FILE: backend/routes/authRoutes.js

import express from "express";
import passport from "passport";
import { generateToken, generateRefreshToken } from "../utils/generateToken.js";
import {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  socialAuthSuccess,
  forgotPassword,
  resetPassword,
  completeProfile,
  buildSafeUserResponse,
  REFRESH_COOKIE_MAX_AGE,
  hashRefreshToken,
  normalizeRefreshTokenSessions,
  addRefreshTokenSession,
} from "../controllers/authController.js";
import {
  validateRegister,
  validateLogin,
} from "../middleware/validationMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";

const router = express.Router();

const isProd = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
};

router.post("/register", validateRegister, registerUser);

router.post("/login", validateLogin, loginUser);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password/:token", resetPassword);

router.get("/me", authMiddleware, getMe);

router.patch("/complete-profile", authMiddleware, completeProfile);

router.post("/logout", logoutUser);

router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const tokenHash = hashRefreshToken(refreshToken);

    const user = await User.findById(decoded.id).select("+refreshTokens");

    if (!user) {
      res.clearCookie("refreshToken", cookieOptions);
      return res.status(401).json({ message: "Invalid or revoked refresh token" });
    }

    const sessions = normalizeRefreshTokenSessions(user.refreshTokens);
    const matchedSession = sessions.find((session) => session.tokenHash === tokenHash);

    if (!matchedSession) {
      user.refreshTokens = sessions;
      await user.save({ validateBeforeSave: false });

      res.clearCookie("refreshToken", cookieOptions);
      return res.status(401).json({ message: "Invalid or revoked refresh token" });
    }

    if (user.isDeleted) {
      user.refreshTokens = [];
      await user.save({ validateBeforeSave: false });

      res.clearCookie("refreshToken", cookieOptions);
      return res.status(403).json({ message: "This account has been deleted" });
    }

    if (user.isSuspended) {
      user.refreshTokens = [];
      await user.save({ validateBeforeSave: false });

      res.clearCookie("refreshToken", cookieOptions);
      return res.status(403).json({ message: "This account has been suspended" });
    }

    const newAccessToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    user.refreshTokens = sessions.filter((session) => session.tokenHash !== tokenHash);
    addRefreshTokenSession({ user, rawRefreshToken: newRefreshToken, req });

    await user.save({ validateBeforeSave: false });

    res.cookie("refreshToken", newRefreshToken, {
      ...cookieOptions,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });

    res.json({
      accessToken: newAccessToken,
      user: buildSafeUserResponse(user),
    });
  } catch (error) {
    logger.error("Refresh token error:", error.message);

    res.clearCookie("refreshToken", cookieOptions);
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`,
    session: false,
  }),
  socialAuthSuccess
);

export { cookieOptions, REFRESH_COOKIE_MAX_AGE };
export default router;