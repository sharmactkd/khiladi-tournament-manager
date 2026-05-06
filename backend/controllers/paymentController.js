import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import Payment from "../models/payment.js";
import Tournament from "../models/tournament.js";

const PLANS = {
  single: {
    amount: 1000,
    accessType: "tournament",
  },
  six_months: {
    amount: 2000,
    accessType: "unlimited",
  },
  one_year: {
    amount: 3000,
    accessType: "unlimited",
  },
};

const getUserId = (req) => req.user?._id || req.user?.id || req.user?.userId;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

const getAccessExpiry = (planType, now) => {
  if (planType === "six_months") return addMonths(now, 6);
  if (planType === "one_year") return addMonths(now, 12);
  return null;
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

    if (!PLANS[planType]) {
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

      const existingAccess = await Payment.findOne({
        userId,
        tournamentId,
        status: "paid",
        accessType: "tournament",
      }).lean();

      if (existingAccess) {
        return res.status(200).json({
          success: true,
          alreadyPaid: true,
          hasAccess: true,
          message: "You already have premium access for this tournament",
        });
      }
    }

    const selectedPlan = PLANS[planType];
    const amountInRupees = selectedPlan.amount;
    const amountInPaise = amountInRupees * 100;

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

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

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

    const now = new Date();

    payment.status = "paid";
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.accessStartsAt = now;
    payment.accessExpiresAt = getAccessExpiry(payment.planType, now);

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

    const now = new Date();

    const unlimitedAccess = await Payment.findOne({
      userId,
      status: "paid",
      accessType: "unlimited",
      accessStartsAt: { $ne: null },
      accessExpiresAt: { $gt: now },
    }).sort({ accessExpiresAt: -1 });

    if (unlimitedAccess) {
      return res.status(200).json({
        success: true,
        hasAccess: true,
        accessType: "unlimited",
        planType: unlimitedAccess.planType,
        accessStartsAt: unlimitedAccess.accessStartsAt,
        accessExpiresAt: unlimitedAccess.accessExpiresAt,
      });
    }

    if (tournamentId && mongoose.Types.ObjectId.isValid(tournamentId)) {
      const tournamentAccess = await Payment.findOne({
        userId,
        tournamentId,
        status: "paid",
        accessType: "tournament",
      }).sort({ createdAt: -1 });

      if (tournamentAccess) {
        return res.status(200).json({
          success: true,
          hasAccess: true,
          accessType: "tournament",
          planType: tournamentAccess.planType,
          tournamentId: tournamentAccess.tournamentId,
          accessStartsAt: tournamentAccess.accessStartsAt,
          accessExpiresAt: tournamentAccess.accessExpiresAt,
        });
      }
    }

    return res.status(200).json({
      success: true,
      hasAccess: false,
      paymentRequired: true,
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