import logger from "../utils/logger.js";
import { expireStalePayments } from "./paymentCleanupService.js";

let cleanupTimer = null;
let cleanupRunning = false;

const toBool = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["true", "1", "yes", "on"].includes(
    String(value).toLowerCase()
  );
};

export const startPaymentCleanupScheduler = () => {
  const enabled = toBool(
    process.env.PAYMENT_CLEANUP_ENABLED,
    true
  );

  if (!enabled) {
    logger.info("Payment cleanup scheduler disabled");
    return null;
  }

  if (cleanupTimer) {
    logger.info("Payment cleanup scheduler already running");
    return cleanupTimer;
  }

  const intervalMinutes = Math.max(
    Number(process.env.PAYMENT_CLEANUP_INTERVAL_MINUTES || 10),
    1
  );

  const olderThanMinutes = Math.max(
    Number(process.env.PAYMENT_CLEANUP_OLDER_THAN_MINUTES || 30),
    5
  );

  const limit = Math.min(
    Math.max(Number(process.env.PAYMENT_CLEANUP_LIMIT || 100), 1),
    500
  );

  const runCleanup = async () => {
    if (cleanupRunning) {
      logger.warn(
        "Payment cleanup skipped because previous cleanup is still running"
      );
      return;
    }

    cleanupRunning = true;

    try {
      await expireStalePayments({
        olderThanMinutes,
        limit,
        source: "auto_payment_cleanup_scheduler",
      });
    } catch (error) {
      logger.error("Payment cleanup scheduler failed", {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      cleanupRunning = false;
    }
  };

  cleanupTimer = setInterval(
    runCleanup,
    intervalMinutes * 60 * 1000
  );

  cleanupTimer.unref?.();

  logger.info("Payment cleanup scheduler started", {
    intervalMinutes,
    olderThanMinutes,
    limit,
  });

  return cleanupTimer;
};

export const stopPaymentCleanupScheduler = () => {
  if (!cleanupTimer) {
    return;
  }

  clearInterval(cleanupTimer);

  cleanupTimer = null;

  logger.info("Payment cleanup scheduler stopped");
};

export default startPaymentCleanupScheduler;