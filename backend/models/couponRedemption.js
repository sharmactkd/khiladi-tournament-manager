// backend/models/couponRedemption.js
import mongoose from "mongoose";

const couponRedemptionSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    planType: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      default: null,
      index: true,
    },

    category: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    couponType: {
      type: String,
      enum: ["percentage", "fixed", "full_access"],
      required: true,
      index: true,
    },

    couponValue: {
      type: Number,
      default: 0,
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

    source: {
      type: String,
      enum: ["payment", "free_coupon", "admin_coupon"],
      default: "payment",
      index: true,
    },

    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },

    entitlementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccessEntitlement",
      default: null,
      index: true,
    },

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentTransaction",
      default: null,
      index: true,
    },

    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingInvoice",
      default: null,
      index: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

couponRedemptionSchema.index(
  {
    couponId: 1,
    userId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      source: { $in: ["payment", "free_coupon", "admin_coupon"] },
    },
  }
);

couponRedemptionSchema.index(
  { paymentId: 1 },
  {
    unique: true,
    sparse: true,
  }
);

couponRedemptionSchema.index({ userId: 1, createdAt: -1 });
couponRedemptionSchema.index({ couponId: 1, createdAt: -1 });
couponRedemptionSchema.index({ code: 1, createdAt: -1 });
couponRedemptionSchema.index({ planType: 1, tournamentId: 1 });

const CouponRedemption = mongoose.model(
  "CouponRedemption",
  couponRedemptionSchema
);

export default CouponRedemption;