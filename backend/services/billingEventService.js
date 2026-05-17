import BillingEvent from "../models/billingEvent.js";
import logger from "../utils/logger.js";

const normalizeString = (value) => String(value || "").trim();

export const createBillingEvent = async ({
  eventType,
  aggregateType,
  aggregateId = null,
  userId = null,
  idempotencyKey,
  payload = {},
  session = null,
}) => {
  const safeEventType = normalizeString(eventType);
  const safeAggregateType = normalizeString(aggregateType);
  const safeIdempotencyKey = normalizeString(idempotencyKey);

  if (!safeEventType) {
    throw new Error("eventType is required");
  }

  if (!safeAggregateType) {
    throw new Error("aggregateType is required");
  }

  if (!safeIdempotencyKey) {
    throw new Error("idempotencyKey is required");
  }

  try {
    const created = await BillingEvent.create(
      [
        {
          eventType: safeEventType,
          aggregateType: safeAggregateType,
          aggregateId,
          userId,
          idempotencyKey: safeIdempotencyKey,
          payload,
          status: "pending",
          nextAttemptAt: new Date(),
        },
      ],
      session ? { session } : undefined
    );

    return created[0];
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await BillingEvent.findOne({
        idempotencyKey: safeIdempotencyKey,
      }).session(session);

      if (existing) return existing;
    }

    logger.error("Create billing event failed", {
      eventType: safeEventType,
      aggregateType: safeAggregateType,
      aggregateId,
      userId,
      idempotencyKey: safeIdempotencyKey,
      error: error.message,
    });

    throw error;
  }
};

export const markBillingEventProcessed = async ({ eventId, result = {} }) => {
  return BillingEvent.findByIdAndUpdate(
    eventId,
    {
      $set: {
        status: "processed",
        processedAt: new Date(),
        errorMessage: "",
        "payload.processingResult": result,
      },
    },
    { new: true }
  );
};

export const markBillingEventFailed = async ({ eventId, error, retryAt = null }) => {
  return BillingEvent.findByIdAndUpdate(
    eventId,
    {
      $set: {
        status: "failed",
        failedAt: new Date(),
        errorMessage: error?.message || "Billing event failed",
        nextAttemptAt: retryAt || new Date(Date.now() + 60 * 1000),
      },
    },
    { new: true }
  );
};