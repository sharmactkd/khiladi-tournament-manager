// backend/config/passport.js   ← sirf ye 4 line change + 1 line add kar dena

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/user.js";

const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";

// ←←← Ye 1 line add kar do (production mein bahut bada fayda)
const isProduction = process.env.NODE_ENV === "production";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${backendUrl}/api/auth/google/callback`,
      scope: ["profile", "email"],
      // ←←← Ye 1 line change kar do
      proxy: true,                        // ← ab hamesha true, niche wali line delete kar dena
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("Google ne email nahi diya"));

        let user = await User.findOne({ $or: [{ email }, { googleId: profile.id }] });

        if (!user) {
          user = new User({
            name: profile.displayName,
            email,
            googleId: profile.id,
            isVerified: true,
            // ←←← Ye 2 line add kar do (bohot log maangte hain)
            profilePicture: profile.photos?.[0]?.value || null,
            loginProvider: "google", // future mein analytics ke liye kaam aayega
          });
          await user.save();
        } else if (!user.googleId) {
          user.googleId = profile.id;
          user.isVerified = true;
          // ←←← Ye bhi add kar do (user ko profile photo mil jaaye)
          if (!user.profilePicture) user.profilePicture = profile.photos?.[0]?.value;
          await user.save();
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);


export default passport;