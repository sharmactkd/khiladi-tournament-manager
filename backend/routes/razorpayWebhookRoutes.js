import express from "express";
import crypto from "crypto";
import WebhookEvent from "../models/webhookEvent.js";
import logger from "../utils/logger.js";

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

const getEntityIdForEvent = (event) => {
  const paymentEntity = getEntity(event, "payment");
  const orderEntity = getEntity(event, "order");
  const refundEntity = getEntity(event, "refund");
  const disputeEntity = getEntity(event, "dispute");

  return (
    paymentEntity?.id ||
    orderEntity?.id ||
    refundEntity?.id ||
    refundEntity?.payment_id ||
    disputeEntity?.id ||
    disputeEntity?.payment_id ||
    "unknown"
  );
};

const getRazorpayEventId = (event) => {
  const eventType = event?.event || "unknown";
  const providerEventId = event?.id || "";
  const entityId = getEntityIdForEvent(event);

  if (providerEventId) {
    return `${eventType}:${providerEventId}`;
  }

  return `${eventType}:${entityId}`;
};

router.post("/", async (req, res) => {
  let event = null;

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
      await WebhookEvent.create({
        provider: "razorpay",
        eventId,
        eventType,
        status: "queued",
        attempts: 0,
        nextAttemptAt: new Date(),
        orderId: paymentEntity?.order_id || orderEntity?.id || "",
        paymentId:
          paymentEntity?.id ||
          refundEntity?.payment_id ||
          disputeEntity?.payment_id ||
          "",
        payload: {
          ...event,
          metadata: {
            ...(event.metadata || {}),
            razorpaySignature: signature,
          },
        },
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
          queued: false,
          message: "Duplicate webhook ignored",
        });
      }

      throw error;
    }

    logger.info("Razorpay webhook queued", {
      eventType,
      eventId,
    });

    return res.status(200).json({
      success: true,
      queued: true,
      message: "Webhook accepted",
    });
  } catch (error) {
    logger.error("Razorpay webhook queue failed", {
      error: error.message,
      stack: error.stack,
      event: event?.event,
    });

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Webhook queue failed",
    });
  }
});

export default router;