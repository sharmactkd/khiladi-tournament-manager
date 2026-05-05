import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import logger from "../utils/logger.js";

const ACTIVE_ROLES = ["organizer", "coach", "player"];
const ADMIN_ROLES = ["admin", "superadmin"];
const LEGACY_ROLES = ["user"];

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

    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },

    profilePicture: {
      type: String,
      default: null,
    },

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
    suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    suspensionReason: { type: String, trim: true, default: "" },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    lastLogin: Date,
    refreshTokens: [String],

    resetPasswordToken: {
      type: String,
      select: false,
    },

    resetPasswordExpire: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

userSchema.index({ loginProvider: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ isSuspended: 1 });
userSchema.index({ isDeleted: 1 });
userSchema.index({ resetPasswordToken: 1 });
userSchema.index({ resetPasswordExpire: 1 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();

  try {
    this.password = await bcrypt.hash(this.password, 10);
    logger.info(`Password hashed for user: ${this.email || this.phone}`);
    next();
  } catch (error) {
    logger.error(`Hash error: ${error.message}`);
    next(error);
  }
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