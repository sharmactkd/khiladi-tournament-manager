// FILE: backend/middleware/csrfProtection.js

import crypto from "crypto";
import { hashRefreshToken } from "../controllers/authController.js";

const isProd = process.env.NODE_ENV === "production";

export const CSRF_COOKIE_NAME = "csrfToken";
export const CSRF_HEADER_NAME = "x-csrf-token";

const getCookieDomain = () => {
  const domain = String(process.env.COOKIE_DOMAIN || "").trim();
  return isProd && domain ? domain : undefined;
};

export const csrfCookieOptions = {
  httpOnly: false,
  secure: isProd,
  sameSite: "lax",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
  ...(getCookieDomain() ? { domain: getCookieDomain() } : {}),
};

const getCsrfSecret = () => {
  if (!process.env.CSRF_SECRET) {
    throw new Error("CSRF_SECRET is required");
  }

  return process.env.CSRF_SECRET;
};

const safeEqual = (a, b) => {
  const aBuffer = Buffer.from(String(a || ""));
  const bBuffer = Buffer.from(String(b || ""));

  if (aBuffer.length !== bBuffer.length) return false;

  return crypto.timingSafeEqual(aBuffer, bBuffer);
};

const createSignature = ({ userId, refreshTokenHash, nonce }) => {
  return crypto
    .createHmac("sha256", getCsrfSecret())
    .update(`${userId}.${refreshTokenHash}.${nonce}`)
    .digest("hex");
};

export const createBoundCsrfToken = ({ userId, rawRefreshToken }) => {
  const nonce = crypto.randomBytes(16).toString("hex");
  const refreshTokenHash = hashRefreshToken(rawRefreshToken);

  const signature = createSignature({
    userId: String(userId),
    refreshTokenHash,
    nonce,
  });

  return `${nonce}.${signature}`;
};

export const setCsrfCookie = (res, { userId, rawRefreshToken }) => {
  const token = createBoundCsrfToken({ userId, rawRefreshToken });
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions);
  return token;
};

export const clearCsrfCookie = (res) => {
res.clearCookie(CSRF_COOKIE_NAME, {
  httpOnly: false,
  secure: isProd,
  sameSite: "lax",
  path: "/",
  ...(getCookieDomain() ? { domain: getCookieDomain() } : {}),
});
};

export const requireCsrfToken = (req, res, next) => {
  try {
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers?.[CSRF_HEADER_NAME];
    const rawRefreshToken = req.cookies?.refreshToken;
    const userId = req.user?._id || req.user?.id || req.user?.userId;

    if (!cookieToken || !headerToken) {
      return res.status(403).json({ message: "CSRF token missing" });
    }

    if (!rawRefreshToken || !userId) {
      return res.status(403).json({ message: "CSRF session missing" });
    }

    if (!safeEqual(cookieToken, headerToken)) {
      return res.status(403).json({ message: "Invalid CSRF token" });
    }

    const [nonce, signature] = String(cookieToken).split(".");

    if (!nonce || !signature) {
      return res.status(403).json({ message: "Invalid CSRF token format" });
    }

    const expectedSignature = createSignature({
      userId: String(userId),
      refreshTokenHash: hashRefreshToken(rawRefreshToken),
      nonce,
    });

    if (!safeEqual(signature, expectedSignature)) {
      return res.status(403).json({ message: "Invalid CSRF token binding" });
    }

    next();
  } catch {
    return res.status(403).json({ message: "CSRF validation failed" });
  }
};

export const requireRefreshCsrfToken = (req, res, next) => {
  try {
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers?.[CSRF_HEADER_NAME];
    const rawRefreshToken = req.cookies?.refreshToken;

    if (!cookieToken || !headerToken) {
      return res.status(403).json({ message: "CSRF token missing" });
    }

    if (!rawRefreshToken) {
      return res.status(403).json({ message: "CSRF session missing" });
    }

    if (!safeEqual(cookieToken, headerToken)) {
      return res.status(403).json({ message: "Invalid CSRF token" });
    }

    // Refresh route me userId decode ke baad controller ke andar validate hoga.
    // Yaha sirf double-submit check hota hai.
    next();
  } catch {
    return res.status(403).json({ message: "CSRF validation failed" });
  }
};