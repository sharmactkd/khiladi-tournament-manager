import mongoose from "mongoose";

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
      enum: ["single", "six_months", "one_year"],
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
      index: true,
    },

    razorpaySignature: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["created", "paid", "failed"],
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
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, status: 1, accessType: 1 });
paymentSchema.index({ userId: 1, tournamentId: 1, status: 1 });
paymentSchema.index({ userId: 1, accessType: 1, accessExpiresAt: 1 });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;