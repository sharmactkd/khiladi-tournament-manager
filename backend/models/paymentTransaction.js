import mongoose from "mongoose";

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
      index: true,
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

    status: {
      type: String,
      enum: ["created", "paid", "failed", "refunded", "cancelled"],
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

paymentTransactionSchema.index({ userId: 1, status: 1, createdAt: -1 });
paymentTransactionSchema.index({ paymentGateway: 1, status: 1 });
paymentTransactionSchema.index({ createdAt: -1 });

const PaymentTransaction = mongoose.model(
  "PaymentTransaction",
  paymentTransactionSchema
);

export default PaymentTransaction;