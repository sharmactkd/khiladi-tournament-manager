import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import {
  getPlanConfig,
  getPaymentAccessFields,
  hasActiveAccess,
} from "../services/subscriptionService.js";
import Payment from "../models/payment.js";
import Tournament from "../models/tournament.js";

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

export const createPaymentOrder = async (req, res) => {
  let userId;
  let planType;
  let tournamentId;

  try {
    userId = getUserId(req);
    ({ planType, tournamentId } = req.body || {});

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Razorpay keys are not configured",
      });
    }

    if (!getPlanConfig(planType)) {
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

      const existingAccess = await hasActiveAccess({
        userId,
        tournamentId,
      });

      if (existingAccess.hasAccess) {
        return res.status(200).json({
          success: true,
          alreadyPaid: true,
          hasAccess: true,
          message: "You already have premium access for this tournament",
        });
      }
    }

    const selectedPlan = getPlanConfig(planType);
    const amountInRupees = selectedPlan.amount;
    const amountInPaise = amountInRupees * 100;

    const razorpay = getRazorpayInstance();
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
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
      amount: amountInRupees,
      currency: "INR",
      razorpayOrderId: order.id,
      status: "created",
      accessType: selectedPlan.accessType,
    });

    logger.info("Payment order created", {
      paymentId: payment._id,
      userId,
      tournamentId,
      planType,
      razorpayOrderId: order.id,
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
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
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
      payment.status = "failed";
      payment.razorpayPaymentId = razorpay_payment_id;
      payment.razorpaySignature = razorpay_signature;
      await payment.save();

      logger.warn("Invalid payment signature", {
        paymentId: payment._id,
        userId,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
      });

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
  String(razorpayPayment.currency || "").toUpperCase() === "INR";

const isValidRazorpayOrder =
  razorpayOrder &&
  razorpayOrder.id === razorpay_order_id &&
  Number(razorpayOrder.amount) === expectedAmountInPaise &&
  String(razorpayOrder.currency || "").toUpperCase() === "INR";

if (!isValidRazorpayPayment || !isValidRazorpayOrder) {
  payment.status = "failed";
  payment.razorpayPaymentId = razorpay_payment_id;
  payment.razorpaySignature = razorpay_signature;
  await payment.save();

  logger.warn("Razorpay server verification failed", {
    paymentId: payment._id,
    userId,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpayPaymentStatus: razorpayPayment?.status,
    razorpayPaymentAmount: razorpayPayment?.amount,
    expectedAmountInPaise,
    razorpayPaymentCurrency: razorpayPayment?.currency,
    razorpayOrderAmount: razorpayOrder?.amount,
    razorpayOrderCurrency: razorpayOrder?.currency,
  });

  return res.status(400).json({
    success: false,
    message: "Payment could not be verified with Razorpay",
  });
}

const orderNotes = razorpayOrder.notes || {};

if (
  orderNotes.userId &&
  String(orderNotes.userId) !== String(userId)
) {
  payment.status = "failed";
  payment.razorpayPaymentId = razorpay_payment_id;
  payment.razorpaySignature = razorpay_signature;
  await payment.save();

  logger.warn("Razorpay order user mismatch", {
    paymentId: payment._id,
    userId,
    orderUserId: orderNotes.userId,
    razorpayOrderId: razorpay_order_id,
  });

  return res.status(400).json({
    success: false,
    message: "Payment order ownership mismatch",
  });
}

if (
  payment.planType === "single" &&
  orderNotes.tournamentId &&
  String(orderNotes.tournamentId) !== String(payment.tournamentId)
) {
  payment.status = "failed";
  payment.razorpayPaymentId = razorpay_payment_id;
  payment.razorpaySignature = razorpay_signature;
  await payment.save();

  logger.warn("Razorpay order tournament mismatch", {
    paymentId: payment._id,
    userId,
    orderTournamentId: orderNotes.tournamentId,
    paymentTournamentId: payment.tournamentId,
    razorpayOrderId: razorpay_order_id,
  });

  return res.status(400).json({
    success: false,
    message: "Payment tournament mismatch",
  });
}

    const accessFields = getPaymentAccessFields(payment.planType, new Date());

    payment.status = "paid";
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.accessType = accessFields.accessType;
    payment.accessStartsAt = accessFields.accessStartsAt;
    payment.accessExpiresAt = accessFields.accessExpiresAt;

    await payment.save();

    logger.info("Payment verified successfully", {
      paymentId: payment._id,
      userId,
      tournamentId: payment.tournamentId,
      planType: payment.planType,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      access: {
        planType: payment.planType,
        accessType: payment.accessType,
        tournamentId: payment.tournamentId,
        accessStartsAt: payment.accessStartsAt,
        accessExpiresAt: payment.accessExpiresAt,
      },
    });
  } catch (error) {
    logger.error("Verify payment failed", {
      error: error.message,
      stack: error.stack,
      userId,
      paymentId: payment?._id,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to verify payment",
    });
  }
};

export const getMyAccessStatus = async (req, res) => {
  let userId;
  let tournamentId;

  try {
    userId = getUserId(req);
    ({ tournamentId } = req.query || {});

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const access = await hasActiveAccess({
      userId,
      tournamentId,
    });

    if (access.hasAccess) {
      return res.status(200).json({
        success: true,
        hasAccess: true,
        accessType: access.accessType,
        planType: access.planType,
        tournamentId: access.tournamentId,
        accessStartsAt: access.accessStartsAt,
        accessExpiresAt: access.accessExpiresAt,
      });
    }

    return res.status(200).json({
      success: true,
      hasAccess: false,
      paymentRequired: true,
      reason: access.reason,
      message: "Premium access required",
    });
  } catch (error) {
    logger.error("Get payment access status failed", {
      error: error.message,
      stack: error.stack,
      userId,
      tournamentId,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to check access status",
    });
  }
};
