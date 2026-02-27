import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import logger from "../utils/logger.js";

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
    validator: v => v === null || v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    message: "Please enter a valid email"
  }
},
    phone: {
      type: String,
      unique: true, // This creates an index automatically
      sparse: true,
     validate: {
  validator: function(v) {
    if (!v) return true;
    // Allow +911234567890 or 911234567890 or 1234567890 (10-15 digits)
    return /^(\+?\d{10,15})$/.test(v.replace(/\s/g, ''));
  },
  message: "Invalid phone number (10-15 digits, optional + prefix)"
}
    },
    password: {
      type: String,
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    loginProvider: {
      type: String,
      enum: ["email", "google", "phone"],
      default: "email",
    },
    googleId: { 
      type: String, 
      unique: true, // This creates an index automatically
      sparse: true 
    },
    facebookId: { 
      type: String, 
      unique: true, // This creates an index automatically
      sparse: true 
    },

    // Add this field in user schema
weightPresets: [
  {
    name: { type: String, required: true, trim: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true }, // { "Sub-Junior": [...rows], ... }
    createdAt: { type: Date, default: Date.now },
  }
],

    isVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    lastLogin: Date,
    refreshTokens: [String],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Keep only non-duplicate indexes
userSchema.index({ loginProvider: 1 });  // Analytics queries ke liye helpful
userSchema.index({ role: 1 });           // Admin queries ke liye
userSchema.index({ isVerified: 1 });     // Verification status ke liye

// Only hash password if modified
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

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false; // Social login users ke liye
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;