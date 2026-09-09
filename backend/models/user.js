// FILE: backend/models/user.js

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import logger from "../utils/logger.js";

const ACTIVE_ROLES = ["organizer", "coach", "player"];
const ADMIN_ROLES = ["admin", "superadmin"];
const LEGACY_ROLES = ["user"];

const refreshTokenSessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: "", trim: true },
    ip: { type: String, default: "", trim: true },
    lastUsedAt: { type: Date, default: null },
  },
  { _id: false }
);

const buildUserSearchText = (user) => {
  return [user.name, user.email, user.phone]
    .map((v) => String(v || "").toLowerCase().trim())
    .filter(Boolean)
    .join(" ");
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please enter your name"],
      trim: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },

    email: {
      type: String,
      lowercase: true,
      unique: true,
      sparse: true,
      validate: {
        validator: (v) =>
          v === null || v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: "Please enter a valid email",
      },
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^(\+?\d{10,15})$/.test(v.replace(/\s/g, ""));
        },
        message: "Invalid phone number (10-15 digits, optional + prefix)",
      },
    },

    password: {
      type: String,
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },

    role: {
      type: String,
      enum: [...ACTIVE_ROLES, ...ADMIN_ROLES, ...LEGACY_ROLES],
      default: "player",
    },

    adminPermissions: {
      type: [String],
      default: [],
   enum: [
  "dashboard:read",

  "users:read_basic",
  "users:read_sensitive",
  "users:read",
  "users:manage",

  "tournaments:read",
  "tournaments:manage",

  "entries:read",

  "payments:read",
  "payments:manage",
  "payments:reconcile",

  "billing:read",
  "billing:manage",
  "billing:settings",
  "billing:grant",
  "billing:remove",
  "billing:extend",
  "billing:lifetime",
  "billing:trial",
  "billing:override",

  "coupons:read",
  "coupons:manage",

  "audit:read",
],
    },

    loginProvider: {
      type: String,
      enum: ["email", "google", "phone"],
      default: "email",
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    centralIdentityId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    profilePicture: { type: String, default: null },

    weightPresets: [
      {
        name: { type: String, required: true, trim: true },
        data: { type: mongoose.Schema.Types.Mixed, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    isVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    isProfileComplete: { type: Boolean, default: false },

    isSuspended: { type: Boolean, default: false },
    suspendedAt: { type: Date, default: null },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    suspensionReason: { type: String, trim: true, default: "" },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    subscriptionStatus: {
      type: String,
      enum: ["none", "active", "expired", "cancelled", "trial", "lifetime"],
      default: "none",
      index: true,
    },

    subscriptionType: {
      type: String,
      enum: [
        "none",
        "single",
        "six_months",
        "one_year",
        "monthly",
        "yearly",
        "lifetime",
        "trial",
      ],
      default: "none",
      index: true,
    },

    premiumExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    adminAccessOverride: {
      type: Boolean,
      default: false,
      index: true,
    },

    accessSource: {
      type: String,
      enum: ["payment", "coupon", "admin", "trial", "lifetime", null],
      default: null,
      index: true,
    },

    trialUsed: { type: Boolean, default: false },
    trialExpiresAt: { type: Date, default: null, index: true },

    lifetimeAccess: {
      type: Boolean,
      default: false,
      index: true,
    },

    blocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    lastPaymentDate: { type: Date, default: null },

    lastLogin: Date,

    refreshTokens: {
      type: [refreshTokenSessionSchema],
      default: [],
      select: false,
    },

    searchText: {
      type: String,
      default: "",
      index: true,
    },

    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },
  },
  { timestamps: true, versionKey: false }
);

userSchema.index({ loginProvider: 1 });
userSchema.index({ role: 1 });
userSchema.index({ adminPermissions: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ isSuspended: 1 });
userSchema.index({ isDeleted: 1 });
userSchema.index({ resetPasswordToken: 1 });
userSchema.index({ resetPasswordExpire: 1 });
userSchema.index({ "refreshTokens.tokenHash": 1 });
userSchema.index({ "refreshTokens.expiresAt": 1 });
userSchema.index({ subscriptionStatus: 1, premiumExpiresAt: 1 });
userSchema.index({ blocked: 1, subscriptionStatus: 1 });
userSchema.index({ searchText: "text" });

userSchema.pre("save", async function (next) {
  try {
    this.searchText = buildUserSearchText(this);

    if (this.isModified("password") && this.password) {
      this.password = await bcrypt.hash(this.password, 10);
      logger.info(`Password hashed for user: ${this.email || this.phone}`);
    }

    next();
  } catch (error) {
    logger.error(`User pre-save error: ${error.message}`);
    next(error);
  }
});

userSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const $set = update.$set || update;

  const hasSearchFieldChange =
    Object.prototype.hasOwnProperty.call($set, "name") ||
    Object.prototype.hasOwnProperty.call($set, "email") ||
    Object.prototype.hasOwnProperty.call($set, "phone");

  if (hasSearchFieldChange) {
    const name = $set.name;
    const email = $set.email;
    const phone = $set.phone;

    if (!update.$set) {
      update.$set = {};
    }

    update.$set.searchText = [name, email, phone]
      .map((v) => String(v || "").toLowerCase().trim())
      .filter(Boolean)
      .join(" ");

    this.setUpdate(update);
  }

  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getNormalizedRole = function () {
  if (ACTIVE_ROLES.includes(this.role)) return this.role;
  if (ADMIN_ROLES.includes(this.role)) return this.role;
  return "player";
};

const User = mongoose.model("User", userSchema);

export default User;
