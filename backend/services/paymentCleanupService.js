import Razorpay from "razorpay";
import Payment from "../models/payment.js";
import PaymentTransaction from "../models/paymentTransaction.js";
import logger from "../utils/logger.js";
import processPaidPayment from "./paymentProcessingService.js";

const EXPIRABLE_STATUSES = ["created", "attempted", "authorized", "captured"];

const normalizePositiveNumber = (value, fallback, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const getExpectedAmountInPaise = (payment) =>
  Math.round(Number(payment.finalAmount ?? payment.amount ?? 0) * 100);

const findCapturedRazorpayPayment = ({ razorpayPayments, localPayment }) => {
  const items = Array.isArray(razorpayPayments?.items)
    ? razorpayPayments.items
    : [];

  const expectedAmountInPaise = getExpectedAmountInPaise(localPayment);
  const expectedCurrency = String(localPayment.currency || "INR").toUpperCase();

  return (
    items.find((item) => {
      return (
        item?.order_id === localPayment.razorpayOrderId &&
        item?.status === "captured" &&
        Number(item?.amount) === expectedAmountInPaise &&
        String(item?.currency || "").toUpperCase() === expectedCurrency
      );
    }) || null
  );
};

const reconcileBeforeExpire = async ({ payment, source }) => {
  const razorpay = getRazorpayInstance();

  if (!razorpay || !payment?.razorpayOrderId) {
    return {
      reconciled: false,
      reason: "razorpay-not-configured-or-order-missing",
    };
  }

  const razorpayPayments = await razorpay.orders.fetchPayments(
    payment.razorpayOrderId
  );

  const capturedPayment = findCapturedRazorpayPayment({
    razorpayPayments,
    localPayment: payment,
  });

  if (!capturedPayment?.id) {
    return {
      reconciled: false,
      reason: "no-captured-payment-found",
    };
  }

  const processed = await processPaidPayment({
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: capturedPayment.id,
    razorpaySignature: "",
    verifiedBy: `${source}_recovered_paid_before_expiry`,
  });

  return {
    reconciled: true,
    reason: "captured-payment-recovered",
    processed,
    razorpayPaymentId: capturedPayment.id,
  };
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
      const recovery = await reconcileBeforeExpire({ payment, source });

      if (recovery.reconciled) {
        results.push({
          paymentId: payment._id,
          orderId: payment.razorpayOrderId,
          changed: true,
          recovered: true,
          newStatus: "paid",
          razorpayPaymentId: recovery.razorpayPaymentId,
        });
        continue;
      }

      const updatedPayment = await Payment.findOneAndUpdate(
        {
          _id: payment._id,
          status: { $in: EXPIRABLE_STATUSES },
        },
        {
          $set: { status: "expired" },
          $push: {
            statusHistory: {
              status: "expired",
              changedAt: now,
              source,
              note: `Payment expired after ${safeOlderThanMinutes} minutes; Razorpay server-side reconciliation found no captured payment`,
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
            "metadata.expiryReconcileReason": recovery.reason,
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
        recovered: false,
      });
    } catch (error) {
      logger.error("Stale payment expiry/reconcile failed", {
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
      if (item.changed && item.newStatus === "expired") acc.expired += 1;
      if (item.recovered) acc.recoveredPaid += 1;
      if (item.error) acc.errors += 1;
      if (item.reason === "already-updated") acc.alreadyUpdated += 1;
      return acc;
    },
    { total: 0, expired: 0, recoveredPaid: 0, errors: 0, alreadyUpdated: 0 }
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