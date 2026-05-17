import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import {
  getPlanConfig,
  getPaymentAccessFields,
  hasActiveAccess,
} from "../services/subscriptionService.js";
import hasPremiumAccess from "../utils/hasPremiumAccess.js";
import Payment from "../models/payment.js";
import Tournament from "../models/tournament.js";
import User from "../models/user.js";
import PlatformSettings from "../models/platformSettings.js";
import processPaidPayment from "../services/paymentProcessingService.js";
import PaymentTransaction from "../models/paymentTransaction.js";


const getUserId = (req) => req.user?._id || req.user?.id || req.user?.userId;

const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys are not configured");
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const buildPlanSnapshot = ({ planType, selectedPlan, amountInRupees, amountInPaise, currency }) => {
  return {
    planType,
    label: selectedPlan.label || planType,
    amount: amountInRupees,
    amountInPaise,
    currency,
    accessType: selectedPlan.accessType,
    durationDays:
      selectedPlan.durationDays === null || selectedPlan.durationDays === undefined
        ? null
        : Number(selectedPlan.durationDays),
    features: Array.isArray(selectedPlan.features) ? selectedPlan.features : [],
    version: Number(selectedPlan.version || 1),
    source: selectedPlan.source || "platform_settings",
  };
};

const getInitialAccessLifecycle = (planType) => {
  if (planType === "single") return "single_tournament_lifetime";
  if (planType === "lifetime") return "lifetime";
  return "fixed_duration";
};
export const createPaymentOrder = async (req, res) => {
  let userId;
  let planType;
  let tournamentId;

  try {
    userId = getUserId(req);
    ({ planType, tournamentId } = req.body || {});

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized user" });
    }

    const settings = await PlatformSettings.getSettings();

    if (!settings.paymentsEnabled) {
      return res.status(403).json({
        success: false,
        message: "Payments are currently disabled",
      });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Razorpay keys are not configured",
      });
    }

    const selectedPlan = await getPlanConfig(planType);

    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment plan",
      });
    }

    if (planType === "single") {
      if (!tournamentId || !mongoose.Types.ObjectId.isValid(tournamentId)) {
        return res.status(400).json({
          success: false,
          message: "Valid tournamentId is required for single tournament plan",
        });
      }

      const tournament = await Tournament.findOne({
        _id: tournamentId,
        createdBy: userId,
      }).lean();

      if (!tournament) {
        return res.status(403).json({
          success: false,
          message: "You can only buy premium access for your own tournament",
        });
      }

      const existingAccess = await hasActiveAccess({ userId, tournamentId });

      if (existingAccess.hasAccess) {
        return res.status(200).json({
          success: true,
          alreadyPaid: true,
          hasAccess: true,
          message: "You already have premium access for this tournament",
        });
      }
    }

    const amountInRupees = Number(selectedPlan.amount || 0);
    const amountInPaise = amountInRupees * 100;
    const currency = selectedPlan.currency || settings.defaultCurrency || "INR";

    const planSnapshot = buildPlanSnapshot({
      planType,
      selectedPlan,
      amountInRupees,
      amountInPaise,
      currency,
    });

    const razorpay = getRazorpayInstance();

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency,
      receipt: `khiladi_${Date.now()}`,
      notes: {
        userId: String(userId),
        planType,
        tournamentId: planType === "single" ? String(tournamentId) : "",
      },
    });

   const payment = await Payment.create({
  userId,
  tournamentId: planType === "single" ? tournamentId : null,
  planType,
  planSnapshot,
  amount: amountInRupees,
  currency,
  razorpayOrderId: order.id,
  status: "created",
  accessType: selectedPlan.accessType,
  accessLifecycle: getInitialAccessLifecycle(planType),
  gateway: "razorpay",
  statusHistory: [
        {
          status: "created",
          changedAt: new Date(),
          source: "create_order",
          note: "Razorpay order created",
        },
      ],
    });

    await PaymentTransaction.create({
      userId,
      amount: amountInRupees,
      currency,
      paymentGateway: "razorpay",
      orderId: order.id,
      planType,
      planSnapshot,
      status: "created",
      metadata: {
        legacyPaymentId: payment._id,
        tournamentId: planType === "single" ? tournamentId : null,
      },
    });

    logger.info("Payment order created", {
      paymentId: payment._id,
      userId,
      tournamentId,
      planType,
      razorpayOrderId: order.id,
      planSnapshot,
    });

    return res.status(201).json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      paymentId: payment._id,
      plan: {
        planType,
        amount: amountInRupees,
        accessType: selectedPlan.accessType,
        durationDays: selectedPlan.durationDays,
        features: selectedPlan.features || [],
        version: planSnapshot.version,
      },
    });
  } catch (error) {
    logger.error("Create payment order failed", {
      error: error.message,
      stack: error.stack,
      userId,
      planType,
      tournamentId,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to create payment order",
    });
  }
};
export const verifyPayment = async (req, res) => {
  let userId;
  let payment;

  try {
    userId = getUserId(req);

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized user" });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay verification data",
      });
    }

    payment = await Payment.findOne({
      razorpayOrderId: razorpay_order_id,
      userId,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment order not found",
      });
    }

    if (payment.status === "paid") {
      return res.status(200).json({
        success: true,
        alreadyProcessed: true,
        message: "Payment already verified",
        access: {
          planType: payment.planType,
          accessType: payment.accessType,
          tournamentId: payment.tournamentId,
          accessStartsAt: payment.accessStartsAt,
          accessExpiresAt: payment.accessExpiresAt,
        },
      });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await Payment.findOneAndUpdate(
        {
          razorpayOrderId: razorpay_order_id,
          userId,
          status: { $ne: "paid" },
        },
        {
          $set: {
            status: "failed",
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
          },
          $push: {
            statusHistory: {
              status: "failed",
              changedAt: new Date(),
              source: "frontend_verify",
              note: "Invalid Razorpay signature",
            },
          },
        }
      );

      await PaymentTransaction.findOneAndUpdate(
        { orderId: razorpay_order_id },
        {
          $set: {
            status: "failed",
            paymentId: razorpay_payment_id,
            "metadata.signatureError": true,
          },
        }
      );

      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    const razorpay = getRazorpayInstance();

    const [razorpayPayment, razorpayOrder] = await Promise.all([
      razorpay.payments.fetch(razorpay_payment_id),
      razorpay.orders.fetch(razorpay_order_id),
    ]);

    const expectedAmountInPaise = Number(payment.amount || 0) * 100;

    const isValidRazorpayPayment =
      razorpayPayment &&
      razorpayPayment.id === razorpay_payment_id &&
      razorpayPayment.order_id === razorpay_order_id &&
      razorpayPayment.status === "captured" &&
      Number(razorpayPayment.amount) === expectedAmountInPaise &&
      String(razorpayPayment.currency || "").toUpperCase() ===
        String(payment.currency || "INR").toUpperCase();

    const isValidRazorpayOrder =
      razorpayOrder &&
      razorpayOrder.id === razorpay_order_id &&
      Number(razorpayOrder.amount) === expectedAmountInPaise;

    if (!isValidRazorpayPayment || !isValidRazorpayOrder) {
      await Payment.findOneAndUpdate(
        {
          razorpayOrderId: razorpay_order_id,
          userId,
          status: { $ne: "paid" },
        },
        {
          $set: {
            status: "failed",
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
          },
          $push: {
            statusHistory: {
              status: "failed",
              changedAt: new Date(),
              source: "frontend_verify",
              note: "Payment could not be verified with Razorpay",
            },
          },
        }
      );

      await PaymentTransaction.findOneAndUpdate(
        { orderId: razorpay_order_id },
        {
          $set: {
            status: "failed",
            paymentId: razorpay_payment_id,
            "metadata.serverVerificationFailed": true,
          },
        }
      );

      return res.status(400).json({
        success: false,
        message: "Payment could not be verified with Razorpay",
      });
    }

    const processed = await processPaidPayment({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      verifiedBy: "frontend_verify_confirmed_by_razorpay",
    });

    return res.status(200).json({
      success: true,
      alreadyProcessed: processed.alreadyProcessed,
      message: processed.alreadyProcessed
        ? "Payment already verified"
        : "Payment verified successfully",
      access: processed.access,
    });
  } catch (error) {
    logger.error("Verify payment failed", {
      error: error.message,
      stack: error.stack,
      userId,
      paymentId: payment?._id,
    });

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to verify payment",
    });
  }
};

export const getAccessStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { tournamentId = null, feature = null } = req.query || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        hasAccess: false,
        message: "Unauthorized user",
      });
    }

    const access = await hasPremiumAccess({
      userId,
      tournamentId,
      feature,
    });

    return res.json({
      success: true,
      hasAccess: access.hasAccess,
      reason: access.reason,
      source: access.source,
      accessType: access.accessType,
      planType: access.planType,
      paymentId: access.paymentId,
      tournamentId: access.tournamentId || tournamentId || null,
      feature: access.feature || feature || null,
      featureAllowed: access.featureAllowed,
      expiresAt: access.expiresAt,
      accessPriority: access.accessPriority,
      entitlementId: access.entitlementId || null,
      paymentRequired: !access.hasAccess,
    });
  } catch (error) {
    logger.error("Access status check failed", {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      tournamentId: req.query?.tournamentId,
      feature: req.query?.feature,
    });

    return res.status(500).json({
      success: false,
      hasAccess: false,
      paymentRequired: true,
      message: "Failed to check premium access",
    });
  }
};
export const getMyAccessStatus = getAccessStatus;

export const getPaymentStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { orderId = "", paymentId = "" } = req.query || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    if (!orderId && !paymentId) {
      return res.status(400).json({
        success: false,
        message: "orderId or paymentId is required",
      });
    }

    const query = {
      userId,
    };

    if (orderId) {
      query.razorpayOrderId = String(orderId).trim();
    }

    if (paymentId) {
      query.razorpayPaymentId = String(paymentId).trim();
    }

    const payment = await Payment.findOne(query).lean();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const access = await hasPremiumAccess({
      userId,
      tournamentId: payment.tournamentId || req.query?.tournamentId || null,
      feature: req.query?.feature || null,
    });

    return res.json({
      success: true,
      payment: {
        id: payment._id,
        status: payment.status,
        planType: payment.planType,
        accessType: payment.accessType,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        tournamentId: payment.tournamentId,
        accessStartsAt: payment.accessStartsAt,
        accessExpiresAt: payment.accessExpiresAt,
      },
      access: {
        hasAccess: access.hasAccess,
        reason: access.reason,
        source: access.source,
        accessType: access.accessType,
        planType: access.planType,
        entitlementId: access.entitlementId || null,
        expiresAt: access.expiresAt || null,
      },
      final: payment.status === "paid" && access.hasAccess === true,
      retryRecommended:
        ["created", "attempted", "authorized", "captured"].includes(payment.status) &&
        !access.hasAccess,
    });
  } catch (error) {
    logger.error("Get payment status failed", {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      query: req.query,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to get payment status",
    });
  }
};