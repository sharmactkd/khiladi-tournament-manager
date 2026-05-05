import mongoose from "mongoose";
import ActivityLog, {
  ACTIVITY_ACTIONS,
  ACTIVITY_MODULES,
} from "../models/activityLog.js";
import logger from "./logger.js";

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passcode/i,
  /refreshToken/i,
  /refreshTokens/i,
  /accessToken/i,
  /token/i,
  /jwt/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /googleAccessToken/i,
  /googleRefreshToken/i,
];

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 100;
const MAX_STRING_LENGTH = 1200;

const isObjectIdLike = (value) => {
  if (!value) return false;
  if (value instanceof mongoose.Types.ObjectId) return true;
  return mongoose.Types.ObjectId.isValid(String(value));
};

const normalizeObjectId = (value) => {
  if (!value) return null;

  if (value?._id && isObjectIdLike(value._id)) {
    return value._id;
  }

  if (isObjectIdLike(value)) {
    return value;
  }

  return null;
};

const isSensitiveKey = (key = "") =>
  SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(String(key)));

const truncateString = (value) => {
  const str = String(value || "");
  if (str.length <= MAX_STRING_LENGTH) return str;
  return `${str.slice(0, MAX_STRING_LENGTH)}...`;
};

export const sanitizeMetadata = (value, depth = 0, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;

  if (depth > MAX_DEPTH) {
    return "[MaxDepth]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeMetadata(item, depth + 1, seen));
  }

  const output = {};

  Object.entries(value).forEach(([key, item]) => {
    if (isSensitiveKey(key)) {
      output[key] = "[REDACTED]";
      return;
    }

    output[key] = sanitizeMetadata(item, depth + 1, seen);
  });

  return output;
};

const getRequestIp = (req) => {
  if (!req) return "";

  const forwardedFor = req.headers?.["x-forwarded-for"];
  if (forwardedFor) {
    return String(forwardedFor).split(",")[0].trim();
  }

  return (
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    ""
  );
};

const getUserAgent = (req) => {
  if (!req) return "";
  return String(req.headers?.["user-agent"] || "").slice(0, 600);
};

const normalizeAction = (action) => {
  const value = String(action || "").trim();
  return ACTIVITY_ACTIONS.includes(value) ? value : "ADMIN_ACTION";
};

const normalizeModule = (module) => {
  const value = String(module || "").trim();
  return ACTIVITY_MODULES.includes(value) ? value : "system";
};

export const logActivity = async ({
  req = null,
  user = null,
  actor = null,
  tournament = null,
  action,
  module = "system",
  title = "",
  description = "",
  metadata = {},
  ipAddress = "",
  userAgent = "",
} = {}) => {
  const normalizedAction = normalizeAction(action);
  const normalizedModule = normalizeModule(module);

  const activity = await ActivityLog.create({
    user: normalizeObjectId(user),
    actor: normalizeObjectId(actor) || normalizeObjectId(req?.user),
    tournament: normalizeObjectId(tournament),
    action: normalizedAction,
    module: normalizedModule,
    title: truncateString(title).slice(0, 180),
    description: truncateString(description).slice(0, 1200),
    metadata: sanitizeMetadata(metadata || {}),
    ipAddress: String(ipAddress || getRequestIp(req) || "").slice(0, 120),
    userAgent: String(userAgent || getUserAgent(req) || "").slice(0, 600),
  });

  return activity;
};

export const logActivitySafe = async (payload = {}) => {
  try {
    return await logActivity(payload);
  } catch (error) {
    logger.warn("Activity logging failed", {
      error: error.message,
      action: payload?.action,
      module: payload?.module,
      user: payload?.user?._id || payload?.user || null,
      actor: payload?.actor?._id || payload?.actor || null,
      tournament: payload?.tournament?._id || payload?.tournament || null,
    });

    return null;
  }
};

export default {
  logActivity,
  logActivitySafe,
  sanitizeMetadata,
};