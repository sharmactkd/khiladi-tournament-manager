import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["razorpay", "stripe"],
      required: true,
      index: true,
    },

    eventId: {
      type: String,
      required: true,
      trim: true,
    },

    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "received",
        "queued",
        "processing",
        "processed",
        "failed",
        "ignored",
      ],
      default: "received",
      index: true,
    },

    attempts: {
      type: Number,
      default: 0,
      index: true,
    },

    lockedAt: {
      type: Date,
      default: null,
      index: true,
    },

    lockedBy: {
      type: String,
      default: "",
      trim: true,
    },

    nextAttemptAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    orderId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    paymentId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    errorMessage: {
      type: String,
      default: "",
      trim: true,
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

webhookEventSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 60 * 60 * 24 * 180,
    partialFilterExpression: {
      status: { $in: ["processed", "ignored"] },
    },
  }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

webhookEventSchema.index({
  provider: 1,
  status: 1,
  nextAttemptAt: 1,
  createdAt: 1,
});

webhookEventSchema.index({
  provider: 1,
  status: 1,
  lockedAt: 1,
});

webhookEventSchema.index({ provider: 1, eventType: 1, createdAt: -1 });

const WebhookEvent = mongoose.model("WebhookEvent", webhookEventSchema);

export default WebhookEvent;