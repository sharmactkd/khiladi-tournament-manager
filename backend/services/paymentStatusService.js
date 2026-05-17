import mongoose from "mongoose";
import Payment from "../models/payment.js";
import PaymentTransaction from "../models/paymentTransaction.js";
import User from "../models/user.js";
import AccessEntitlement from "../models/accessEntitlement.js";
import logger from "../utils/logger.js";
import { createBillingEvent } from "./billingEventService.js";

const normalizeString = (value) => String(value || "").trim();

const REFUND_STATUSES = ["refunded", "partially_refunded"];
const ACCESS_REVOCATION_STATUSES = ["refunded", "partially_refunded", "disputed"];

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
  return ["refunded", "partially_refunded", "cancelled", "expired", "disputed"].includes(
    status
  );
};

const shouldRevokePaymentEntitlements = (status) => {
  return ACCESS_REVOCATION_STATUSES.includes(status);
};

const getEntitlementRevokeReason = ({ status, source, note }) => {
  if (status === "disputed") {
    return normalizeString(note) || `Payment disputed via ${source}`;
  }

  if (status === "partially_refunded") {
    return normalizeString(note) || `Payment partially refunded via ${source}`;
  }

  if (status === "refunded") {
    return normalizeString(note) || `Payment refunded via ${source}`;
  }

  return normalizeString(note) || `Payment status changed to ${status}`;
};

const revokePaymentEntitlementsIfNeeded = async ({
  payment,
  status,
  source,
  note,
  metadata = {},
  session,
}) => {
  if (!payment?._id || !payment?.userId || !shouldRevokePaymentEntitlements(status)) {
    return {
      matchedCount: 0,
      modifiedCount: 0,
      skipped: true,
    };
  }

  const now = new Date();

  const result = await AccessEntitlement.updateMany(
    {
      userId: payment.userId,
      source: "payment",
      sourceId: payment._id,
      status: "active",
    },
    {
      $set: {
        status: "revoked",
        revokedAt: now,
        revokedBy: null,
        revokeReason: getEntitlementRevokeReason({ status, source, note }),
        "metadata.revokedByPaymentStatus": status,
        "metadata.revokedByPaymentWebhookSource": source,
        "metadata.revokedAt": now,
        "metadata.refundOrDisputeMetadata": metadata || {},
      },
    },
    { session }
  );

  return {
    matchedCount: result.matchedCount || result.n || 0,
    modifiedCount: result.modifiedCount || result.nModified || 0,
    skipped: false,
  };
};

const calculateUserEntitlementCache = async ({ userId, session }) => {
  const now = new Date();

  const bestEntitlement = await AccessEntitlement.findOne({
    userId,
    status: "active",
    startsAt: { $lte: now },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .sort({ priority: 1, expiresAt: -1, createdAt: -1 })
    .session(session);

  if (!bestEntitlement) {
    return {
      subscriptionStatus: "none",
      subscriptionType: "none",
      premiumExpiresAt: null,
      lifetimeAccess: false,
      adminAccessOverride: false,
      accessSource: null,
    };
  }

  const isLifetime =
    bestEntitlement.accessType === "lifetime" ||
    bestEntitlement.planType === "lifetime" ||
    bestEntitlement.source === "lifetime";

  const isAdminOverride =
    bestEntitlement.source === "admin" &&
    bestEntitlement.planType === "admin_override";

  return {
    subscriptionStatus: isLifetime
      ? "lifetime"
      : bestEntitlement.source === "trial"
        ? "trial"
        : "active",
    subscriptionType: bestEntitlement.planType || bestEntitlement.accessType || "premium",
    premiumExpiresAt: isLifetime ? null : bestEntitlement.expiresAt || null,
    lifetimeAccess: isLifetime,
    adminAccessOverride: isAdminOverride,
    accessSource: bestEntitlement.source,
    lastPaymentDate: new Date(),
  };
};

const recalculateUserAccessIfNeeded = async ({ payment, status, session }) => {
  if (!payment?.userId || !shouldRecalculateUserAccess(status)) return;

  const user = await User.findById(payment.userId).session(session);

  if (!user) return;

  const recalculatedAccess = await calculateUserEntitlementCache({
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
          entitlementRevocation: {
            skipped: true,
            reason: "same-status",
          },
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
          entitlementRevocation: {
            skipped: true,
            reason: "invalid-status-transition",
          },
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

      if (REFUND_STATUSES.includes(status) || status === "disputed") {
        update.$set.accessExpiresAt = new Date();
      }

      const updatedPayment = await Payment.findByIdAndUpdate(payment._id, update, {
        new: true,
        session,
      });

   

      const entitlementRevocation = await revokePaymentEntitlementsIfNeeded({
        payment: updatedPayment,
        status,
        source,
        note,
        metadata,
        session,
      });

         await createBillingEvent({
  eventType: `payment.${status}`,
  aggregateType: "payment",
  aggregateId: updatedPayment._id,
  userId: updatedPayment.userId,
  idempotencyKey: `payment.${status}:${updatedPayment._id}:${safePaymentId || safeOrderId}`,
  payload: {
    paymentId: updatedPayment._id,
    razorpayOrderId: updatedPayment.razorpayOrderId,
    razorpayPaymentId: safePaymentId || updatedPayment.razorpayPaymentId || "",
    status,
    source,
    note,
    metadata,
    entitlementRevocation,
  },
  session,
});

      await PaymentTransaction.findOneAndUpdate(
        { orderId: updatedPayment.razorpayOrderId },
        {
          $set: {
            status,
            paymentId: safePaymentId || updatedPayment.razorpayPaymentId || "",
            "metadata.lastWebhookStatus": status,
            "metadata.lastWebhookSource": source,
            "metadata.lastWebhookAt": new Date(),
            "metadata.entitlementRevocation": entitlementRevocation,
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
        entitlementRevocation,
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
      entitlementRevocation: result?.entitlementRevocation,
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