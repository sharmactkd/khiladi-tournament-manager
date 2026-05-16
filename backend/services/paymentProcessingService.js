import mongoose from "mongoose";
import Payment from "../models/payment.js";
import PaymentTransaction from "../models/paymentTransaction.js";
import User from "../models/user.js";
import logger from "../utils/logger.js";
import { getPaymentAccessFields } from "./subscriptionService.js";

const normalizeString = (value) => String(value || "").trim();

const buildUserAccessUpdate = (payment) => {
  const isLifetime = payment.planType === "lifetime";

  return {
    subscriptionStatus: isLifetime ? "lifetime" : "active",
    subscriptionType: payment.planType,
    premiumExpiresAt: payment.planType === "single" ? null : payment.accessExpiresAt,
    lifetimeAccess: isLifetime,
    accessSource: isLifetime ? "lifetime" : "payment",
    lastPaymentDate: new Date(),
  };
};

const buildAccessResponse = (payment) => ({
  planType: payment.planType,
  accessType: payment.accessType,
  tournamentId: payment.tournamentId,
  accessStartsAt: payment.accessStartsAt,
  accessExpiresAt: payment.accessExpiresAt,
});

const getAccessLifecycle = (payment) => {
  if (payment.planType === "single") return "single_tournament_lifetime";
  if (payment.planType === "lifetime") return "lifetime";
  return "fixed_duration";
};

export const processPaidPayment = async ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature = "",
  verifiedBy = "unknown",
} = {}) => {
  const safeOrderId = normalizeString(razorpayOrderId);
  const safePaymentId = normalizeString(razorpayPaymentId);
  const safeSignature = normalizeString(razorpaySignature);
  const safeVerifiedBy = normalizeString(verifiedBy) || "unknown";

  if (!safeOrderId || !safePaymentId) {
    const error = new Error("razorpayOrderId and razorpayPaymentId are required");
    error.statusCode = 400;
    throw error;
  }

  const session = await mongoose.startSession();

  try {
    let result = null;

    await session.withTransaction(async () => {
      const existingPayment = await Payment.findOne({
        razorpayOrderId: safeOrderId,
      }).session(session);

      if (!existingPayment) {
        const error = new Error("Payment order not found");
        error.statusCode = 404;
        throw error;
      }

      if (existingPayment.status === "paid") {
        result = {
          alreadyProcessed: true,
          payment: existingPayment,
          access: buildAccessResponse(existingPayment),
        };

        return;
      }

      if (!["created", "attempted", "authorized", "captured"].includes(existingPayment.status)) {
        const error = new Error(
          `Payment cannot be processed from status: ${existingPayment.status}`
        );
        error.statusCode = 409;
        throw error;
      }

      const accessFields = await getPaymentAccessFields(
        existingPayment.planType,
        new Date()
      );

      const payment = await Payment.findOneAndUpdate(
        {
          _id: existingPayment._id,
          status: { $in: ["created", "attempted", "authorized", "captured"] },
        },
        {
        $set: {
  status: "paid",
  razorpayPaymentId: safePaymentId,
  razorpaySignature: safeSignature,
  accessType: accessFields.accessType,
  accessStartsAt: accessFields.accessStartsAt,
  accessExpiresAt: accessFields.accessExpiresAt,
  accessLifecycle: getAccessLifecycle(existingPayment),
},
          $push: {
            statusHistory: {
              status: "paid",
              changedAt: new Date(),
              source: safeVerifiedBy,
              note: "Payment verified and premium access activated",
            },
          },
        },
        {
          new: true,
          session,
        }
      );

      if (!payment) {
        const latestPayment = await Payment.findById(existingPayment._id).session(session);

        result = {
          alreadyProcessed: true,
          payment: latestPayment,
          access: latestPayment ? buildAccessResponse(latestPayment) : null,
        };

        return;
      }

      await User.findByIdAndUpdate(
        payment.userId,
        {
          $set: buildUserAccessUpdate(payment),
        },
        { session }
      );

      await PaymentTransaction.findOneAndUpdate(
        { orderId: safeOrderId },
        {
          $set: {
            status: "paid",
            paymentId: safePaymentId,
            planSnapshot: payment.planSnapshot || null,
            "metadata.legacyPaymentId": payment._id,
            "metadata.verifiedBy": safeVerifiedBy,
            "metadata.accessStartsAt": payment.accessStartsAt,
            "metadata.accessExpiresAt": payment.accessExpiresAt,
            "metadata.processedAt": new Date(),
          },
        },
        {
          session,
          new: true,
        }
      );

      result = {
        alreadyProcessed: false,
        payment,
        access: buildAccessResponse(payment),
      };
    });

    logger.info("Payment processed safely", {
      razorpayOrderId: safeOrderId,
      razorpayPaymentId: safePaymentId,
      verifiedBy: safeVerifiedBy,
      alreadyProcessed: result?.alreadyProcessed || false,
      paymentId: result?.payment?._id,
      userId: result?.payment?.userId,
      planType: result?.payment?.planType,
      status: result?.payment?.status,
    });

    return result;
  } catch (error) {
    logger.error("Safe payment processing failed", {
      error: error.message,
      stack: error.stack,
      razorpayOrderId: safeOrderId,
      razorpayPaymentId: safePaymentId,
      verifiedBy: safeVerifiedBy,
    });

    throw error;
  } finally {
    session.endSession();
  }
};

export default processPaidPayment;