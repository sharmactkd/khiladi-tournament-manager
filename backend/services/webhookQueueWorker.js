import os from "os";
import WebhookEvent from "../models/webhookEvent.js";
import logger from "../utils/logger.js";
import { processRazorpayWebhookEvent } from "./razorpayWebhookProcessor.js";

const WORKER_ID = `${os.hostname()}_${process.pid}`;
const MAX_ATTEMPTS = Number(process.env.WEBHOOK_WORKER_MAX_ATTEMPTS || 8);
const BATCH_SIZE = Number(process.env.WEBHOOK_WORKER_BATCH_SIZE || 10);
const POLL_INTERVAL_MS = Number(process.env.WEBHOOK_WORKER_INTERVAL_MS || 5000);
const LOCK_TIMEOUT_MS = Number(process.env.WEBHOOK_WORKER_LOCK_TIMEOUT_MS || 60000);

let timer = null;
let running = false;

const getBackoffMs = (attempts) => {
  const safeAttempts = Math.max(Number(attempts || 0), 1);
  return Math.min(1000 * 2 ** safeAttempts, 15 * 60 * 1000);
};

const lockNextWebhookEvent = async () => {
  const now = new Date();
  const staleLockTime = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  return WebhookEvent.findOneAndUpdate(
    {
      provider: "razorpay",
      status: { $in: ["received", "queued", "failed"] },
      attempts: { $lt: MAX_ATTEMPTS },
      nextAttemptAt: { $lte: now },
      $or: [
        { lockedAt: null },
        { lockedAt: { $lte: staleLockTime } },
      ],
    },
    {
      $set: {
        status: "processing",
        lockedAt: now,
        lockedBy: WORKER_ID,
      },
      $inc: {
        attempts: 1,
      },
    },
    {
      new: true,
      sort: { createdAt: 1 },
    }
  );
};

const markProcessed = async (eventDoc, processed) => {
  const status = processed?.ignored ? "ignored" : "processed";

  await WebhookEvent.findByIdAndUpdate(eventDoc._id, {
    $set: {
      status,
      processedAt: new Date(),
      errorMessage: "",
      lockedAt: null,
      lockedBy: "",
    },
  });
};

const markFailed = async (eventDoc, error) => {
  const attempts = Number(eventDoc.attempts || 1);
  const permanentlyFailed = attempts >= MAX_ATTEMPTS;
  const nextAttemptAt = new Date(Date.now() + getBackoffMs(attempts));

  await WebhookEvent.findByIdAndUpdate(eventDoc._id, {
    $set: {
      status: permanentlyFailed ? "failed" : "queued",
      failedAt: new Date(),
      errorMessage: error.message || "Webhook processing failed",
      nextAttemptAt,
      lockedAt: null,
      lockedBy: "",
    },
  });
};

export const processWebhookQueueOnce = async () => {
  let processedCount = 0;

  for (let i = 0; i < BATCH_SIZE; i += 1) {
    const eventDoc = await lockNextWebhookEvent();

    if (!eventDoc) break;

    try {
      const signature = eventDoc.payload?.metadata?.razorpaySignature || "";

      const processed = await processRazorpayWebhookEvent({
        eventType: eventDoc.eventType,
        event: eventDoc.payload,
        signature,
      });

      await markProcessed(eventDoc, processed);

      processedCount += 1;
    } catch (error) {
      logger.error("Queued webhook processing failed", {
        webhookEventId: eventDoc._id,
        eventId: eventDoc.eventId,
        eventType: eventDoc.eventType,
        attempts: eventDoc.attempts,
        error: error.message,
        stack: error.stack,
      });

      await markFailed(eventDoc, error);
    }
  }

  return { processedCount };
};

export const startWebhookQueueWorker = () => {
  if (process.env.WEBHOOK_WORKER_ENABLED === "false") {
    logger.info("Webhook queue worker disabled by env");
    return;
  }

  if (timer) return;

  timer = setInterval(async () => {
    if (running) return;

    running = true;

    try {
      await processWebhookQueueOnce();
    } catch (error) {
      logger.error("Webhook queue worker loop failed", {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      running = false;
    }
  }, POLL_INTERVAL_MS);

  logger.info("Webhook queue worker started", {
    workerId: WORKER_ID,
    pollIntervalMs: POLL_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    maxAttempts: MAX_ATTEMPTS,
  });
};

export const stopWebhookQueueWorker = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  logger.info("Webhook queue worker stopped", {
    workerId: WORKER_ID,
  });
};