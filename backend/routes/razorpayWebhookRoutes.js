import express from "express";
import crypto from "crypto";
import Payment from "../models/payment.js";
import WebhookEvent from "../models/webhookEvent.js";
import logger from "../utils/logger.js";
import processPaidPayment from "../services/paymentProcessingService.js";
import processPaymentStatusUpdate from "../services/paymentStatusService.js";

const router = express.Router();

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

const getEntity = (event, entityName) => {
  return event?.payload?.[entityName]?.entity || {};
};

const getRazorpayEventId = (event) => {
  return (
    event?.id ||
    getEntity(event, "payment")?.id ||
    getEntity(event, "order")?.id ||
    getEntity(event, "refund")?.id ||
    getEntity(event, "dispute")?.id ||
    `razorpay_${event?.event || "unknown"}_${Date.now()}`
  );
};

const markWebhookEvent = async (webhookEventId, update) => {
  try {
    await WebhookEvent.findByIdAndUpdate(webhookEventId, update);
  } catch (error) {
    logger.error("Failed to update webhook event status", {
      webhookEventId,
      error: error.message,
      stack: error.stack,
    });
  }
};

const getPaymentByOrderId = async (orderId) => {
  if (!orderId) return null;
  return Payment.findOne({ razorpayOrderId: orderId });
};

const validateCapturedPayment = ({ payment, paymentEntity }) => {
  const expectedAmountInPaise = Number(payment.amount || 0) * 100;

  return (
    paymentEntity.id &&
    paymentEntity.order_id === payment.razorpayOrderId &&
    paymentEntity.status === "captured" &&
    paymentEntity.captured === true &&
    Number(paymentEntity.amount) === expectedAmountInPaise &&
    String(paymentEntity.currency || "").toUpperCase() ===
      String(payment.currency || "INR").toUpperCase()
  );
};

const validateNotes = ({ payment, paymentEntity }) => {
  const paymentNotes = paymentEntity.notes || {};

  if (paymentNotes.userId && String(paymentNotes.userId) !== String(payment.userId)) {
    return {
      valid: false,
      message: "Webhook user mismatch",
    };
  }

  if (
    payment.planType === "single" &&
    paymentNotes.tournamentId &&
    String(paymentNotes.tournamentId) !== String(payment.tournamentId)
  ) {
    return {
      valid: false,
      message: "Webhook tournament mismatch",
    };
  }

  return {
    valid: true,
    message: "",
  };
};

const handlePaymentCaptured = async ({ paymentEntity, signature }) => {
  if (!paymentEntity?.order_id || !paymentEntity?.id) {
    const error = new Error("Invalid payment captured payload");
    error.statusCode = 400;
    throw error;
  }

  const payment = await getPaymentByOrderId(paymentEntity.order_id);

  if (!payment) {
    const error = new Error("Payment order not found");
    error.statusCode = 404;
    throw error;
  }

  const isValidWebhookPayment = validateCapturedPayment({
    payment,
    paymentEntity,
  });

  if (!isValidWebhookPayment) {
    const error = new Error("Webhook payment validation failed");
    error.statusCode = 400;
    throw error;
  }

  const noteValidation = validateNotes({
    payment,
    paymentEntity,
  });

  if (!noteValidation.valid) {
    const error = new Error(noteValidation.message);
    error.statusCode = 400;
    throw error;
  }

  return processPaidPayment({
    razorpayOrderId: paymentEntity.order_id,
    razorpayPaymentId: paymentEntity.id,
    razorpaySignature: signature,
    verifiedBy: "razorpay_webhook_payment_captured",
  });
};

const handlePaymentAuthorized = async ({ paymentEntity }) => {
  if (!paymentEntity?.order_id || !paymentEntity?.id) {
    const error = new Error("Invalid payment authorized payload");
    error.statusCode = 400;
    throw error;
  }

  return processPaymentStatusUpdate({
    razorpayOrderId: paymentEntity.order_id,
    razorpayPaymentId: paymentEntity.id,
    status: "authorized",
    source: "razorpay_webhook_payment_authorized",
    note: "Payment authorized by Razorpay",
  });
};

const handlePaymentFailed = async ({ paymentEntity }) => {
  if (!paymentEntity?.order_id && !paymentEntity?.id) {
    const error = new Error("Invalid payment failed payload");
    error.statusCode = 400;
    throw error;
  }

  return processPaymentStatusUpdate({
    razorpayOrderId: paymentEntity.order_id,
    razorpayPaymentId: paymentEntity.id,
    status: "failed",
    source: "razorpay_webhook_payment_failed",
    note: paymentEntity.error_description || "Payment failed at Razorpay",
    metadata: {
      errorCode: paymentEntity.error_code || "",
      errorDescription: paymentEntity.error_description || "",
      errorSource: paymentEntity.error_source || "",
      errorStep: paymentEntity.error_step || "",
      errorReason: paymentEntity.error_reason || "",
    },
  });
};

const handlePaymentRefunded = async ({ paymentEntity }) => {
  if (!paymentEntity?.order_id && !paymentEntity?.id) {
    const error = new Error("Invalid payment refunded payload");
    error.statusCode = 400;
    throw error;
  }

  const refundStatus =
    Number(paymentEntity.amount_refunded || 0) > 0 &&
    Number(paymentEntity.amount_refunded || 0) < Number(paymentEntity.amount || 0)
      ? "partially_refunded"
      : "refunded";

  return processPaymentStatusUpdate({
    razorpayOrderId: paymentEntity.order_id,
    razorpayPaymentId: paymentEntity.id,
    status: refundStatus,
    source: "razorpay_webhook_payment_refunded",
    note: "Payment refund updated by Razorpay",
    metadata: {
      amountRefunded: paymentEntity.amount_refunded || 0,
      refundStatus,
    },
  });
};

const handleRefundProcessed = async ({ refundEntity }) => {
  if (!refundEntity?.payment_id) {
    const error = new Error("Invalid refund processed payload");
    error.statusCode = 400;
    throw error;
  }

  return processPaymentStatusUpdate({
    razorpayPaymentId: refundEntity.payment_id,
    status: "refunded",
    source: "razorpay_webhook_refund_processed",
    note: "Refund processed by Razorpay",
    metadata: {
      refundId: refundEntity.id || "",
      refundAmount: refundEntity.amount || 0,
      refundStatus: refundEntity.status || "",
    },
  });
};

const handleDisputeCreated = async ({ disputeEntity }) => {
  const paymentId = disputeEntity?.payment_id || disputeEntity?.paymentId || "";

  if (!paymentId) {
    const error = new Error("Invalid dispute payload");
    error.statusCode = 400;
    throw error;
  }

  return processPaymentStatusUpdate({
    razorpayPaymentId: paymentId,
    status: "disputed",
    source: "razorpay_webhook_dispute_created",
    note: "Payment dispute created",
    metadata: {
      disputeId: disputeEntity.id || "",
      disputeStatus: disputeEntity.status || "",
      disputeReason: disputeEntity.reason || "",
    },
  });
};

const handleOrderPaid = async ({ orderEntity }) => {
  if (!orderEntity?.id) {
    const error = new Error("Invalid order paid payload");
    error.statusCode = 400;
    throw error;
  }

  return processPaymentStatusUpdate({
    razorpayOrderId: orderEntity.id,
    status: "captured",
    source: "razorpay_webhook_order_paid",
    note: "Razorpay order marked paid",
  });
};

const processRazorpayWebhookEvent = async ({ eventType, event, signature }) => {
  const paymentEntity = getEntity(event, "payment");
  const refundEntity = getEntity(event, "refund");
  const disputeEntity = getEntity(event, "dispute");
  const orderEntity = getEntity(event, "order");

  switch (eventType) {
    case "payment.captured":
      return handlePaymentCaptured({ paymentEntity, signature });

    case "payment.authorized":
      return handlePaymentAuthorized({ paymentEntity });

    case "payment.failed":
      return handlePaymentFailed({ paymentEntity });

    case "payment.refunded":
      return handlePaymentRefunded({ paymentEntity });

    case "refund.processed":
      return handleRefundProcessed({ refundEntity });

    case "payment.dispute.created":
    case "dispute.created":
      return handleDisputeCreated({ disputeEntity });

    case "order.paid":
      return handleOrderPaid({ orderEntity });

    default:
      return {
        ignored: true,
        eventType,
      };
  }
};

router.post("/", async (req, res) => {
  let event;
  let webhookEventDoc = null;

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

    const eventType = event?.event || "unknown";
    const paymentEntity = getEntity(event, "payment");
    const refundEntity = getEntity(event, "refund");
    const disputeEntity = getEntity(event, "dispute");
    const orderEntity = getEntity(event, "order");
    const eventId = getRazorpayEventId(event);

    try {
      webhookEventDoc = await WebhookEvent.create({
        provider: "razorpay",
        eventId,
        eventType,
        status: "processing",
        orderId:
          paymentEntity?.order_id ||
          orderEntity?.id ||
          "",
        paymentId:
          paymentEntity?.id ||
          refundEntity?.payment_id ||
          disputeEntity?.payment_id ||
          "",
        payload: event,
      });
    } catch (error) {
      if (error?.code === 11000) {
        logger.info("Duplicate Razorpay webhook ignored", {
          eventId,
          eventType,
        });

        return res.status(200).json({
          success: true,
          duplicate: true,
          message: "Duplicate webhook ignored",
        });
      }

      throw error;
    }

    const processed = await processRazorpayWebhookEvent({
      eventType,
      event,
      signature,
    });

    if (processed?.ignored) {
      await markWebhookEvent(webhookEventDoc._id, {
        status: "ignored",
        processedAt: new Date(),
      });

      return res.status(200).json({
        success: true,
        ignored: true,
        event: eventType,
      });
    }

    await markWebhookEvent(webhookEventDoc._id, {
      status: "processed",
      processedAt: new Date(),
    });

    logger.info("Razorpay webhook processed", {
      eventType,
      eventId,
      paymentId: processed?.payment?._id,
      userId: processed?.payment?.userId,
      planType: processed?.payment?.planType,
      alreadyProcessed: processed?.alreadyProcessed || false,
    });

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error) {
    if (webhookEventDoc?._id) {
      await markWebhookEvent(webhookEventDoc._id, {
        status: "failed",
        failedAt: new Date(),
        errorMessage: error.message,
      });
    }

    logger.error("Razorpay webhook failed", {
      error: error.message,
      stack: error.stack,
      event: event?.event,
    });

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Webhook processing failed",
    });
  }
});

export default router;