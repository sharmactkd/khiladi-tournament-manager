// backend/routes/authRoutes.js
import express from "express";
import passport from "passport";
import { generateToken, generateRefreshToken } from "../utils/generateToken.js";
import {
  registerUser,
  loginUser,
  getMe,
  logoutUser, // Naya add kar rahe hain
  socialAuthSuccess, // Ek central handler
} from "../controllers/authController.js";
import { validateRegister } from "../middleware/validationMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";

const router = express.Router();

// Common cookie options
const cookieOptions = {
  httpOnly: true,
  secure: true, // Hamesha true rakh (production mein HTTPS hoga hi)
  sameSite: "strict",
  path: "/",
};

// Routes
router.post("/register", validateRegister, registerUser);
router.post("/login", loginUser);
router.get("/me", authMiddleware, getMe);
router.post("/logout", logoutUser); // Naya logout route

// Refresh Token Route - Secure with DB check
router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    // Verify token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.refreshTokens?.includes(refreshToken)) {
      return res.status(401).json({ message: "Invalid or revoked refresh token" });
    }

    // Generate new tokens
    const newAccessToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Update DB: remove old, add new
    user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshToken);
    user.refreshTokens.push(newRefreshToken);
    await user.save({ validateBeforeSave: false });

    // Set new cookie
    res.cookie("refreshToken", newRefreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ accessToken: newAccessToken });
  } catch (error) {
    logger.error("Refresh token error:", error.message);
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

// Google OAuth
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
  socialAuthSuccess // Central handler
);

export default router;