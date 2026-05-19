// backend/services/paymentProcessingService.js
import mongoose from "mongoose";
import Payment from "../models/payment.js";
import PaymentTransaction from "../models/paymentTransaction.js";
import User from "../models/user.js";
import logger from "../utils/logger.js";
import { getPaymentAccessFields } from "./subscriptionService.js";
import { createAccessEntitlement } from "./accessEntitlementService.js";
import { createBillingEvent } from "./billingEventService.js";
import { redeemCouponAtomically } from "./couponService.js";

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

const buildAccessResponse = (payment, entitlement = null) => ({
  planType: payment.planType,
  accessType: payment.accessType,
  tournamentId: payment.tournamentId,
  accessStartsAt: payment.accessStartsAt,
  accessExpiresAt: payment.accessExpiresAt,
  entitlementId: entitlement?._id || null,
});

const getAccessLifecycle = (payment) => {
  if (payment.planType === "single") return "single_tournament_lifetime";
  if (payment.planType === "lifetime") return "lifetime";
  return "fixed_duration";
};

const getEntitlementScope = (payment) => {
  if (payment.accessType === "tournament" || payment.planType === "single") {
    return "tournament";
  }

  return "global";
};

const getEntitlementAccessType = (payment) => {
  if (payment.planType === "lifetime") return "lifetime";

  if (payment.accessType === "tournament" || payment.planType === "single") {
    return "tournament";
  }

  return "unlimited";
};

const getAppliedCouponSnapshot = (payment) => {
  const directCoupon = payment?.couponSnapshot;
  const legacyCoupon = payment?.planSnapshot?.coupon;
  const coupon = directCoupon?.code ? directCoupon : legacyCoupon;

  if (!coupon || !coupon.code) return null;

  return {
    couponId: coupon.couponId || null,
    code: String(coupon.code || "").trim().toUpperCase(),
    category: coupon.category || "discount_coupon",
    type: coupon.type || "",
    value: Number(coupon.value || 0),
    originalAmount: Number(coupon.originalAmount || payment.originalAmount || 0),
    discountAmount: Number(coupon.discountAmount || payment.discountAmount || 0),
    finalAmount: Number(coupon.finalAmount || payment.finalAmount || payment.amount || 0),
  };
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

   if (
  !["created", "attempted", "authorized", "captured", "expired"].includes(
    existingPayment.status
  )
) {
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
          status: { $in: ["created", "attempted", "authorized", "captured", "expired"] },
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
        const latestPayment = await Payment.findById(existingPayment._id).session(
          session
        );

        result = {
          alreadyProcessed: true,
          payment: latestPayment,
          access: latestPayment ? buildAccessResponse(latestPayment) : null,
        };

        return;
      }

      const couponSnapshot = getAppliedCouponSnapshot(payment);

      const entitlement = await createAccessEntitlement({
        userId: payment.userId,
        scope: getEntitlementScope(payment),
        tournamentId: payment.planType === "single" ? payment.tournamentId : null,
        source: "payment",
        sourceId: payment._id,
        planType: payment.planType,
        accessType: getEntitlementAccessType(payment),
        startsAt: payment.accessStartsAt,
        expiresAt: payment.accessExpiresAt,
        metadata: {
          gateway: payment.gateway,
          razorpayOrderId: payment.razorpayOrderId,
          razorpayPaymentId: safePaymentId,
          verifiedBy: safeVerifiedBy,
          planSnapshot: payment.planSnapshot,
          coupon: couponSnapshot,
          originalAmount: payment.originalAmount,
          discountAmount: payment.discountAmount,
          finalAmount: payment.finalAmount,
        },
        session,
      });

      await createBillingEvent({
        eventType: "payment.paid",
        aggregateType: "payment",
        aggregateId: payment._id,
        userId: payment.userId,
        idempotencyKey: `payment.paid:${payment._id}`,
        payload: {
          paymentId: payment._id,
          razorpayOrderId: payment.razorpayOrderId,
          razorpayPaymentId: safePaymentId,
          planType: payment.planType,
          amount: payment.amount,
          originalAmount: payment.originalAmount,
          discountAmount: payment.discountAmount,
          finalAmount: payment.finalAmount,
          currency: payment.currency,
          entitlementId: entitlement?._id || null,
          verifiedBy: safeVerifiedBy,
          coupon: couponSnapshot,
        },
        session,
      });

      await User.findByIdAndUpdate(
        payment.userId,
        {
          $set: buildUserAccessUpdate(payment),
        },
        { session }
      );

      const transaction = await PaymentTransaction.findOneAndUpdate(
        { orderId: safeOrderId },
        {
          $set: {
            status: "paid",
            paymentId: safePaymentId,
            amount: payment.finalAmount ?? payment.amount,
            originalAmount: payment.originalAmount,
            discountAmount: payment.discountAmount,
            finalAmount: payment.finalAmount,
            planSnapshot: payment.planSnapshot || null,
            couponSnapshot,
            couponUsed: couponSnapshot?.code || "",
            "metadata.legacyPaymentId": payment._id,
           "metadata.entitlementId": entitlement?._id || null,
            "metadata.verifiedBy": safeVerifiedBy,
            "metadata.accessStartsAt": payment.accessStartsAt,
            "metadata.accessExpiresAt": payment.accessExpiresAt,
            "metadata.processedAt": new Date(),
            "metadata.coupon": couponSnapshot,
            "metadata.originalAmount": payment.originalAmount,
            "metadata.discountAmount": payment.discountAmount,
            "metadata.finalAmount": payment.finalAmount,
          },
        },
        {
          session,
          new: true,
        }
      );

      let couponRedemption = null;

      if (couponSnapshot?.code && couponSnapshot?.couponId) {
        couponRedemption = await redeemCouponAtomically({
          couponSnapshot,
          userId: payment.userId,
          planType: payment.planType,
          tournamentId: payment.tournamentId || null,
          paymentId: payment._id,
          transactionId: transaction?._id || null,
          entitlementId: entitlement?._id || null,
          source: "payment",
          metadata: {
            paymentId: payment._id,
            razorpayOrderId: payment.razorpayOrderId,
            razorpayPaymentId: safePaymentId,
            verifiedBy: safeVerifiedBy,
            accessStartsAt: payment.accessStartsAt || null,
            accessExpiresAt: payment.accessExpiresAt || null,
          },
          session,
        });

        await createBillingEvent({
          eventType: "coupon.redeemed_after_paid_payment",
          aggregateType: "coupon",
          aggregateId: couponSnapshot.couponId,
          userId: payment.userId,
          idempotencyKey: `coupon.paid_redeemed:${couponSnapshot.couponId}:${payment._id}`,
          payload: {
            couponId: couponSnapshot.couponId,
            code: couponSnapshot.code,
            planType: payment.planType,
            paymentId: payment._id,
            transactionId: transaction?._id || null,
            entitlementId: entitlement?._id || null,
            redemptionId: couponRedemption?._id || null,
            originalAmount: couponSnapshot.originalAmount,
            discountAmount: couponSnapshot.discountAmount,
            finalAmount: couponSnapshot.finalAmount,
          },
          session,
        });

        await PaymentTransaction.findOneAndUpdate(
          { orderId: safeOrderId },
          {
            $set: {
              "metadata.couponRedemptionId": couponRedemption?._id || null,
            },
          },
          { session }
        );
      }

      result = {
        alreadyProcessed: false,
        payment,
        entitlement,
        couponRedemption,
        access: buildAccessResponse(payment, entitlement),
      };
    });

    logger.info("Payment processed safely with entitlement", {
      razorpayOrderId: safeOrderId,
      razorpayPaymentId: safePaymentId,
      verifiedBy: safeVerifiedBy,
      alreadyProcessed: result?.alreadyProcessed || false,
      paymentId: result?.payment?._id,
      entitlementId: result?.entitlement?._id,
      couponRedemptionId: result?.couponRedemption?._id,
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