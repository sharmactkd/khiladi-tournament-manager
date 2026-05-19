// backend/controllers/couponController.js
import mongoose from "mongoose";
import User from "../models/user.js";
import Coupon from "../models/coupon.js";
import CouponRedemption from "../models/couponRedemption.js";
import PaymentTransaction from "../models/paymentTransaction.js";
import AdminLog from "../models/adminLog.js";
import AccessEntitlement from "../models/accessEntitlement.js";
import PlatformSettings from "../models/platformSettings.js";
import { getPlanConfig } from "../services/subscriptionService.js";
import { createAccessEntitlement } from "../services/accessEntitlementService.js";
import { createBillingEvent } from "../services/billingEventService.js";
import { createInvoice } from "../services/billingInvoiceService.js";
import { sendBillingInvoiceEmail } from "../services/billingEmailService.js";
import { clearUserAccessCache } from "../services/accessCacheService.js";
import {
  normalizeCouponCode,
  isValidCouponCode,
  validateCouponForUser,
  redeemCouponAtomically,
} from "../services/couponService.js";

const toObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(String(id))
    ? new mongoose.Types.ObjectId(id)
    : null;

const normalizePage = (page) => Math.max(Number(page) || 1, 1);

const normalizeLimit = (limit) =>
  Math.min(Math.max(Number(limit) || 20, 1), 100);

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildPagination = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

const getUserId = (req) => req.user?._id || req.user?.id || req.user?.userId;

const writeAdminLog = async (req, action, targetUserId = null, details = {}) => {
  return AdminLog.create({
    adminId: req.user._id,
    action,
    targetUserId,
    details,
    ip: req.ip || "",
    userAgent: req.get("user-agent") || "",
  });
};

const calculateCouponAccessDates = async ({ planType }) => {
  const now = new Date();
  const plan = await getPlanConfig(planType);

  if (!plan) {
    const error = new Error("Invalid plan for coupon access");
    error.statusCode = 400;
    throw error;
  }

  const isLifetime = planType === "lifetime";
  const isTournament = plan.accessType === "tournament" || planType === "single";

  let expiresAt = null;

  if (!isLifetime && !isTournament && plan.durationDays) {
    expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + Number(plan.durationDays));
  }

  return {
    startsAt: now,
    expiresAt,
    accessType: isLifetime
      ? "lifetime"
      : isTournament
        ? "tournament"
        : "unlimited",
    scope: isTournament ? "tournament" : "global",
    plan,
  };
};

const calculateUserEntitlementCache = async ({ userId, session = null }) => {
  const now = new Date();

  const bestEntitlement = await AccessEntitlement.findOne({
    userId,
    status: "active",
    startsAt: { $lte: now },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .sort({ priority: 1, expiresAt: -1, createdAt: -1 })
    .session(session);

  if (!bestEntitlement) {
    return {
      subscriptionStatus: "none",
      subscriptionType: "none",
      premiumExpiresAt: null,
      lifetimeAccess: false,
      adminAccessOverride: false,
      accessSource: null,
    };
  }

  const isLifetime =
    bestEntitlement.accessType === "lifetime" ||
    bestEntitlement.planType === "lifetime" ||
    bestEntitlement.source === "lifetime";

  const isAdminOverride =
    bestEntitlement.source === "admin" &&
    bestEntitlement.planType === "admin_override";

  return {
    subscriptionStatus: isLifetime
      ? "lifetime"
      : bestEntitlement.source === "trial"
        ? "trial"
        : "active",
    subscriptionType:
      bestEntitlement.planType || bestEntitlement.accessType || "premium",
    premiumExpiresAt: isLifetime ? null : bestEntitlement.expiresAt || null,
    lifetimeAccess: isLifetime,
    adminAccessOverride: isAdminOverride,
    accessSource: bestEntitlement.source,
    lastPaymentDate: new Date(),
  };
};

const recalculateUserBillingCache = async ({ userId, session = null }) => {
  const cache = await calculateUserEntitlementCache({ userId, session });

  return User.findByIdAndUpdate(userId, { $set: cache }, { new: true, session })
    .select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");
};

const normalizeCouponPayload = (body = {}, userId) => {
  const payload = {
    code: normalizeCouponCode(body.code),
    category: String(body.category || "discount_coupon").trim(),
    type: String(body.type || "percentage").trim(),
    value: Number(body.value || 0),
    active: body.active === undefined ? true : Boolean(body.active),
    maxUses:
      body.maxUses === "" || body.maxUses === null || body.maxUses === undefined
        ? null
        : Number(body.maxUses),
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    applicablePlans: Array.isArray(body.applicablePlans)
      ? body.applicablePlans.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    singleUsePerUser: Boolean(body.singleUsePerUser),
    allowedUsers: Array.isArray(body.allowedUsers)
      ? body.allowedUsers.filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
      : [],
  };

  if (userId) payload.createdBy = userId;

  if (!isValidCouponCode(payload.code)) {
    const error = new Error(
      "Coupon code must be 3-50 characters and contain only A-Z, 0-9, _ or -"
    );
    error.statusCode = 400;
    throw error;
  }

  if (!["percentage", "fixed", "full_access"].includes(payload.type)) {
    const error = new Error("Invalid coupon type");
    error.statusCode = 400;
    throw error;
  }

  if (payload.type === "percentage" && (payload.value < 0 || payload.value > 100)) {
    const error = new Error("Percentage coupon value must be between 0 and 100");
    error.statusCode = 400;
    throw error;
  }

  if (payload.type === "fixed" && payload.value < 0) {
    const error = new Error("Fixed coupon value cannot be negative");
    error.statusCode = 400;
    throw error;
  }

  if (payload.type === "full_access") {
    payload.value = 0;
  }

  if (payload.maxUses !== null && (!Number.isFinite(payload.maxUses) || payload.maxUses < 1)) {
    const error = new Error("maxUses must be empty or a number greater than 0");
    error.statusCode = 400;
    throw error;
  }

  if (payload.expiresAt && Number.isNaN(payload.expiresAt.getTime())) {
    const error = new Error("Invalid expiry date");
    error.statusCode = 400;
    throw error;
  }

  return payload;
};

export const listCoupons = async (req, res) => {
  try {
    const {
      includeDeleted = "false",
      page = 1,
      limit = 20,
      search = "",
    } = req.query;

    const safePage = normalizePage(page);
    const safeLimit = normalizeLimit(limit);

    const query =
      includeDeleted === "true"
        ? {}
        : {
            deletedAt: null,
          };

    if (search) {
      const safeSearch = escapeRegex(String(search).trim());

      query.$or = [
        { code: { $regex: safeSearch, $options: "i" } },
        { category: { $regex: safeSearch, $options: "i" } },
        { type: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const skip = (safePage - 1) * safeLimit;

    const [coupons, total] = await Promise.all([
      Coupon.find(query)
        .populate("createdBy", "name email role")
        .populate("updatedBy", "name email role")
        .populate("deletedBy", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      Coupon.countDocuments(query),
    ]);

    return res.json({
      success: true,
      coupons,
      pagination: buildPagination({
        page: safePage,
        limit: safeLimit,
        total,
      }),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to load coupons",
    });
  }
};

export const createCoupon = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const payload = normalizeCouponPayload(req.body, req.user._id);

    const existing = await Coupon.findOne({
      code: payload.code,
      deletedAt: null,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Coupon code already exists",
      });
    }

    let coupon = null;

    await session.withTransaction(async () => {
      const created = await Coupon.create([payload], { session });
      coupon = created[0];

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "coupon_created",
            targetUserId: null,
            details: {
              couponId: coupon._id,
              code: coupon.code,
              type: coupon.type,
              category: coupon.category,
              maxUses: coupon.maxUses,
              applicablePlans: coupon.applicablePlans,
              singleUsePerUser: coupon.singleUsePerUser,
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "coupon.created",
        aggregateType: "coupon",
        aggregateId: coupon._id,
        userId: null,
        idempotencyKey: `coupon.created:${coupon._id}`,
        payload: {
          couponId: coupon._id,
          code: coupon.code,
          type: coupon.type,
          category: coupon.category,
          createdBy: req.user._id,
        },
        session,
      });
    });

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      coupon,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to create coupon",
    });
  } finally {
    session.endSession();
  }
};

export const updateCoupon = async (req, res) => {
  const { couponId } = req.params;
  const safeCouponId = toObjectId(couponId);

  if (!safeCouponId) {
    return res.status(400).json({ success: false, message: "Invalid couponId" });
  }

  const session = await mongoose.startSession();

  try {
    const update = normalizeCouponPayload(req.body);
    delete update.createdBy;
    update.updatedBy = req.user._id;

    if (update.code) {
      const existingCoupon = await Coupon.findOne({
        _id: { $ne: safeCouponId },
        code: update.code,
        deletedAt: null,
      });

      if (existingCoupon) {
        return res.status(409).json({
          success: false,
          message: "Coupon code already exists",
        });
      }
    }

    let coupon = null;

    await session.withTransaction(async () => {
      coupon = await Coupon.findOneAndUpdate(
        {
          _id: safeCouponId,
          deletedAt: null,
        },
        { $set: update },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!coupon) {
        const error = new Error("Coupon not found");
        error.statusCode = 404;
        throw error;
      }

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "coupon_updated",
            targetUserId: null,
            details: {
              couponId: safeCouponId,
              update,
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "coupon.updated",
        aggregateType: "coupon",
        aggregateId: safeCouponId,
        userId: null,
        idempotencyKey: `coupon.updated:${safeCouponId}:${Date.now()}`,
        payload: {
          couponId: safeCouponId,
          update,
          updatedBy: req.user._id,
        },
        session,
      });
    });

    return res.json({
      success: true,
      message: "Coupon updated successfully",
      coupon,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to update coupon",
    });
  } finally {
    session.endSession();
  }
};

export const disableCoupon = async (req, res) => {
  const { couponId } = req.params;
  const safeCouponId = toObjectId(couponId);

  if (!safeCouponId) {
    return res.status(400).json({ success: false, message: "Invalid couponId" });
  }

  const session = await mongoose.startSession();

  try {
    let coupon = null;

    await session.withTransaction(async () => {
      coupon = await Coupon.findOneAndUpdate(
        {
          _id: safeCouponId,
          deletedAt: null,
        },
        {
          active: false,
          updatedBy: req.user._id,
        },
        { new: true, session }
      );

      if (!coupon) {
        const error = new Error("Coupon not found");
        error.statusCode = 404;
        throw error;
      }

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "coupon_disabled",
            targetUserId: null,
            details: {
              couponId: safeCouponId,
              code: coupon.code,
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "coupon.disabled",
        aggregateType: "coupon",
        aggregateId: safeCouponId,
        userId: null,
        idempotencyKey: `coupon.disabled:${safeCouponId}:${Date.now()}`,
        payload: {
          couponId: safeCouponId,
          code: coupon.code,
          disabledBy: req.user._id,
        },
        session,
      });
    });

    return res.json({
      success: true,
      message: "Coupon disabled successfully",
      coupon,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to disable coupon",
    });
  } finally {
    session.endSession();
  }
};

export const deleteCoupon = async (req, res) => {
  const { couponId } = req.params;
  const { reason = "" } = req.body || {};
  const safeCouponId = toObjectId(couponId);

  if (!safeCouponId) {
    return res.status(400).json({ success: false, message: "Invalid couponId" });
  }

  if (!String(reason || "").trim()) {
    return res.status(400).json({
      success: false,
      message: "Delete reason is required",
    });
  }

  const session = await mongoose.startSession();

  try {
    let coupon = null;

    await session.withTransaction(async () => {
      coupon = await Coupon.findOneAndUpdate(
        {
          _id: safeCouponId,
          deletedAt: null,
        },
        {
          active: false,
          deletedAt: new Date(),
          deletedBy: req.user._id,
          deleteReason: String(reason || "").trim(),
          updatedBy: req.user._id,
        },
        { new: true, session }
      );

      if (!coupon) {
        const error = new Error("Coupon not found");
        error.statusCode = 404;
        throw error;
      }

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "coupon_soft_deleted",
            targetUserId: null,
            details: {
              couponId: safeCouponId,
              code: coupon.code,
              reason,
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "coupon.deleted",
        aggregateType: "coupon",
        aggregateId: safeCouponId,
        userId: null,
        idempotencyKey: `coupon.deleted:${safeCouponId}:${Date.now()}`,
        payload: {
          couponId: safeCouponId,
          code: coupon.code,
          reason,
          deletedBy: req.user._id,
        },
        session,
      });
    });

    return res.json({
      success: true,
      message: "Coupon deleted successfully",
      coupon,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to delete coupon",
    });
  } finally {
    session.endSession();
  }
};

export const validateCoupon = async (req, res) => {
  try {
    const targetUserId = req.params?.userId || req.body?.userId || getUserId(req);
    const { code, planType = "" } = req.body || {};

    const result = await validateCouponForUser({
      code,
      userId: targetUserId,
      planType,
    });

    if (!result.valid) {
      return res.status(result.statusCode || 400).json({
        success: false,
        valid: false,
        reason: result.reason,
        message: result.message,
        originalAmount: 0,
        discountAmount: 0,
        finalAmount: 0,
        coupon: null,
      });
    }

    return res.json({
      success: true,
      valid: true,
      reason: result.reason,
      message: result.message,
      originalAmount: result.originalAmount,
      discountAmount: result.discountAmount,
      finalAmount: result.finalAmount,
      coupon: {
        _id: result.coupon._id,
        code: result.coupon.code,
        category: result.coupon.category || "discount_coupon",
        type: result.coupon.type,
        value: result.coupon.value,
        expiresAt: result.coupon.expiresAt,
        applicablePlans: result.coupon.applicablePlans,
        singleUsePerUser: result.coupon.singleUsePerUser === true,
      },
      couponSnapshot: result.couponSnapshot,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      valid: false,
      message: error.statusCode ? error.message : "Failed to validate coupon",
    });
  }
};

export const applyCouponCore = async ({
  req,
  res,
  targetUserId,
  appliedByAdmin = false,
}) => {
  const { code, planType = "single", tournamentId = null } = req.body || {};
  const safeTargetUserId = toObjectId(targetUserId);

  if (!safeTargetUserId) {
    return res.status(400).json({
      success: false,
      message: "Valid target userId is required",
    });
  }

  if (planType === "single" && !tournamentId) {
    return res.status(400).json({
      success: false,
      message: "tournamentId is required for single tournament coupon",
    });
  }

  if (tournamentId && !mongoose.Types.ObjectId.isValid(String(tournamentId))) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournamentId",
    });
  }

  const settings = await PlatformSettings.getSettings();

  if (!settings.couponSystemEnabled) {
    return res.status(403).json({
      success: false,
      message: "Coupon system is currently disabled",
      reason: "coupon-system-disabled",
    });
  }

  const normalizedCode = normalizeCouponCode(code);
  const targetUser = await User.findById(safeTargetUserId).select(
    "-password -refreshTokens -resetPasswordToken -resetPasswordExpire"
  );

  if (!targetUser) {
    return res.status(404).json({
      success: false,
      message: "Target user not found",
    });
  }

  const validation = await validateCouponForUser({
    code: normalizedCode,
    userId: safeTargetUserId,
    planType,
  });

  if (!validation.valid) {
    return res.status(validation.statusCode || 400).json({
      success: false,
      valid: false,
      reason: validation.reason,
      message: validation.message,
    });
  }

  if (validation.finalAmount > 0 && !appliedByAdmin) {
    return res.status(400).json({
      success: false,
      message:
        "This coupon gives a partial discount. Please continue with Razorpay payment.",
      requiresPayment: true,
      originalAmount: validation.originalAmount,
      discountAmount: validation.discountAmount,
      finalAmount: validation.finalAmount,
      coupon: validation.couponSnapshot,
    });
  }

  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const coupon = await Coupon.findOne({
        code: normalizedCode,
        active: true,
        deletedAt: null,
      }).session(session);

      if (!coupon) {
        const error = new Error("Invalid coupon");
        error.statusCode = 404;
        throw error;
      }

      const accessDates = await calculateCouponAccessDates({ planType });

      const entitlement = await createAccessEntitlement({
        userId: safeTargetUserId,
        scope: accessDates.scope,
        tournamentId: accessDates.scope === "tournament" ? tournamentId : null,
        source: "coupon",
        sourceId: coupon._id,
        planType,
        accessType: accessDates.accessType,
        startsAt: accessDates.startsAt,
        expiresAt: accessDates.expiresAt,
        metadata: {
          couponCode: coupon.code,
          couponCategory: coupon.category || "discount_coupon",
          couponType: coupon.type,
          couponValue: coupon.value,
          originalAmount: validation.originalAmount,
          discountAmount: validation.discountAmount,
          finalAmount: validation.finalAmount,
          planSnapshot: accessDates.plan,
          appliedByAdmin,
          appliedBy: req.user?._id || null,
        },
        session,
      });

      await recalculateUserBillingCache({
        userId: safeTargetUserId,
        session,
      });

      const transaction = await PaymentTransaction.create(
        [
          {
            userId: safeTargetUserId,
            amount: 0,
            originalAmount: validation.originalAmount,
            discountAmount: validation.discountAmount,
            finalAmount: 0,
            currency: settings.defaultCurrency || accessDates.plan.currency || "INR",
            paymentGateway: appliedByAdmin ? "manual" : "coupon",
            paymentId: `coupon_${coupon.code}_${Date.now()}`,
            planType,
            planSnapshot: {
              planType,
              label: accessDates.plan.label || planType,
              amount: validation.originalAmount,
              amountInPaise: Math.round(Number(validation.originalAmount || 0) * 100),
              currency: settings.defaultCurrency || accessDates.plan.currency || "INR",
              accessType: accessDates.plan.accessType,
              durationDays: accessDates.plan.durationDays,
              features: accessDates.plan.features || [],
              version: accessDates.plan.version || 1,
              source: accessDates.plan.source || "platform_settings",
            },
            couponSnapshot: validation.couponSnapshot,
            status: "paid",
            couponUsed: coupon.code,
            metadata: {
              couponId: coupon._id,
              entitlementId: entitlement?._id || null,
              couponCategory: coupon.category || "discount_coupon",
              couponType: coupon.type,
              couponValue: coupon.value,
              tournamentId: tournamentId || null,
              accessStartsAt: accessDates.startsAt || null,
              accessExpiresAt: accessDates.expiresAt || null,
              appliedByAdmin,
              appliedBy: req.user?._id || null,
              originalAmount: validation.originalAmount,
              discountAmount: validation.discountAmount,
              finalAmount: 0,
            },
          },
        ],
        { session }
      );

      const redemption = await redeemCouponAtomically({
        couponSnapshot: validation.couponSnapshot,
        userId: safeTargetUserId,
        planType,
        tournamentId: tournamentId || null,
        transactionId: transaction[0]._id,
        entitlementId: entitlement?._id || null,
        source: appliedByAdmin ? "admin_coupon" : "free_coupon",
        metadata: {
          tournamentId,
          accessStartsAt: accessDates.startsAt || null,
          accessExpiresAt: accessDates.expiresAt || null,
          appliedByAdmin,
          appliedBy: req.user?._id || null,
        },
        session,
      });

      await createBillingEvent({
        eventType: appliedByAdmin ? "coupon.applied_by_admin" : "coupon.free_access_activated",
        aggregateType: "coupon",
        aggregateId: coupon._id,
        userId: safeTargetUserId,
        idempotencyKey: `coupon.free_activation:${coupon._id}:${safeTargetUserId}:${planType}`,
        payload: {
          couponId: coupon._id,
          code: coupon.code,
          planType,
          couponType: coupon.type,
          couponValue: coupon.value,
          entitlementId: entitlement?._id || null,
          transactionId: transaction[0]._id,
          redemptionId: redemption?._id || null,
          appliedByAdmin,
          appliedBy: req.user?._id || null,
          originalAmount: validation.originalAmount,
          discountAmount: validation.discountAmount,
          finalAmount: 0,
        },
        session,
      });

      responsePayload = {
        coupon,
        entitlement,
        transaction: transaction[0],
        redemption,
        targetUser,
      };
    });

    const invoice = await createInvoice({
      userId: safeTargetUserId,
      transactionId: responsePayload.transaction._id,
      invoiceType: "coupon",
      planType,
      amount: 0,
      currency: settings.defaultCurrency || "INR",
      paymentGateway: appliedByAdmin ? "manual" : "coupon",
      couponCode: responsePayload.coupon.code,
      couponCategory: responsePayload.coupon.category || "discount_coupon",
      metadata: {
        couponId: responsePayload.coupon._id,
        entitlementId: responsePayload.entitlement?._id || null,
        couponType: responsePayload.coupon.type,
        couponValue: responsePayload.coupon.value,
        appliedByAdmin,
        appliedBy: req.user?._id || null,
      },
    });

    if (invoice && responsePayload.redemption?._id) {
      await CouponRedemption.findByIdAndUpdate(responsePayload.redemption._id, {
        $set: {
          invoiceId: invoice._id,
        },
      });
    }

    try {
      if (invoice) {
        await sendBillingInvoiceEmail({
          user: responsePayload.targetUser,
          invoice,
        });
      }
    } catch (emailError) {
      console.error("Coupon invoice email failed", {
        error: emailError.message,
        userId: safeTargetUserId,
        couponCode: normalizedCode,
      });
    }

    if (appliedByAdmin) {
      await writeAdminLog(req, "coupon_applied_by_admin", safeTargetUserId, {
        couponCode: responsePayload.coupon.code,
        couponId: responsePayload.coupon._id,
        planType,
        entitlementId: responsePayload.entitlement?._id || null,
        transactionId: responsePayload.transaction._id,
        invoiceId: invoice?._id || null,
      });
    }

    clearUserAccessCache(safeTargetUserId);

    return res.json({
      success: true,
      message: "Coupon applied successfully",
      coupon: {
        code: responsePayload.coupon.code,
        category: responsePayload.coupon.category || "discount_coupon",
        type: responsePayload.coupon.type,
        value: responsePayload.coupon.value,
      },
      originalAmount: validation.originalAmount,
      discountAmount: validation.discountAmount,
      finalAmount: 0,
      access: responsePayload.entitlement
        ? {
            entitlementId: responsePayload.entitlement._id,
            source: "coupon",
            planType: responsePayload.entitlement.planType,
            accessType: responsePayload.entitlement.accessType,
            scope: responsePayload.entitlement.scope,
            tournamentId: responsePayload.entitlement.tournamentId,
            startsAt: responsePayload.entitlement.startsAt,
            expiresAt: responsePayload.entitlement.expiresAt,
          }
        : null,
      transactionId: responsePayload.transaction?._id || null,
      redemptionId: responsePayload.redemption?._id || null,
      invoiceId: invoice?._id || null,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to apply coupon",
    });
  } finally {
    session.endSession();
  }
};

export const applyCoupon = async (req, res) => {
  return applyCouponCore({
    req,
    res,
    targetUserId: getUserId(req),
    appliedByAdmin: false,
  });
};

export const applyCouponForUserByAdmin = async (req, res) => {
  return applyCouponCore({
    req,
    res,
    targetUserId: req.params.userId,
    appliedByAdmin: true,
  });
};