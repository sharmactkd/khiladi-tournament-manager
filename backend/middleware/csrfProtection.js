// FILE: backend/middleware/csrfProtection.js

import crypto from "crypto";

const isProd = process.env.NODE_ENV === "production";

export const CSRF_COOKIE_NAME = "csrfToken";
export const CSRF_HEADER_NAME = "x-csrf-token";

export const csrfCookieOptions = {
  httpOnly: false,
  secure: isProd,
  sameSite: "lax",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

export const generateCsrfToken = () => crypto.randomBytes(32).toString("hex");

export const setCsrfCookie = (res) => {
  const token = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions);
  return token;
};

export const clearCsrfCookie = (res) => {
  res.clearCookie(CSRF_COOKIE_NAME, {
  httpOnly: false,
  secure: isProd,
  sameSite: "lax",
  path: "/",
});
};

export const requireCsrfToken = (req, res, next) => {
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers?.[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ message: "CSRF token missing" });
  }

  if (String(cookieToken) !== String(headerToken)) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  next();
};