//D:\Khiladi\backend\models\billingInvoice.js

import mongoose from "mongoose";

const billingInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentTransaction",
      default: null,
      index: true,
    },

    invoiceType: {
      type: String,
      enum: ["payment", "coupon", "manual", "system"],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["issued", "void"],
      default: "issued",
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
    },

    planType: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    planSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    couponCode: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },

    couponCategory: {
      type: String,
      default: "",
      trim: true,
    },

    issuedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    emailedAt: {
      type: Date,
      default: null,
    },

    emailStatus: {
      type: String,
      enum: ["not_sent", "sent", "failed"],
      default: "not_sent",
      index: true,
    },

    emailError: {
      type: String,
      default: "",
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

billingInvoiceSchema.index({ userId: 1, issuedAt: -1 });
billingInvoiceSchema.index({ invoiceType: 1, status: 1, issuedAt: -1 });

const BillingInvoice = mongoose.model("BillingInvoice", billingInvoiceSchema);

export default BillingInvoice;