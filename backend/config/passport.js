// backend/config/passport.js

import dotenv from "dotenv";
dotenv.config();

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/user.js";
import logger from "../utils/logger.js";

const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
}

const normalizeRole = (role) => {
  return ["organizer", "coach", "player", "admin", "superadmin"].includes(role)
    ? role
    : "player";
};

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${backendUrl}/api/auth/google/callback`,
      scope: ["profile", "email"],
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value?.toLowerCase();

        const isEmailVerified =
  profile.emails?.[0]?.verified === true ||
  profile._json?.email_verified === true;

if (!email || !isEmailVerified) {
 logger.warn("Google auth rejected - unverified email", {
  googleId: profile.id,
  email,
});

  return done(null, false, {
    message: "Google account email is not verified",
  });
}

        const name = profile.displayName || "Google User";
        const profilePicture = profile.photos?.[0]?.value || null;

      

        let user = await User.findOne({
          $or: [{ email }, { googleId }],
        }).select("+refreshTokens");

        if (user && user.googleId && user.googleId !== googleId) {
  logger.warn("Google account mismatch detected", {
    userId: user._id,
    existingGoogleId: user.googleId,
    incomingGoogleId: googleId,
    email,
  });

  return done(null, false, {
    message: "Google account mismatch",
  });
}

        if (!user) {
          user = new User({
            name,
            email,
            googleId,
            isVerified: true,
            isProfileComplete: false,
            profilePicture,
            loginProvider: "google",
            role: "player",
            refreshTokens: [],
          });

          await user.save({ validateBeforeSave: false });
        } else {
          if (user.isDeleted) {
            return done(new Error("This account has been deleted"));
          }

          if (user.isSuspended) {
            return done(new Error("This account has been suspended"));
          }

          user.googleId = user.googleId || googleId;
          user.isVerified = true;
          user.loginProvider = user.loginProvider || "google";
          user.role = normalizeRole(user.role);
          user.lastLogin = new Date();

          if (user.loginProvider === "google" && user.isProfileComplete === undefined) {
            user.isProfileComplete = false;
          }

          if (!user.profilePicture && profilePicture) {
            user.profilePicture = profilePicture;
          }

          await user.save({ validateBeforeSave: false });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

export default passport;