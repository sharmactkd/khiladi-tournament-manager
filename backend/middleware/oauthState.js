// FILE: backend/middleware/oauthState.js

import crypto from "crypto";

const isProd = process.env.NODE_ENV === "production";

export const OAUTH_STATE_COOKIE_NAME = "oauthState";

const oauthStateCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/api/auth/google/callback",
  maxAge: 5 * 60 * 1000,
};

export const generateOAuthState = (req, res, next) => {
  const state = crypto.randomBytes(32).toString("hex");

  res.cookie(OAUTH_STATE_COOKIE_NAME, state, oauthStateCookieOptions);

  req.oauthState = state;

  next();
};

export const verifyOAuthState = (req, res, next) => {
  const cookieState = req.cookies?.[OAUTH_STATE_COOKIE_NAME];
  const queryState = req.query?.state;

  res.clearCookie(OAUTH_STATE_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/api/auth/google/callback",
  });

  if (!cookieState || !queryState) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_state_missing`);
  }

  if (String(cookieState) !== String(queryState)) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_state_invalid`);
  }

  next();
};