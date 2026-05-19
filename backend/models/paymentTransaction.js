// backend/models/paymentTransaction.js
import mongoose from "mongoose";

export const PAYMENT_TRANSACTION_STATUSES = [
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
    planType: { type: String, default: "", trim: true },
    label: { type: String, default: "", trim: true },
    amount: { type: Number, default: 0, min: 0 },
    amountInPaise: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "INR", trim: true, uppercase: true },
    accessType: {
      type: String,
      enum: ["tournament", "unlimited", ""],
      default: "",
    },
    durationDays: { type: Number, default: null },
    features: { type: [String], default: [] },
    version: { type: Number, default: 1 },
    source: {
      type: String,
      enum: ["platform_settings", "legacy_config", ""],
      default: "",
    },
  },
  { _id: false }
);

const couponSnapshotSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    code: { type: String, default: "", trim: true, uppercase: true },
    category: { type: String, default: "", trim: true },
    type: {
      type: String,
      enum: ["percentage", "fixed", "full_access", ""],
      default: "",
    },
    value: { type: Number, default: 0, min: 0 },
    originalAmount: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    finalAmount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const paymentTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    originalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    finalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      trim: true,
      uppercase: true,
      index: true,
    },

    paymentGateway: {
      type: String,
      enum: ["razorpay", "stripe", "manual", "coupon", "system"],
      default: "razorpay",
      index: true,
    },

    paymentId: {
      type: String,
      default: "",
      trim: true,
    },

    orderId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    planType: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    planSnapshot: {
      type: planSnapshotSchema,
      default: null,
    },

    couponSnapshot: {
      type: couponSnapshotSchema,
      default: null,
    },

    status: {
      type: String,
      enum: PAYMENT_TRANSACTION_STATUSES,
      default: "created",
      index: true,
    },

    couponUsed: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

paymentTransactionSchema.pre("validate", function (next) {
  const original = Number(this.originalAmount || this.metadata?.originalAmount || 0);
  const discount = Math.min(
    Math.max(Number(this.discountAmount || this.metadata?.discountAmount || 0), 0),
    original || Number.MAX_SAFE_INTEGER
  );
  const final =
    this.finalAmount !== undefined && this.finalAmount !== null
      ? Number(this.finalAmount)
      : Math.max(original - discount, 0);

  this.originalAmount = original;
  this.discountAmount = discount;
  this.finalAmount = final;
  this.amount = Number(this.amount ?? final);

  if (this.couponSnapshot?.code) {
    this.couponUsed = this.couponSnapshot.code;
  }

  next();
});

paymentTransactionSchema.index({ userId: 1, status: 1, createdAt: -1 });
paymentTransactionSchema.index({ paymentGateway: 1, status: 1 });
paymentTransactionSchema.index({ createdAt: -1 });
paymentTransactionSchema.index({ planType: 1, status: 1 });
paymentTransactionSchema.index({ couponUsed: 1 });
paymentTransactionSchema.index({ status: 1, createdAt: -1 });
paymentTransactionSchema.index({ paymentGateway: 1, createdAt: -1 });
paymentTransactionSchema.index({ userId: 1, createdAt: -1 });

const PaymentTransaction = mongoose.model(
  "PaymentTransaction",
  paymentTransactionSchema
);

export default PaymentTransaction;