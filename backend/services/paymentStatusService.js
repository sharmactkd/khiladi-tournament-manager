import mongoose from "mongoose";
import Payment from "../models/payment.js";
import PaymentTransaction from "../models/paymentTransaction.js";
import User from "../models/user.js";
import logger from "../utils/logger.js";

const normalizeString = (value) => String(value || "").trim();

const REFUND_STATUSES = ["refunded", "partially_refunded"];

const buildHistoryEntry = ({ status, source, note }) => ({
  status,
  changedAt: new Date(),
  source: normalizeString(source) || "system",
  note: normalizeString(note),
});

const shouldClearUserAccess = (status) => {
  return ["refunded", "cancelled", "expired", "disputed"].includes(status);
};

const clearUserPaymentAccessIfNeeded = async ({ payment, status, session }) => {
  if (!payment?.userId || !shouldClearUserAccess(status)) return;

  await User.findByIdAndUpdate(
    payment.userId,
    {
      $set: {
        subscriptionStatus: "none",
        subscriptionType: "none",
        premiumExpiresAt: null,
        lifetimeAccess: false,
        accessSource: null,
      },
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

      await clearUserPaymentAccessIfNeeded({
        payment: updatedPayment,
        status,
        session,
      });

      result = {
        alreadyProcessed: false,
        payment: updatedPayment,
      };
    });

    logger.info("Payment status updated safely", {
      razorpayOrderId: safeOrderId,
      razorpayPaymentId: safePaymentId,
      status,
      source,
      alreadyProcessed: result?.alreadyProcessed || false,
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