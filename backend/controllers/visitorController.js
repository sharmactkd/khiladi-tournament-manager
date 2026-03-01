import crypto from "crypto";
import Visitor from "../models/visitor.js";
import logger from "../utils/logger.js";

const isProd = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: false,
  sameSite: "lax",
  secure: isProd,
  path: "/",
};

const getTodayKey = () => {
  // YYYY-MM-DD in server local time (stable enough for "once per day" logic)
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const makeVisitorId = () => {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {}
  // fallback
  return crypto.randomBytes(16).toString("hex");
};

export const getVisitorCount = async (req, res) => {
  try {
    const today = getTodayKey();

    let vid = req.cookies?.khiladi_vid;
    if (!vid) {
      vid = makeVisitorId();
      res.cookie("khiladi_vid", vid, {
        ...cookieOptions,
        maxAge: 1000 * 60 * 60 * 24 * 365 * 2, // 2 years
      });
    }

    const lastSeenDay = req.cookies?.khiladi_vseen;
    const shouldIncrement = String(lastSeenDay || "") !== String(today);

    // Always set/update last seen cookie (even if already today, keep it consistent)
    res.cookie("khiladi_vseen", today, {
      ...cookieOptions,
      maxAge: 1000 * 60 * 60 * 24 * 365 * 2, // 2 years
    });

    // Atomic + concurrency-safe increment when needed
    if (shouldIncrement) {
      const doc = await Visitor.findOneAndUpdate(
        { key: "global" },
        { $inc: { count: 1 }, $setOnInsert: { key: "global" } },
        { new: true, upsert: true }
      ).lean();

      return res.status(200).json({ count: Number(doc?.count || 0) });
    }

    // No increment today: just read the global doc (create if missing)
    const doc = await Visitor.findOneAndUpdate(
      { key: "global" },
      { $setOnInsert: { key: "global", count: 0 } },
      { new: true, upsert: true }
    ).lean();

    return res.status(200).json({ count: Number(doc?.count || 0) });
  } catch (err) {
    // Must not crash server
    try {
      logger?.error?.("Visitor counter failed", { error: err?.message, stack: err?.stack });
    } catch {
      console.error("Visitor counter failed:", err);
    }
    return res.status(200).json({ count: 0 });
  }
};