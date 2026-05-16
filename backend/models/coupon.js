import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 40,
      index: true,
    },

    type: {
      type: String,
      enum: ["percentage", "fixed", "full_access"],
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
      enum: ["single", "six_months", "one_year", "monthly", "yearly", "lifetime"],
      default: [],
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

couponSchema.index({ code: 1, active: 1 });
couponSchema.index({ expiresAt: 1, active: 1 });
couponSchema.index({ "usedBy.userId": 1 });

couponSchema.methods.isExpired = function () {
  return Boolean(this.expiresAt && this.expiresAt <= new Date());
};

couponSchema.methods.hasRemainingUses = function () {
  if (!this.maxUses) return true;
  return this.usedCount < this.maxUses;
};

couponSchema.methods.isUserAllowed = function (userId) {
  if (!this.allowedUsers || this.allowedUsers.length === 0) return true;
  return this.allowedUsers.some((id) => String(id) === String(userId));
};

couponSchema.methods.isPlanAllowed = function (planType) {
  if (!this.applicablePlans || this.applicablePlans.length === 0) return true;
  return this.applicablePlans.includes(planType);
};

const Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;