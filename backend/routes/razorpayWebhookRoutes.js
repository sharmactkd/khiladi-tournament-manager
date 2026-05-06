import express from "express";
import crypto from "crypto";
import Payment from "../models/payment.js";
import logger from "../utils/logger.js";

const router = express.Router();

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

const verifyWebhookSignature = ({ rawBody, signature }) => {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured");
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  return expectedSignature === signature;
};

router.post("/", async (req, res) => {
  let event;

  try {
    const signature = req.headers["razorpay_signature"];

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay webhook signature",
      });
    }

    const rawBody = req.body;

    const isValidSignature = verifyWebhookSignature({
      rawBody,
      signature,
    });

    if (!isValidSignature) {
      logger.warn("Invalid Razorpay webhook signature");
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    event = JSON.parse(rawBody.toString("utf8"));

    if (event?.event !== "payment.captured") {
      return res.status(200).json({
        success: true,
        ignored: true,
        event: event?.event || "unknown",
      });
    }

    const paymentEntity = event?.payload?.payment?.entity;

    if (!paymentEntity?.order_id || !paymentEntity?.id) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment captured payload",
      });
    }

    const payment = await Payment.findOne({
      razorpayOrderId: paymentEntity.order_id,
    });

    if (!payment) {
      logger.warn("Webhook payment order not found", {
        razorpayOrderId: paymentEntity.order_id,
        razorpayPaymentId: paymentEntity.id,
      });

      return res.status(404).json({
        success: false,
        message: "Payment order not found",
      });
    }

    if (payment.status === "paid") {
      logger.info("Webhook ignored already paid payment", {
        paymentId: payment._id,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
      });

      return res.status(200).json({
        success: true,
        message: "Payment already processed",
      });
    }

    const now = new Date();

    payment.status = "paid";
    payment.razorpayPaymentId = paymentEntity.id;
    payment.razorpaySignature = signature;
    payment.accessStartsAt = now;
    payment.accessExpiresAt = getAccessExpiry(payment.planType, now);

    await payment.save();

    logger.info("Payment marked paid via Razorpay webhook", {
      paymentId: payment._id,
      userId: payment.userId,
      tournamentId: payment.tournamentId,
      planType: payment.planType,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
    });

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error) {
    logger.error("Razorpay webhook failed", {
      error: error.message,
      stack: error.stack,
      event: event?.event,
    });

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
});

export default router;