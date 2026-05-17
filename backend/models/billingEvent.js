import mongoose from "mongoose";

const billingEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    aggregateType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    aggregateId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "processing", "processed", "failed", "ignored"],
      default: "pending",
      index: true,
    },

    attempts: {
      type: Number,
      default: 0,
      index: true,
    },

    nextAttemptAt: {
      type: Date,
      default: Date.now,
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

    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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
  },
  { timestamps: true }
);

billingEventSchema.index(
  { idempotencyKey: 1 },
  { unique: true }
);

billingEventSchema.index({
  status: 1,
  nextAttemptAt: 1,
  createdAt: 1,
});

billingEventSchema.index({
  aggregateType: 1,
  aggregateId: 1,
  createdAt: -1,
});

billingEventSchema.index({
  userId: 1,
  createdAt: -1,
});

billingEventSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 60 * 60 * 24 * 365,
    partialFilterExpression: {
      status: { $in: ["processed", "ignored"] },
    },
  }
);

const BillingEvent = mongoose.model("BillingEvent", billingEventSchema);

export default BillingEvent;