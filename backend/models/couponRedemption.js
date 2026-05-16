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
  { couponId: 1, userId: 1 },
  { unique: true }
);

couponRedemptionSchema.index({ userId: 1, createdAt: -1 });
couponRedemptionSchema.index({ code: 1, createdAt: -1 });

const CouponRedemption = mongoose.model(
  "CouponRedemption",
  couponRedemptionSchema
);

export default CouponRedemption;