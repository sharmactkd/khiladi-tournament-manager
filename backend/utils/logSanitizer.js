const isProd = process.env.NODE_ENV === "production";

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "razorpaySignature",
  "signature",
  "authorization",
  "cookie",
]);

export const maskEmail = (email = "") => {
  const value = String(email || "");
  const [name, domain] = value.split("@");

  if (!name || !domain) return value ? "[REDACTED_EMAIL]" : "";

  return `${name.slice(0, 2)}***@${domain}`;
};

export const maskPhone = (phone = "") => {
  const value = String(phone || "").replace(/\s+/g, "");
  if (!value) return "";
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
};

export const maskId = (value = "") => {
  const str = String(value || "");
  if (!str) return "";
  if (str.length <= 8) return "****";
  return `${str.slice(0, 6)}...${str.slice(-4)}`;
};

export const sanitizeLogValue = (key, value) => {
  const lowerKey = String(key || "").toLowerCase();

  if (SENSITIVE_KEYS.has(lowerKey)) return "[REDACTED]";

  if (lowerKey.includes("email")) return maskEmail(value);
  if (lowerKey.includes("phone") || lowerKey.includes("contact")) return maskPhone(value);

  if (
    lowerKey.includes("razorpay") ||
    lowerKey.includes("paymentid") ||
    lowerKey.includes("orderid")
  ) {
    return maskId(value);
  }

  if (lowerKey === "ip") {
    return isProd ? "[REDACTED_IP]" : value;
  }

  if (lowerKey === "stack") {
    return isProd ? undefined : value;
  }

  return value;
};

export const sanitizeLogMeta = (meta = {}) => {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return meta;

  const sanitized = {};

  Object.entries(meta).forEach(([key, value]) => {
    if (value === undefined) return;

    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      sanitized[key] = sanitizeLogMeta(value);
      return;
    }

    if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        item && typeof item === "object" ? sanitizeLogMeta(item) : item
      );
      return;
    }

    const sanitizedValue = sanitizeLogValue(key, value);

    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }
  });

  return sanitized;
};