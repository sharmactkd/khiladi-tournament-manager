import mongoose from "mongoose";
import Payment from "../models/payment.js";
import PaymentTransaction from "../models/paymentTransaction.js";
import User from "../models/user.js";
import logger from "../utils/logger.js";

const normalizeString = (value) => String(value || "").trim();

const REFUND_STATUSES = ["refunded", "partially_refunded"];

const FINAL_LOCKED_STATUSES = ["paid", "refunded", "partially_refunded", "disputed"];

const STATUS_PRIORITY = {
  created: 10,
  attempted: 20,
  authorized: 30,
  captured: 40,
  paid: 50,
  failed: 15,
  cancelled: 15,
  expired: 15,
  partially_refunded: 60,
  refunded: 70,
  disputed: 80,
};

const buildHistoryEntry = ({ status, source, note }) => ({
  status,
  changedAt: new Date(),
  source: normalizeString(source) || "system",
  note: normalizeString(note),
});

const isValidStatusTransition = ({ currentStatus, nextStatus }) => {
  if (!currentStatus || !nextStatus) return false;
  if (currentStatus === nextStatus) return true;

  if (currentStatus === "paid") {
    return ["partially_refunded", "refunded", "disputed"].includes(nextStatus);
  }

  if (currentStatus === "partially_refunded") {
    return ["refunded", "disputed"].includes(nextStatus);
  }

  if (currentStatus === "refunded") {
    return nextStatus === "disputed";
  }

  if (currentStatus === "disputed") {
    return false;
  }

  if (["failed", "cancelled", "expired"].includes(currentStatus)) {
    return ["authorized", "captured", "paid"].includes(nextStatus);
  }

  return (STATUS_PRIORITY[nextStatus] || 0) >= (STATUS_PRIORITY[currentStatus] || 0);
};

const shouldRecalculateUserAccess = (status) => {
  return ["refunded", "cancelled", "expired", "disputed"].includes(status);
};

const calculateUserPaymentAccess = async ({ userId, session }) => {
  const now = new Date();

  const latestValidPayment = await Payment.findOne({
    userId,
    status: "paid",
    accessStartsAt: { $ne: null, $lte: now },
    $or: [
      { accessExpiresAt: null },
      { accessExpiresAt: { $gt: now } },
    ],
  })
    .sort({
      accessExpiresAt: -1,
      createdAt: -1,
    })
    .session(session);

  if (!latestValidPayment) {
    return {
      subscriptionStatus: "none",
      subscriptionType: "none",
      premiumExpiresAt: null,
      lifetimeAccess: false,
      accessSource: null,
    };
  }

  const isLifetime =
    latestValidPayment.planType === "lifetime" ||
    latestValidPayment.accessLifecycle === "lifetime";

  return {
    subscriptionStatus: isLifetime ? "lifetime" : "active",
    subscriptionType: latestValidPayment.planType,
    premiumExpiresAt:
      latestValidPayment.planType === "single"
        ? null
        : latestValidPayment.accessExpiresAt,
    lifetimeAccess: isLifetime,
    accessSource: isLifetime ? "lifetime" : "payment",
    lastPaymentDate: latestValidPayment.updatedAt || latestValidPayment.createdAt || new Date(),
  };
};

const recalculateUserAccessIfNeeded = async ({ payment, status, session }) => {
  if (!payment?.userId || !shouldRecalculateUserAccess(status)) return;

  const user = await User.findById(payment.userId).session(session);

  if (!user) return;

  if (user.adminAccessOverride || user.lifetimeAccess || user.accessSource === "admin") {
    return;
  }

  const recalculatedAccess = await calculateUserPaymentAccess({
    userId: payment.userId,
    session,
  });

  await User.findByIdAndUpdate(
    payment.userId,
    {
      $set: recalculatedAccess,
    },
    { session }
  );
};

export const processPaymentStatusUpdate = async ({
  razorpayOrderId = "",
  razorpayPaymentId = "",
  status,
  source = "razorpay_webhook",
  note = "",
  metadata = {},
} = {}) => {
  const safeOrderId = normalizeString(razorpayOrderId);
  const safePaymentId = normalizeString(razorpayPaymentId);

  if (!safeOrderId && !safePaymentId) {
    const error = new Error("razorpayOrderId or razorpayPaymentId is required");
    error.statusCode = 400;
    throw error;
  }

  if (!status) {
    const error = new Error("Payment status is required");
    error.statusCode = 400;
    throw error;
  }

  const session = await mongoose.startSession();

  try {
    let result = null;

    await session.withTransaction(async () => {
      const query = safeOrderId
        ? { razorpayOrderId: safeOrderId }
        : { razorpayPaymentId: safePaymentId };

      const payment = await Payment.findOne(query).session(session);

      if (!payment) {
        const error = new Error("Payment not found for status update");
        error.statusCode = 404;
        throw error;
      }

      if (payment.status === status) {
        result = {
          alreadyProcessed: true,
          ignored: false,
          payment,
        };
        return;
      }

      if (!isValidStatusTransition({ currentStatus: payment.status, nextStatus: status })) {
        logger.warn("Invalid payment status transition ignored", {
          paymentId: payment._id,
          userId: payment.userId,
          currentStatus: payment.status,
          nextStatus: status,
          razorpayOrderId: safeOrderId,
          razorpayPaymentId: safePaymentId,
          source,
        });

        result = {
          alreadyProcessed: true,
          ignored: true,
          reason: "invalid-status-transition",
          payment,
        };
        return;
      }

      const update = {
        $set: {
          status,
        },
        $push: {
          statusHistory: buildHistoryEntry({
            status,
            source,
            note,
          }),
        },
      };

      if (safePaymentId && !payment.razorpayPaymentId) {
        update.$set.razorpayPaymentId = safePaymentId;
      }

      if (REFUND_STATUSES.includes(status)) {
        update.$set.accessExpiresAt = new Date();
      }

      if (status === "disputed") {
        update.$set.accessExpiresAt = new Date();
      }

      const updatedPayment = await Payment.findByIdAndUpdate(
        payment._id,
        update,
        {
          new: true,
          session,
        }
      );

      await PaymentTransaction.findOneAndUpdate(
        { orderId: updatedPayment.razorpayOrderId },
        {
          $set: {
            status,
            paymentId: safePaymentId || updatedPayment.razorpayPaymentId || "",
            "metadata.lastWebhookStatus": status,
            "metadata.lastWebhookSource": source,
            "metadata.lastWebhookAt": new Date(),
            ...Object.entries(metadata || {}).reduce((acc, [key, value]) => {
              acc[`metadata.${key}`] = value;
              return acc;
            }, {}),
          },
        },
        {
          new: true,
          session,
        }
      );

      await recalculateUserAccessIfNeeded({
        payment: updatedPayment,
        status,
        session,
      });

      result = {
        alreadyProcessed: false,
        ignored: false,
        payment: updatedPayment,
      };
    });

    logger.info("Payment status updated safely", {
      razorpayOrderId: safeOrderId,
      razorpayPaymentId: safePaymentId,
      status,
      source,
      alreadyProcessed: result?.alreadyProcessed || false,
      ignored: result?.ignored || false,
      reason: result?.reason || "",
      paymentId: result?.payment?._id,
      userId: result?.payment?.userId,
    });

    return result;
  } catch (error) {
    logger.error("Payment status update failed", {
      error: error.message,
      stack: error.stack,
      razorpayOrderId: safeOrderId,
      razorpayPaymentId: safePaymentId,
      status,
      source,
    });

    throw error;
  } finally {
    session.endSession();
  }
};

export default processPaymentStatusUpdate;