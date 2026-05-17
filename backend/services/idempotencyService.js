import crypto from "crypto";

const normalize = (value) => String(value || "").trim();

export const getRequestIdempotencyKey = (req, fallback = "") => {
  const headerKey =
    req.headers["idempotency-key"] ||
    req.headers["x-idempotency-key"] ||
    "";

  if (headerKey) {
    return normalize(headerKey).slice(0, 120);
  }

  return normalize(fallback);
};

export const createDeterministicKey = (...parts) => {
  return parts
    .map((part) => normalize(part))
    .filter(Boolean)
    .join(":")
    .slice(0, 180);
};

export const createPayloadHash = (payload = {}) => {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
};