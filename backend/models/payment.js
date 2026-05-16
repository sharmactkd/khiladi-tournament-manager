import mongoose from "mongoose";

export const PAYMENT_STATUSES = [
  "created",
  "attempted",
  "authorized",
  "captured",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
  "partially_refunded",
  "disputed",
];

const planSnapshotSchema = new mongoose.Schema(
  {
    planType: { type: String, required: true, trim: true },
    label: { type: String, default: "", trim: true },
    amount: { type: Number, required: true, min: 0 },
    amountInPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR", trim: true, uppercase: true },
    accessType: {
      type: String,
      enum: ["tournament", "unlimited"],
      required: true,
    },
    durationDays: { type: Number, default: null },
    features: { type: [String], default: [] },
    version: { type: Number, default: 1 },
    source: {
      type: String,
      enum: ["platform_settings", "legacy_config"],
      default: "platform_settings",
    },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      default: null,
      index: true,
    },

    planType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    planSnapshot: {
      type: planSnapshotSchema,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      trim: true,
      uppercase: true,
    },

    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
    },

    razorpaySignature: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "created",
      index: true,
    },

    accessType: {
      type: String,
      enum: ["tournament", "unlimited"],
      required: true,
      index: true,
    },

    accessStartsAt: {
      type: Date,
      default: null,
    },

    accessExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    accessLifecycle: {
  type: String,
  enum: [
    "single_tournament_lifetime",
    "fixed_duration",
    "lifetime",
    "manual",
    "coupon",
  ],
  default: "fixed_duration",
  index: true,
},

    gateway: {
      type: String,
      enum: ["razorpay", "stripe", "manual", "coupon", "system"],
      default: "razorpay",
      index: true,
    },

    statusHistory: [
      {
        status: {
          type: String,
          enum: PAYMENT_STATUSES,
          required: true,
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        source: {
          type: String,
          default: "",
          trim: true,
        },
        note: {
          type: String,
          default: "",
          trim: true,
        },
      },
    ],
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, status: 1, accessType: 1 });
paymentSchema.index({ userId: 1, tournamentId: 1, status: 1 });
paymentSchema.index({ userId: 1, accessType: 1, accessExpiresAt: 1 });
paymentSchema.index({ gateway: 1, status: 1, createdAt: -1 });

paymentSchema.index(
  { razorpayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      razorpayPaymentId: { $type: "string" },
    },
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;