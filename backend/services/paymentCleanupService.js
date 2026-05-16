//D:\Khiladi\backend\services\paymentCleanupService.js

import Payment from "../models/payment.js";
import PaymentTransaction from "../models/paymentTransaction.js";
import logger from "../utils/logger.js";

const EXPIRABLE_STATUSES = ["created", "attempted", "authorized", "captured"];

const normalizePositiveNumber = (value, fallback, min, max) => {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.min(Math.max(number, min), max);
};

export const expireStalePayments = async ({
  olderThanMinutes = 30,
  limit = 100,
  source = "payment_cleanup_job",
} = {}) => {
  const safeOlderThanMinutes = normalizePositiveNumber(
    olderThanMinutes,
    30,
    5,
    1440
  );

  const safeLimit = normalizePositiveNumber(limit, 100, 1, 500);

  const cutoff = new Date(Date.now() - safeOlderThanMinutes * 60 * 1000);
  const now = new Date();

  const stalePayments = await Payment.find({
    gateway: "razorpay",
    status: { $in: EXPIRABLE_STATUSES },
    createdAt: { $lte: cutoff },
  })
    .sort({ createdAt: 1 })
    .limit(safeLimit);

  const results = [];

  for (const payment of stalePayments) {
    try {
      const updatedPayment = await Payment.findOneAndUpdate(
        {
          _id: payment._id,
          status: { $in: EXPIRABLE_STATUSES },
        },
        {
          $set: {
            status: "expired",
          },
          $push: {
            statusHistory: {
              status: "expired",
              changedAt: now,
              source,
              note: `Payment expired after ${safeOlderThanMinutes} minutes without successful capture`,
            },
          },
        },
        { new: true }
      );

      if (!updatedPayment) {
        results.push({
          paymentId: payment._id,
          orderId: payment.razorpayOrderId,
          changed: false,
          reason: "already-updated",
        });
        continue;
      }

      await PaymentTransaction.findOneAndUpdate(
        { orderId: updatedPayment.razorpayOrderId },
        {
          $set: {
            status: "expired",
            "metadata.expiredAt": now,
            "metadata.expiredBy": source,
            "metadata.expiryCutoff": cutoff,
            "metadata.expiryOlderThanMinutes": safeOlderThanMinutes,
          },
        },
        { new: true }
      );

      results.push({
        paymentId: updatedPayment._id,
        orderId: updatedPayment.razorpayOrderId,
        previousStatus: payment.status,
        newStatus: "expired",
        changed: true,
      });
    } catch (error) {
      logger.error("Stale payment expiry failed", {
        paymentId: payment._id,
        razorpayOrderId: payment.razorpayOrderId,
        error: error.message,
        stack: error.stack,
      });

      results.push({
        paymentId: payment._id,
        orderId: payment.razorpayOrderId,
        changed: false,
        error: error.message,
      });
    }
  }

  const summary = results.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.changed) acc.expired += 1;
      if (item.error) acc.errors += 1;
      if (item.reason === "already-updated") acc.alreadyUpdated += 1;
      return acc;
    },
    {
      total: 0,
      expired: 0,
      errors: 0,
      alreadyUpdated: 0,
    }
  );

  logger.info("Stale payment cleanup completed", {
    olderThanMinutes: safeOlderThanMinutes,
    cutoff,
    source,
    ...summary,
  });

  return {
    olderThanMinutes: safeOlderThanMinutes,
    cutoff,
    source,
    summary,
    results,
  };
};

export default expireStalePayments;