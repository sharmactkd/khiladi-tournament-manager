// backend/models/coupon.js
import mongoose from "mongoose";

export const COUPON_CATEGORIES = [
  "discount_coupon",
  "trial_coupon",
  "free_tournament_coupon",
  "academy_coupon",
  "full_access_coupon",
];

export const COUPON_TYPES = ["percentage", "fixed", "full_access"];

export const COUPON_PLAN_TYPES = [
  "single",
  "six_months",
  "one_year",
  "monthly",
  "yearly",
  "lifetime",
];

const normalizeCouponCode = (value) =>
  String(value || "").trim().toUpperCase();

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
      set: normalizeCouponCode,
    },

    category: {
      type: String,
      enum: COUPON_CATEGORIES,
      default: "discount_coupon",
      index: true,
    },

    type: {
      type: String,
      enum: COUPON_TYPES,
      required: true,
      index: true,
    },

    value: {
      type: Number,
      default: 0,
      min: 0,
    },

    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    maxUses: {
      type: Number,
      default: null,
      min: 1,
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    applicablePlans: {
      type: [String],
      enum: COUPON_PLAN_TYPES,
      default: [],
    },

    singleUsePerUser: {
      type: Boolean,
      default: false,
      index: true,
    },

    allowedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    usedBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        usedAt: {
          type: Date,
          default: Date.now,
        },
        planType: {
          type: String,
          default: "",
          trim: true,
        },
        category: {
          type: String,
          default: "",
          trim: true,
        },
      },
    ],

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    deleteReason: {
      type: String,
      default: "",
      trim: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

couponSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
    },
  }
);

couponSchema.index({ category: 1, active: 1, deletedAt: 1 });
couponSchema.index({ expiresAt: 1, active: 1 });
couponSchema.index({ active: 1, deletedAt: 1 });
couponSchema.index({ applicablePlans: 1, active: 1, deletedAt: 1 });
couponSchema.index({ "allowedUsers": 1 });
couponSchema.index({ "usedBy.userId": 1 });

couponSchema.pre("validate", function (next) {
  this.code = normalizeCouponCode(this.code);

  if (this.type === "percentage" && Number(this.value) > 100) {
    this.invalidate("value", "Percentage coupon value cannot be more than 100");
  }

  if (this.type === "full_access") {
    this.value = 0;
  }

  if (this.maxUses !== null && this.maxUses !== undefined) {
    this.maxUses = Math.max(1, Math.floor(Number(this.maxUses)));
  }

  if (this.usedCount < 0) {
    this.usedCount = 0;
  }

  next();
});

couponSchema.methods.isExpired = function () {
  return Boolean(this.expiresAt && this.expiresAt <= new Date());
};

couponSchema.methods.hasRemainingUses = function () {
  if (!this.maxUses) return true;
  return Number(this.usedCount || 0) < Number(this.maxUses);
};

couponSchema.methods.isUserAllowed = function (userId) {
  if (!this.allowedUsers || this.allowedUsers.length === 0) return true;
  return this.allowedUsers.some((id) => String(id) === String(userId));
};

couponSchema.methods.isPlanAllowed = function (planType) {
  if (!this.applicablePlans || this.applicablePlans.length === 0) return true;
  return this.applicablePlans.includes(String(planType || "").trim());
};

const Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;