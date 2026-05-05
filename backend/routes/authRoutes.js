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
const REFRESH_COOKIE_MAX_AGE = 180 * 24 * 60 * 60 * 1000;

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
    const user = await User.findById(decoded.id);

    if (!user || !user.refreshTokens?.includes(refreshToken)) {
      return res.status(401).json({ message: "Invalid or revoked refresh token" });
    }

    const newAccessToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshToken);
    user.refreshTokens.push(newRefreshToken);
    await user.save({ validateBeforeSave: false });

    res.cookie("refreshToken", newRefreshToken, {
      ...cookieOptions,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });

    res.json({ accessToken: newAccessToken });
  } catch (error) {
    logger.error("Refresh token error:", error.message);
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