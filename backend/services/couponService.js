// backend/services/couponService.js
import mongoose from "mongoose";
import Coupon from "../models/coupon.js";
import CouponRedemption from "../models/couponRedemption.js";
import PlatformSettings from "../models/platformSettings.js";
import { getPlanConfig } from "./subscriptionService.js";

export const normalizeCouponCode = (code = "") =>
  String(code || "").trim().toUpperCase();

export const isValidCouponCode = (code = "") =>
  /^[A-Z0-9_-]{3,50}$/.test(normalizeCouponCode(code));

const toObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(String(id))
    ? new mongoose.Types.ObjectId(id)
    : null;

export const buildCouponSnapshot = ({
  coupon,
  originalAmount = 0,
  discountAmount = 0,
  finalAmount = 0,
} = {}) => {
  if (!coupon) return null;

  return {
    couponId: coupon._id,
    code: normalizeCouponCode(coupon.code),
    category: coupon.category || "discount_coupon",
    type: coupon.type,
    value: Number(coupon.value || 0),
    originalAmount: Number(originalAmount || 0),
    discountAmount: Number(discountAmount || 0),
    finalAmount: Number(finalAmount || 0),
    appliedAt: new Date(),
  };
};

export const calculateCouponDiscount = ({ coupon, originalAmount }) => {
  const safeOriginal = Math.max(Number(originalAmount || 0), 0);
  let discountAmount = 0;

  if (!coupon) {
    return {
      originalAmount: safeOriginal,
      discountAmount: 0,
      finalAmount: safeOriginal,
    };
  }

  if (coupon.type === "percentage") {
    const percentage = Math.min(Math.max(Number(coupon.value || 0), 0), 100);
    discountAmount = Math.round((safeOriginal * percentage) / 100);
  }

  if (coupon.type === "fixed") {
    discountAmount = Number(coupon.value || 0);
  }

  if (coupon.type === "full_access") {
    discountAmount = safeOriginal;
  }

  discountAmount = Math.min(Math.max(discountAmount, 0), safeOriginal);

  return {
    originalAmount: safeOriginal,
    discountAmount,
    finalAmount: Math.max(safeOriginal - discountAmount, 0),
  };
};

export const validateCouponForUser = async ({
  code,
  userId,
  planType,
  requireCouponSystemEnabled = true,
  session = null,
} = {}) => {
  const safeCode = normalizeCouponCode(code);
  const safeUserId = toObjectId(userId);
  const safePlanType = String(planType || "").trim();

  if (!safeUserId) {
    return {
      valid: false,
      statusCode: 401,
      reason: "unauthorized",
      message: "Unauthorized user",
    };
  }

  if (!safeCode || !isValidCouponCode(safeCode)) {
    return {
      valid: false,
      statusCode: 400,
      reason: "invalid-code-format",
      message: "Invalid coupon code format",
    };
  }

  const settings = await PlatformSettings.getSettings();

  if (requireCouponSystemEnabled && !settings.couponSystemEnabled) {
    return {
      valid: false,
      statusCode: 403,
      reason: "coupon-system-disabled",
      message: "Coupon system is currently disabled",
    };
  }

  const selectedPlan = await getPlanConfig(safePlanType);

  if (!selectedPlan) {
    return {
      valid: false,
      statusCode: 400,
      reason: "invalid-plan",
      message: "Invalid payment plan",
    };
  }

  const coupon = await Coupon.findOne({
    code: safeCode,
    active: true,
    deletedAt: null,
  }).session(session);

  if (!coupon) {
    return {
      valid: false,
      statusCode: 404,
      reason: "invalid-coupon",
      message: "Invalid coupon",
    };
  }

  if (coupon.expiresAt && coupon.expiresAt <= new Date()) {
    return {
      valid: false,
      statusCode: 400,
      reason: "coupon-expired",
      message: "Coupon has expired",
      coupon,
    };
  }

  if (coupon.maxUses && Number(coupon.usedCount || 0) >= Number(coupon.maxUses)) {
    return {
      valid: false,
      statusCode: 409,
      reason: "coupon-usage-limit-reached",
      message: "Coupon usage limit reached",
      coupon,
    };
  }

  const allowedUsers = Array.isArray(coupon.allowedUsers)
    ? coupon.allowedUsers
    : [];

  if (
    allowedUsers.length > 0 &&
    !allowedUsers.some((id) => String(id) === String(safeUserId))
  ) {
    return {
      valid: false,
      statusCode: 403,
      reason: "user-not-allowed",
      message: "This coupon is not available for your account",
      coupon,
    };
  }

  const applicablePlans = Array.isArray(coupon.applicablePlans)
    ? coupon.applicablePlans
    : [];

  if (
    applicablePlans.length > 0 &&
    !applicablePlans.includes(safePlanType)
  ) {
    return {
      valid: false,
      statusCode: 400,
      reason: "plan-not-allowed",
      message: "This coupon is not applicable for selected plan",
      coupon,
    };
  }

  if (coupon.singleUsePerUser === true) {
    const existingRedemption = await CouponRedemption.findOne({
      couponId: coupon._id,
      userId: safeUserId,
    }).session(session);

    if (existingRedemption) {
      return {
        valid: false,
        statusCode: 409,
        reason: "already-used",
        message: "You have already used this coupon",
        coupon,
      };
    }
  }

  const amountInfo = calculateCouponDiscount({
    coupon,
    originalAmount: Number(selectedPlan.amount || 0),
  });

  return {
    valid: true,
    statusCode: 200,
    reason: "valid",
    message: "Coupon is valid",
    coupon,
    selectedPlan,
    originalAmount: amountInfo.originalAmount,
    discountAmount: amountInfo.discountAmount,
    finalAmount: amountInfo.finalAmount,
    couponSnapshot: buildCouponSnapshot({
      coupon,
      ...amountInfo,
    }),
  };
};

export const listAvailableCoupons = async ({ userId, planType } = {}) => {
  const safeUserId = toObjectId(userId);
  const safePlanType = String(planType || "").trim();

  if (!safeUserId) {
    return {
      success: false,
      statusCode: 401,
      coupons: [],
      reason: "unauthorized",
      message: "Unauthorized user",
    };
  }

  const settings = await PlatformSettings.getSettings();

  if (!settings.couponSystemEnabled) {
    return {
      success: true,
      statusCode: 200,
      coupons: [],
      reason: "coupon-system-disabled",
      message: "Coupon system is currently disabled",
    };
  }

  const now = new Date();

  const coupons = await Coupon.find({
    active: true,
    deletedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    $expr: {
      $or: [
        { $eq: ["$maxUses", null] },
        { $lt: ["$usedCount", "$maxUses"] },
      ],
    },
  })
    .sort({ createdAt: -1 })
    .lean();

  const result = [];

  for (const coupon of coupons) {
    const allowedUsers = Array.isArray(coupon.allowedUsers)
      ? coupon.allowedUsers
      : [];

    if (
      allowedUsers.length > 0 &&
      !allowedUsers.some((id) => String(id) === String(safeUserId))
    ) {
      continue;
    }

    const applicablePlans = Array.isArray(coupon.applicablePlans)
      ? coupon.applicablePlans
      : [];

    if (
      safePlanType &&
      applicablePlans.length > 0 &&
      !applicablePlans.includes(safePlanType)
    ) {
      continue;
    }

    if (coupon.singleUsePerUser === true) {
      const existingRedemption = await CouponRedemption.findOne({
        couponId: coupon._id,
        userId: safeUserId,
      }).lean();

      if (existingRedemption) continue;
    }

    result.push({
      _id: coupon._id,
      code: coupon.code,
      category: coupon.category || "discount_coupon",
      type: coupon.type,
      value: coupon.value || 0,
      applicablePlans: coupon.applicablePlans || [],
      expiresAt: coupon.expiresAt || null,
      maxUses: coupon.maxUses || null,
      usedCount: coupon.usedCount || 0,
      singleUsePerUser: coupon.singleUsePerUser === true,
    });
  }

  return {
    success: true,
    statusCode: 200,
    coupons: result,
    reason: "available",
    message: result.length ? "Coupons loaded" : "No coupons available",
  };
};

export const redeemCouponAtomically = async ({
  couponSnapshot,
  userId,
  planType,
  tournamentId = null,
  paymentId = null,
  transactionId = null,
  entitlementId = null,
  invoiceId = null,
  source = "payment",
  metadata = {},
  session,
} = {}) => {
  if (!couponSnapshot?.couponId || !couponSnapshot?.code) {
    return null;
  }

  const safeUserId = toObjectId(userId);
  const safeCouponId = toObjectId(couponSnapshot.couponId);
  const safeTournamentId = tournamentId ? toObjectId(tournamentId) : null;

  if (!safeUserId || !safeCouponId) {
    const error = new Error("Valid userId and couponId are required");
    error.statusCode = 400;
    throw error;
  }

  const existingRedemptionQuery = paymentId
    ? { paymentId }
    : { couponId: safeCouponId, userId: safeUserId };

  const existingRedemption = await CouponRedemption.findOne(
    existingRedemptionQuery
  ).session(session);

  if (existingRedemption) {
    return existingRedemption;
  }

  const now = new Date();

  const updatedCoupon = await Coupon.findOneAndUpdate(
    {
      _id: safeCouponId,
      code: normalizeCouponCode(couponSnapshot.code),
      active: true,
      deletedAt: null,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      $expr: {
        $or: [
          { $eq: ["$maxUses", null] },
          { $lt: ["$usedCount", "$maxUses"] },
        ],
      },
    },
    {
      $inc: { usedCount: 1 },
    },
    {
      new: true,
      runValidators: true,
      session,
    }
  );

  if (!updatedCoupon) {
    const error = new Error(
      "Coupon became invalid, expired, inactive, or usage limit reached"
    );
    error.statusCode = 409;
    throw error;
  }

  try {
    const created = await CouponRedemption.create(
      [
        {
          couponId: updatedCoupon._id,
          userId: safeUserId,
          code: updatedCoupon.code,
          planType: String(planType || "").trim(),
          tournamentId: safeTournamentId,
          category: updatedCoupon.category || "discount_coupon",
          couponType: updatedCoupon.type,
          couponValue: updatedCoupon.value || 0,
          originalAmount: Number(couponSnapshot.originalAmount || 0),
          discountAmount: Number(couponSnapshot.discountAmount || 0),
          finalAmount: Number(couponSnapshot.finalAmount || 0),
          source,
          paymentId: paymentId || null,
          transactionId: transactionId || null,
          entitlementId: entitlementId || null,
          invoiceId: invoiceId || null,
          metadata,
        },
      ],
      { session }
    );

    return created[0];
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await CouponRedemption.findOne(
        existingRedemptionQuery
      ).session(session);

      if (existing) return existing;
    }

    throw error;
  }
};