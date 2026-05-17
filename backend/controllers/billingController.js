import mongoose from "mongoose";
import User from "../models/user.js";
import Coupon from "../models/coupon.js";

import PaymentTransaction from "../models/paymentTransaction.js";
import AdminLog from "../models/adminLog.js";
import hasPremiumAccess from "../utils/hasPremiumAccess.js";
import { expireStalePayments } from "../services/paymentCleanupService.js";
import {
  reconcileOnePayment,
  reconcilePayments,
} from "../services/paymentReconciliationService.js";
import BillingInvoice from "../models/billingInvoice.js";
import { createInvoice } from "../services/billingInvoiceService.js";
import { sendBillingInvoiceEmail } from "../services/billingEmailService.js";
import CouponRedemption from "../models/couponRedemption.js";

import { getPlanConfig } from "../services/subscriptionService.js";
import {
  createAccessEntitlement,
  revokeAccessEntitlements,
} from "../services/accessEntitlementService.js";
import AccessEntitlement from "../models/accessEntitlement.js";
import { createBillingEvent } from "../services/billingEventService.js";
import PlatformSettings, {
  clearPlatformSettingsCache,
} from "../models/platformSettings.js";
import { clearUserAccessCache } from "../services/accessCacheService.js";
import {
  getRequestIdempotencyKey,
  createDeterministicKey,
} from "../services/idempotencyService.js";


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

  return {
    startsAt: now,
    expiresAt:
      isLifetime || isTournament || !plan.durationDays
        ? null
        : addDays(now, plan.durationDays),
    accessType: isLifetime
      ? "lifetime"
      : isTournament
        ? "tournament"
        : "coupon",
    scope: isTournament ? "tournament" : "global",
    plan,
  };
};

const calculateAdminAccessDates = async ({ planType, days = 30 }) => {
  const now = new Date();

  if (planType === "lifetime") {
    return {
      startsAt: now,
      expiresAt: null,
      accessType: "lifetime",
      scope: "global",
    };
  }

  const plan = await getPlanConfig(planType);

  const durationDays =
    plan?.durationDays && Number(plan.durationDays) > 0
      ? Number(plan.durationDays)
      : Number(days || 30);

  return {
    startsAt: now,
    expiresAt: addDays(now, durationDays),
    accessType: "admin",
    scope: "global",
  };
};

const isCouponExplicitlyAllowedForUser = (coupon, userId) => {
  if (!coupon || !userId) return false;

  const allowedUsers = Array.isArray(coupon.allowedUsers)
    ? coupon.allowedUsers
    : [];

  return allowedUsers.some((id) => String(id) === String(userId));
};

const enforceUserSideFullAccessCouponSafety = ({
  coupon,
  targetUserId,
  appliedByAdmin,
}) => {
  if (appliedByAdmin) return;

  if (coupon.type !== "full_access") return;

  const explicitlyAllowed = isCouponExplicitlyAllowedForUser(
    coupon,
    targetUserId
  );

  if (!explicitlyAllowed) {
    const error = new Error(
      "This full-access coupon is restricted. Please contact admin."
    );
    error.statusCode = 403;
    throw error;
  }
};

const toObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(id) : null;

const writeAdminLog = async (req, action, targetUserId = null, details = {}) => {
  try {
    return await AdminLog.create({
      adminId: req.user._id,
      action,
      targetUserId,
      details,
      ip: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
  } catch (error) {
    console.error("CRITICAL: Admin audit log write failed", {
      action,
      targetUserId,
      details,
      adminId: req.user?._id,
      error: error.message,
    });

    const auditError = new Error(
      "Security audit log failed. Action was blocked for safety."
    );
    auditError.statusCode = 500;
    throw auditError;
  }
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days));
  return d;
};

const normalizePage = (page) => Math.max(Number(page) || 1, 1);

const normalizeLimit = (limit) => {
  return Math.min(Math.max(Number(limit) || 20, 1), 100);
};

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isValidCouponCode = (code = "") =>
  /^[A-Z0-9_-]{3,50}$/.test(String(code || "").trim().toUpperCase());

const normalizeDateRange = ({ from, to }) => {
  const createdAt = {};

  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) {
      createdAt.$gte = start;
    }
  }

  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      createdAt.$lte = end;
    }
  }

  return Object.keys(createdAt).length > 0 ? createdAt : null;
};

const buildPagination = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

const getActiveEntitlementQuery = (now = new Date()) => ({
  status: "active",
  startsAt: { $lte: now },
  $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
});

const getActiveEntitledUserIds = async ({
  source = null,
  accessType = null,
  now = new Date(),
} = {}) => {
  const query = getActiveEntitlementQuery(now);

  if (source) query.source = source;
  if (accessType) query.accessType = accessType;

  return AccessEntitlement.distinct("userId", query);
};

const countActiveEntitledUsers = async ({
  source = null,
  accessType = null,
  now = new Date(),
} = {}) => {
  const userIds = await getActiveEntitledUserIds({ source, accessType, now });

  if (!userIds.length) return 0;

  return User.countDocuments({
    _id: { $in: userIds },
    isDeleted: { $ne: true },
  });
};

export const getBillingDashboard = async (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const summarizeGatewayRevenue = (items = []) => {
    const summary = {
      totalRevenue: 0,
      totalTransactions: 0,
      byGateway: {},
    };

    items.forEach((item) => {
      const gateway = item._id || "unknown";
      const total = Number(item.total || 0);
      const count = Number(item.count || 0);

      summary.totalRevenue += total;
      summary.totalTransactions += count;
      summary.byGateway[gateway] = {
        totalRevenue: total,
        totalTransactions: count,
      };
    });

    return summary;
  };

  const [
    userStats,
    entitlementStats,
    couponUsageStats,
    revenueAgg,
    monthlyRevenueAgg,
    nonCashAccessAgg,
    monthlyNonCashAccessAgg,
    settings,
  ] = await Promise.all([
    User.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          blockedUsers: {
            $sum: {
              $cond: [{ $eq: ["$blocked", true] }, 1, 0],
            },
          },
        },
      },
    ]),

    AccessEntitlement.aggregate([
      {
        $match: {
          status: "active",
          startsAt: { $lte: now },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        },
      },
      {
        $group: {
          _id: "$userId",
          hasTrial: {
            $max: {
              $cond: [{ $eq: ["$source", "trial"] }, 1, 0],
            },
          },
          hasLifetime: {
            $max: {
              $cond: [{ $eq: ["$accessType", "lifetime"] }, 1, 0],
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          activePremiumUsers: { $sum: 1 },
          trialUsers: { $sum: "$hasTrial" },
          lifetimeUsers: { $sum: "$hasLifetime" },
        },
      },
    ]),

    Coupon.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$usedCount" },
        },
      },
    ]),

    PaymentTransaction.aggregate([
      {
        $match: {
          status: "paid",
          paymentGateway: { $in: ["razorpay", "stripe"] },
          amount: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$paymentGateway",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),

    PaymentTransaction.aggregate([
      {
        $match: {
          status: "paid",
          paymentGateway: { $in: ["razorpay", "stripe"] },
          amount: { $gt: 0 },
          createdAt: { $gte: monthStart },
        },
      },
      {
        $group: {
          _id: "$paymentGateway",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),

    PaymentTransaction.aggregate([
      {
        $match: {
          status: "paid",
          paymentGateway: { $in: ["coupon", "manual", "system"] },
        },
      },
      {
        $group: {
          _id: "$paymentGateway",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),

    PaymentTransaction.aggregate([
      {
        $match: {
          status: "paid",
          paymentGateway: { $in: ["coupon", "manual", "system"] },
          createdAt: { $gte: monthStart },
        },
      },
      {
        $group: {
          _id: "$paymentGateway",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),

    PlatformSettings.getSettings(),
  ]);

  const userSummary = userStats[0] || {};
  const entitlementSummary = entitlementStats[0] || {};

  const expiredUsersAgg = await AccessEntitlement.aggregate([
    {
      $match: {
        status: "active",
        expiresAt: { $ne: null, $lte: now },
      },
    },
    {
      $group: {
        _id: "$userId",
      },
    },
    {
      $count: "count",
    },
  ]);

  return res.json({
    success: true,
    dashboard: {
      totalUsers: userSummary.totalUsers || 0,
      activePremiumUsers: entitlementSummary.activePremiumUsers || 0,
      expiredUsers: expiredUsersAgg[0]?.count || 0,
      trialUsers: entitlementSummary.trialUsers || 0,
      lifetimeUsers: entitlementSummary.lifetimeUsers || 0,
      blockedUsers: userSummary.blockedUsers || 0,
      couponsUsed: couponUsageStats[0]?.total || 0,

      revenueSummary: {
        realMoney: {
          ...summarizeGatewayRevenue(revenueAgg),
          monthly: summarizeGatewayRevenue(monthlyRevenueAgg),
        },
        nonCashAccess: {
          ...summarizeGatewayRevenue(nonCashAccessAgg),
          monthly: summarizeGatewayRevenue(monthlyNonCashAccessAgg),
        },
        currency: settings.defaultCurrency || "INR",
      },

      activePlans: settings.plans,

      globalControls: {
        paymentsEnabled: settings.paymentsEnabled,
        maintenanceFreeAccess: settings.maintenanceFreeAccess,
        couponSystemEnabled: settings.couponSystemEnabled,
        registrationEnabled: settings.registrationEnabled,
        trialEnabled: settings.trialEnabled,
      },
    },
  });
};

export const getPlatformSettings = async (req, res) => {
  const settings = await PlatformSettings.getSettings();
  return res.json({ success: true, settings });
};

export const updatePlatformSettings = async (req, res) => {
  const allowedFields = [
    "paymentsEnabled",
    "maintenanceFreeAccess",
    "registrationEnabled",
    "couponSystemEnabled",
    "defaultCurrency",
    "trialEnabled",
    "defaultTrialDays",
    "defaultMonthlyPrice",
    "defaultYearlyPrice",
    "defaultLifetimePrice",
    "plans",
  ];

  const update = {};

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      update[field] = req.body[field];
    }
  });

  if (update.plans && typeof update.plans === "object") {
    const currentSettings = await PlatformSettings.getSettings();
    const currentPlans =
      currentSettings.plans instanceof Map
        ? Object.fromEntries(currentSettings.plans)
        : currentSettings.plans || {};

    const incomingPlans =
      update.plans instanceof Map ? Object.fromEntries(update.plans) : update.plans;

    const versionedPlans = {};

    Object.entries(incomingPlans).forEach(([planType, incomingPlan]) => {
      const currentPlan = currentPlans[planType] || {};
      const currentVersion = Number(currentPlan.version || 1);

      const incomingFeatures = Array.isArray(incomingPlan.features)
        ? incomingPlan.features.map((item) => String(item || "").trim()).filter(Boolean)
        : [];

      const currentFeatures = Array.isArray(currentPlan.features)
        ? currentPlan.features.map((item) => String(item || "").trim()).filter(Boolean)
        : [];

      const comparableFields = [
        "label",
        "enabled",
        "price",
        "durationDays",
        "currency",
        "accessType",
        "description",
      ];

      const scalarChanged = comparableFields.some((field) => {
        const oldValue = currentPlan[field];
        const newValue = incomingPlan[field];

        return String(oldValue ?? "") !== String(newValue ?? "");
      });

      const featuresChanged =
        JSON.stringify([...new Set(currentFeatures)].sort()) !==
        JSON.stringify([...new Set(incomingFeatures)].sort());

      const changed = scalarChanged || featuresChanged;

      versionedPlans[planType] = {
        ...incomingPlan,
        features:
          incomingFeatures.length > 0
            ? [...new Set(incomingFeatures)]
            : currentFeatures.length > 0
              ? [...new Set(currentFeatures)]
              : ["tiesheet", "officials", "team_payments", "tiesheet_record"],
        version: changed ? currentVersion + 1 : currentVersion,
        updatedAt: changed ? new Date() : currentPlan.updatedAt || new Date(),
      };
    });

    update.plans = versionedPlans;
  }

  update.updatedBy = req.user._id;

  const settings = await PlatformSettings.findOneAndUpdate(
    { singletonKey: "platform" },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  clearPlatformSettingsCache();

  await writeAdminLog(req, "platform_settings_updated", null, update);

  return res.json({
    success: true,
    message: "Platform settings updated successfully",
    settings,
  });
}; 

export const getBillingUsers = async (req, res) => {
  const { search = "", filter = "all", page = 1, limit = 20 } = req.query;
  const now = new Date();

  const query = { isDeleted: { $ne: true } };

if (search) {
  const rawSearch = String(search).trim().toLowerCase();

  query.$or = [
    { searchText: { $regex: escapeRegex(rawSearch), $options: "i" } },
  ];
}

  if (filter === "premium") {
    const userIds = await getActiveEntitledUserIds({ now });
    query._id = { $in: userIds.length ? userIds : [] };
  }

  if (filter === "expired") {
    const userIds = await AccessEntitlement.distinct("userId", {
      status: "active",
      expiresAt: { $ne: null, $lte: now },
    });

    query._id = { $in: userIds.length ? userIds : [] };
  }

  if (filter === "blocked") {
    query.blocked = true;
  }

  if (filter === "trial") {
    const userIds = await getActiveEntitledUserIds({
      source: "trial",
      now,
    });

    query._id = { $in: userIds.length ? userIds : [] };
  }

  if (filter === "lifetime") {
    const userIds = await getActiveEntitledUserIds({
      accessType: "lifetime",
      now,
    });

    query._id = { $in: userIds.length ? userIds : [] };
  }

  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const [users, total] = await Promise.all([
    User.find(query)
      .select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire")
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    User.countDocuments(query),
  ]);

    const enrichedUsers = await Promise.all(
    users.map(async (user) => {
      const access = await hasPremiumAccess({ userId: user._id, user });

      return {
        ...user,
        premiumAccess: access,
        legacyBillingCache: {
          subscriptionStatus: user.subscriptionStatus,
          subscriptionType: user.subscriptionType,
          premiumExpiresAt: user.premiumExpiresAt,
          lifetimeAccess: user.lifetimeAccess,
          trialExpiresAt: user.trialExpiresAt,
          adminAccessOverride: user.adminAccessOverride,
          accessSource: user.accessSource,
        },
      };
    })
  );

  return res.json({
    success: true,
    users: enrichedUsers,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  });
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

  return User.findByIdAndUpdate(
    userId,
    { $set: cache },
    { new: true, session }
  ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");
};

export const grantPremium = async (req, res) => {
  const { userId } = req.params;
  const { planType = "monthly", days = 30, reason = "" } = req.body;

  const safeUserId = toObjectId(userId);

  if (!safeUserId) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser = null;
    let entitlement = null;
    let accessDates = null;

    await session.withTransaction(async () => {
      const user = await User.findById(safeUserId).session(session);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      accessDates = await calculateAdminAccessDates({ planType, days });

      entitlement = await createAccessEntitlement({
        userId: safeUserId,
        scope: accessDates.scope,
        source: planType === "lifetime" ? "lifetime" : "admin",
        sourceId: req.user._id,
        planType,
        accessType: accessDates.accessType,
        startsAt: accessDates.startsAt,
        expiresAt: accessDates.expiresAt,
        metadata: {
          reason,
          grantedBy: req.user._id,
          days: Number(days || 0),
          planType,
        },
        session,
      });

      updatedUser = await recalculateUserBillingCache({
        userId: safeUserId,
        session,
      });

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "premium_granted",
            targetUserId: safeUserId,
            details: {
              planType,
              days,
              reason,
              entitlementId: entitlement._id,
              expiresAt: accessDates.expiresAt,
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "admin.access_granted",
        aggregateType: "access_entitlement",
        aggregateId: entitlement._id,
        userId: safeUserId,
        idempotencyKey: `admin.access_granted:${entitlement._id}`,
        payload: {
          entitlementId: entitlement._id,
          planType,
          days,
          reason,
          grantedBy: req.user._id,
          expiresAt: accessDates.expiresAt,
        },
        session,
      });
    });

     clearUserAccessCache(safeUserId);

    return res.json({
      success: true,
      message: "Premium access granted successfully",
      user: updatedUser,
      entitlement,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to grant premium access",
    });
  } finally {
    session.endSession();
  }
};

export const removePremium = async (req, res) => {
  const { userId } = req.params;
  const { reason = "Admin removed premium access" } = req.body || {};

  const safeUserId = toObjectId(userId);

  if (!safeUserId) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser = null;
    let revokeResult = null;

    await session.withTransaction(async () => {
      const user = await User.findById(safeUserId).session(session);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      revokeResult = await revokeAccessEntitlements({
        userId: safeUserId,
        revokedBy: req.user._id,
        reason,
        session,
      });

      updatedUser = await recalculateUserBillingCache({
        userId: safeUserId,
        session,
      });

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "premium_removed",
            targetUserId: safeUserId,
            details: {
              reason,
              revokeResult,
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "admin.access_removed",
        aggregateType: "user",
        aggregateId: safeUserId,
        userId: safeUserId,
        idempotencyKey: createDeterministicKey(
  "admin.access_removed",
  safeUserId,
  getRequestIdempotencyKey(req, reason)
),
        payload: {
          userId: safeUserId,
          reason,
          removedBy: req.user._id,
          revokeResult,
        },
        session,
      });
    });

    clearUserAccessCache(safeUserId);

    return res.json({
      success: true,
      message: "Premium access removed successfully",
      user: updatedUser,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to remove premium access",
    });
  } finally {
    session.endSession();
  }
};

export const extendPremium = async (req, res) => {
  const { userId } = req.params;
  const { days = 30, reason = "" } = req.body;

  const safeUserId = toObjectId(userId);

  if (!safeUserId) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser = null;
    let entitlement = null;
    let newExpiry = null;

    await session.withTransaction(async () => {
      const user = await User.findById(safeUserId).session(session);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      const baseDate =
        user.premiumExpiresAt && user.premiumExpiresAt > new Date()
          ? user.premiumExpiresAt
          : new Date();

      newExpiry = addDays(baseDate, days);

      entitlement = await createAccessEntitlement({
        userId: safeUserId,
        scope: "global",
        source: "admin",
        sourceId: req.user._id,
        planType: user.subscriptionType || "admin_extension",
        accessType: "admin",
        startsAt: new Date(),
        expiresAt: newExpiry,
        metadata: {
          reason,
          extendedBy: req.user._id,
          days,
          previousExpiry: user.premiumExpiresAt || null,
        },
        session,
      });

      updatedUser = await recalculateUserBillingCache({
        userId: safeUserId,
        session,
      });

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "premium_extended",
            targetUserId: safeUserId,
            details: {
              days,
              reason,
              entitlementId: entitlement._id,
              newExpiry,
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "admin.access_extended",
        aggregateType: "access_entitlement",
        aggregateId: entitlement._id,
        userId: safeUserId,
        idempotencyKey: `admin.access_extended:${entitlement._id}`,
        payload: {
          entitlementId: entitlement._id,
          days,
          reason,
          extendedBy: req.user._id,
          newExpiry,
        },
        session,
      });
    });

     clearUserAccessCache(safeUserId);

    return res.json({
      success: true,
      message: "Premium access extended successfully",
      user: updatedUser,
      entitlement,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to extend premium access",
    });
  } finally {
    session.endSession();
  }
};

export const setLifetimeAccess = async (req, res) => {
  const { userId } = req.params;
  const { reason = "Lifetime access enabled by admin" } = req.body || {};

  const safeUserId = toObjectId(userId);

  if (!safeUserId) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser = null;
    let entitlement = null;

    await session.withTransaction(async () => {
      const user = await User.findById(safeUserId).session(session);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      entitlement = await createAccessEntitlement({
        userId: safeUserId,
        scope: "global",
        source: "lifetime",
        sourceId: req.user._id,
        planType: "lifetime",
        accessType: "lifetime",
        startsAt: new Date(),
        expiresAt: null,
        metadata: {
          reason,
          grantedBy: req.user._id,
        },
        session,
      });

      updatedUser = await recalculateUserBillingCache({
        userId: safeUserId,
        session,
      });

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "lifetime_access_enabled",
            targetUserId: safeUserId,
            details: {
              reason,
              entitlementId: entitlement._id,
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "admin.lifetime_enabled",
        aggregateType: "access_entitlement",
        aggregateId: entitlement._id,
        userId: safeUserId,
        idempotencyKey: `admin.lifetime_enabled:${entitlement._id}`,
        payload: {
          entitlementId: entitlement._id,
          reason,
          grantedBy: req.user._id,
        },
        session,
      });
    });

    clearUserAccessCache(safeUserId);

    return res.json({
      success: true,
      message: "Lifetime access enabled successfully",
      user: updatedUser,
      entitlement,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to enable lifetime access",
    });
  } finally {
    session.endSession();
  }
};

export const startTrial = async (req, res) => {
  const { userId } = req.params;
  const settings = await PlatformSettings.getSettings();
  const days = Number(req.body.days || settings.defaultTrialDays || 7);
  const { reason = "" } = req.body || {};

  const safeUserId = toObjectId(userId);

  if (!safeUserId) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser = null;
    let entitlement = null;
    let trialExpiresAt = null;

    await session.withTransaction(async () => {
      const user = await User.findById(safeUserId).session(session);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      trialExpiresAt = addDays(new Date(), days);

      entitlement = await createAccessEntitlement({
        userId: safeUserId,
        scope: "global",
        source: "trial",
        sourceId: req.user._id,
        planType: "trial",
        accessType: "trial",
        startsAt: new Date(),
        expiresAt: trialExpiresAt,
        metadata: {
          reason,
          startedBy: req.user._id,
          days,
        },
        session,
      });

      await User.findByIdAndUpdate(
        safeUserId,
        {
          $set: {
            trialUsed: true,
            trialExpiresAt,
          },
        },
        { session }
      );

      updatedUser = await recalculateUserBillingCache({
        userId: safeUserId,
        session,
      });

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "trial_started",
            targetUserId: safeUserId,
            details: {
              days,
              reason,
              entitlementId: entitlement._id,
              trialExpiresAt,
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "admin.trial_started",
        aggregateType: "access_entitlement",
        aggregateId: entitlement._id,
        userId: safeUserId,
        idempotencyKey: `admin.trial_started:${entitlement._id}`,
        payload: {
          entitlementId: entitlement._id,
          days,
          reason,
          startedBy: req.user._id,
          trialExpiresAt,
        },
        session,
      });
    });

    clearUserAccessCache(safeUserId);

    return res.json({
      success: true,
      message: "Trial started successfully",
      user: updatedUser,
      entitlement,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to start trial",
    });
  } finally {
    session.endSession();
  }
};

export const removeTrial = async (req, res) => {
  const { userId } = req.params;
  const { reason = "Trial removed by admin" } = req.body || {};

  const safeUserId = toObjectId(userId);

  if (!safeUserId) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser = null;
    let revokeResult = null;

    await session.withTransaction(async () => {
      const user = await User.findById(safeUserId).session(session);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      revokeResult = await revokeAccessEntitlements({
        userId: safeUserId,
        source: "trial",
        revokedBy: req.user._id,
        reason,
        session,
      });

      await User.findByIdAndUpdate(
        safeUserId,
        {
          $set: {
            trialExpiresAt: null,
          },
        },
        { session }
      );

      updatedUser = await recalculateUserBillingCache({
        userId: safeUserId,
        session,
      });

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "trial_removed",
            targetUserId: safeUserId,
            details: {
              reason,
              revokeResult,
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "admin.trial_removed",
        aggregateType: "user",
        aggregateId: safeUserId,
        userId: safeUserId,
        idempotencyKey: createDeterministicKey(
  "admin.trial_removed",
  safeUserId,
  getRequestIdempotencyKey(req, reason)
),
        payload: {
          userId: safeUserId,
          reason,
          removedBy: req.user._id,
          revokeResult,
        },
        session,
      });
    });

        clearUserAccessCache(safeUserId);


    return res.json({
      success: true,
      message: "Trial removed successfully",
      user: updatedUser,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to remove trial",
    });
  } finally {
    session.endSession();
  }
};

export const enableOverride = async (req, res) => {
  const { userId } = req.params;
  const { reason = "Admin override enabled" } = req.body || {};

  const safeUserId = toObjectId(userId);

  if (!safeUserId) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser = null;
    let entitlement = null;

    await session.withTransaction(async () => {
      const user = await User.findById(safeUserId).session(session);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      const existingOverride = await AccessEntitlement.findOne({
        userId: safeUserId,
        source: "admin",
        planType: "admin_override",
        status: "active",
      }).session(session);

      if (existingOverride) {
        entitlement = existingOverride;
      } else {
        entitlement = await createAccessEntitlement({
          userId: safeUserId,
          scope: "global",
          source: "admin",
          sourceId: req.user._id,
          planType: "admin_override",
          accessType: "admin",
          startsAt: new Date(),
          expiresAt: null,
          metadata: {
            reason,
            override: true,
            enabledBy: req.user._id,
          },
          session,
        });
      }

      updatedUser = await recalculateUserBillingCache({
        userId: safeUserId,
        session,
      });

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "admin_override_enabled",
            targetUserId: safeUserId,
            details: {
              reason,
              entitlementId: entitlement._id,
              alreadyExisted: Boolean(existingOverride),
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "admin.override_enabled",
        aggregateType: "access_entitlement",
        aggregateId: entitlement._id,
        userId: safeUserId,
        idempotencyKey: `admin.override_enabled:${entitlement._id}`,
        payload: {
          entitlementId: entitlement._id,
          reason,
          enabledBy: req.user._id,
          alreadyExisted: Boolean(existingOverride),
        },
        session,
      });
    });

    clearUserAccessCache(safeUserId);

    return res.json({
      success: true,
      message: "Admin override enabled successfully",
      user: updatedUser,
      entitlement,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to enable admin override",
    });
  } finally {
    session.endSession();
  }
};

export const disableOverride = async (req, res) => {
  const { userId } = req.params;
  const { reason = "Admin override disabled" } = req.body || {};

  const safeUserId = toObjectId(userId);

  if (!safeUserId) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser = null;
    let revokeResult = null;

    await session.withTransaction(async () => {
      const user = await User.findById(safeUserId).session(session);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      revokeResult = await AccessEntitlement.updateMany(
        {
          userId: safeUserId,
          source: "admin",
          planType: "admin_override",
          status: "active",
        },
        {
          $set: {
            status: "revoked",
            revokedAt: new Date(),
            revokedBy: req.user._id,
            revokeReason: reason,
            "metadata.overrideDisabledBy": req.user._id,
            "metadata.overrideDisabledAt": new Date(),
          },
        },
        { session }
      );

      updatedUser = await recalculateUserBillingCache({
        userId: safeUserId,
        session,
      });

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "admin_override_disabled",
            targetUserId: safeUserId,
            details: {
              reason,
              revokeResult,
            },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "admin.override_disabled",
        aggregateType: "user",
        aggregateId: safeUserId,
        userId: safeUserId,
        idempotencyKey: createDeterministicKey(
  "admin.override_disabled",
  safeUserId,
  getRequestIdempotencyKey(req, reason)
),
        payload: {
          userId: safeUserId,
          reason,
          disabledBy: req.user._id,
          revokeResult,
        },
        session,
      });
    });

     clearUserAccessCache(safeUserId);

    return res.json({
      success: true,
      message: "Admin override disabled successfully",
      user: updatedUser,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to disable admin override",
    });
  } finally {
    session.endSession();
  }
};

export const blockUser = async (req, res) => {
  const { userId } = req.params;
  const { reason = "User blocked by admin" } = req.body || {};
  const safeUserId = toObjectId(userId);

  if (!safeUserId) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser = null;

    await session.withTransaction(async () => {
      updatedUser = await User.findByIdAndUpdate(
        safeUserId,
        {
          blocked: true,
          refreshTokens: [],
        },
        { new: true, session }
      ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

      if (!updatedUser) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "user_blocked",
            targetUserId: safeUserId,
            details: { reason },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "admin.user_blocked",
        aggregateType: "user",
        aggregateId: safeUserId,
        userId: safeUserId,
        idempotencyKey: createDeterministicKey(
  "admin.user_blocked",
  safeUserId,
  getRequestIdempotencyKey(req, reason)
),
        payload: {
          userId: safeUserId,
          reason,
          blockedBy: req.user._id,
        },
        session,
      });
    });

    clearUserAccessCache(safeUserId);

    return res.json({
      success: true,
      message: "User blocked successfully",
      user: updatedUser,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to block user",
    });
  } finally {
    session.endSession();
  }
};

export const unblockUser = async (req, res) => {
  const { userId } = req.params;
  const { reason = "User unblocked by admin" } = req.body || {};
  const safeUserId = toObjectId(userId);

  if (!safeUserId) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser = null;

    await session.withTransaction(async () => {
      updatedUser = await User.findByIdAndUpdate(
        safeUserId,
        { blocked: false },
        { new: true, session }
      ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

      if (!updatedUser) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "user_unblocked",
            targetUserId: safeUserId,
            details: { reason },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "admin.user_unblocked",
        aggregateType: "user",
        aggregateId: safeUserId,
        userId: safeUserId,
        idempotencyKey: createDeterministicKey(
  "admin.user_unblocked",
  safeUserId,
  getRequestIdempotencyKey(req, reason)
),
        payload: {
          userId: safeUserId,
          reason,
          unblockedBy: req.user._id,
        },
        session,
      });
    });

    clearUserAccessCache(safeUserId);

    return res.json({
      success: true,
      message: "User unblocked successfully",
      user: updatedUser,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to unblock user",
    });
  } finally {
    session.endSession();
  }
};

export const forceLogoutUser = async (req, res) => {
  const { userId } = req.params;
  const { reason = "User force logged out by admin" } = req.body || {};
  const safeUserId = toObjectId(userId);

  if (!safeUserId) {
    return res.status(400).json({ success: false, message: "Invalid userId" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedUser = null;

    await session.withTransaction(async () => {
      updatedUser = await User.findByIdAndUpdate(
        safeUserId,
        { refreshTokens: [] },
        { new: true, session }
      ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

      if (!updatedUser) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      await AdminLog.create(
        [
          {
            adminId: req.user._id,
            action: "user_force_logout",
            targetUserId: safeUserId,
            details: { reason },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "admin.user_force_logout",
        aggregateType: "user",
        aggregateId: safeUserId,
        userId: safeUserId,
        idempotencyKey: createDeterministicKey(
  "admin.user_force_logout",
  safeUserId,
  getRequestIdempotencyKey(req, reason)
),
        payload: {
          userId: safeUserId,
          reason,
          forcedBy: req.user._id,
        },
        session,
      });
    });

    clearUserAccessCache(safeUserId);

    return res.json({
      success: true,
      message: "User logged out from all devices successfully",
      user: updatedUser,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to force logout user",
    });
  } finally {
    session.endSession();
  }
};

export const listCoupons = async (req, res) => {
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
    const rawSearch = String(search).trim();
    const safeSearch = escapeRegex(rawSearch);

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
};

export const createCoupon = async (req, res) => {
  const payload = {
    ...req.body,
    code: String(req.body.code || "").trim().toUpperCase(),
    category: String(req.body.category || "discount_coupon").trim(),
    createdBy: req.user._id,
  };

  if (!isValidCouponCode(payload.code)) {
  return res.status(400).json({
    success: false,
    message:
      "Coupon code must be 3-50 characters and contain only A-Z, 0-9, _ or -",
  });
}

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

  const session = await mongoose.startSession();

  try {
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

  const update = {
    ...req.body,
    updatedBy: req.user._id,
  };

 if (update.code) update.code = String(update.code).trim().toUpperCase();

if (update.code && !isValidCouponCode(update.code)) {
  return res.status(400).json({
    success: false,
    message:
      "Coupon code must be 3-50 characters and contain only A-Z, 0-9, _ or -",
  });
}

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

if (update.category) update.category = String(update.category).trim();

  const session = await mongoose.startSession();

  try {
    let coupon = null;

    await session.withTransaction(async () => {
      coupon = await Coupon.findOneAndUpdate(
        {
          _id: safeCouponId,
          deletedAt: null,
        },
        update,
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
        idempotencyKey: createDeterministicKey(
  "coupon.updated",
  safeCouponId,
  getRequestIdempotencyKey(req, coupon.updatedAt?.getTime())
),
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
        idempotencyKey: createDeterministicKey(
  "coupon.disabled",
  safeCouponId,
  getRequestIdempotencyKey(req, coupon.updatedAt?.getTime())
),
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
        idempotencyKey: createDeterministicKey(
  "coupon.deleted",
  safeCouponId,
  getRequestIdempotencyKey(req, coupon.deletedAt?.getTime())
),
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
  const { code, planType = "" } = req.body;
  const settings = await PlatformSettings.getSettings();

  if (!settings.couponSystemEnabled) {
    return res.status(403).json({
      success: false,
      valid: false,
      message: "Coupon system is currently disabled",
    });
  }

  const coupon = await Coupon.findOne({
    code: String(code || "").trim().toUpperCase(),
    active: true,
    deletedAt: null,
  });

  if (!coupon) {
    return res.status(404).json({
      success: false,
      valid: false,
      message: "Invalid coupon",
    });
  }

  if (coupon.isExpired()) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: "Coupon has expired",
    });
  }

  if (!coupon.hasRemainingUses()) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: "Coupon usage limit reached",
    });
  }

  if (!coupon.isUserAllowed(req.user._id)) {
    return res.status(403).json({
      success: false,
      valid: false,
      message: "This coupon is not available for your account",
    });
  }

  if (!coupon.isPlanAllowed(planType)) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: "This coupon is not applicable for selected plan",
    });
  }

  return res.json({
    success: true,
    valid: true,
    coupon: {
      code: coupon.code,
      category: coupon.category || "discount_coupon",
      type: coupon.type,
      value: coupon.value,
      expiresAt: coupon.expiresAt,
      applicablePlans: coupon.applicablePlans,
    },
  });
};

const applyCouponCore = async ({
  req,
  res,
  targetUserId,
  appliedByAdmin = false,
}) => {
  const { code, planType = "monthly", tournamentId = null } = req.body;
  const settings = await PlatformSettings.getSettings();

  if (!settings.couponSystemEnabled) {
    return res.status(403).json({
      success: false,
      message: "Coupon system is currently disabled",
    });
  }

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

  const targetUser = await User.findById(safeTargetUserId).select(
    "-password -refreshTokens -resetPasswordToken -resetPasswordExpire"
  );

  if (!targetUser) {
    return res.status(404).json({
      success: false,
      message: "Target user not found",
    });
  }

  const normalizedCode = String(code || "").trim().toUpperCase();
  const now = new Date();
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

      if (coupon.isExpired() || !coupon.hasRemainingUses()) {
        const error = new Error("Coupon is expired or usage limit reached");
        error.statusCode = 400;
        throw error;
      }

      if (
        !coupon.isUserAllowed(safeTargetUserId) ||
        !coupon.isPlanAllowed(planType)
      ) {
        const error = new Error("Coupon is not applicable");
        error.statusCode = 403;
        throw error;
      }

      enforceUserSideFullAccessCouponSafety({
        coupon,
        targetUserId: safeTargetUserId,
        appliedByAdmin,
      });

      const existingRedemption = await CouponRedemption.findOne({
        couponId: coupon._id,
        userId: safeTargetUserId,
      }).session(session);

      if (existingRedemption) {
        const error = new Error("Coupon already used by this account");
        error.statusCode = 409;
        throw error;
      }

      const updatedCoupon = await Coupon.findOneAndUpdate(
        {
          _id: coupon._id,
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
          "Coupon already used, expired, inactive, or usage limit reached"
        );
        error.statusCode = 409;
        throw error;
      }

      let entitlement = null;
      let accessDates = null;

      if (updatedCoupon.type === "full_access") {
        accessDates = await calculateCouponAccessDates({ planType });

        entitlement = await createAccessEntitlement({
          userId: safeTargetUserId,
          scope: accessDates.scope,
          tournamentId:
            accessDates.scope === "tournament" ? tournamentId : null,
          source: "coupon",
          sourceId: updatedCoupon._id,
          planType,
          accessType: accessDates.accessType,
          startsAt: accessDates.startsAt,
          expiresAt: accessDates.expiresAt,
          metadata: {
            couponCode: updatedCoupon.code,
            couponCategory: updatedCoupon.category || "discount_coupon",
            couponType: updatedCoupon.type,
            couponValue: updatedCoupon.value,
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
      }

      const transaction = await PaymentTransaction.create(
        [
          {
            userId: safeTargetUserId,
            amount: 0,
            currency: settings.defaultCurrency || "INR",
            paymentGateway: "coupon",
            paymentId: `coupon_${updatedCoupon.code}_${Date.now()}`,
            planType,
            status: "paid",
            couponUsed: updatedCoupon.code,
            metadata: {
              couponId: updatedCoupon._id,
              entitlementId: entitlement?._id || null,
              couponCategory: updatedCoupon.category || "discount_coupon",
              couponType: updatedCoupon.type,
              couponValue: updatedCoupon.value,
              accessStartsAt: accessDates?.startsAt || null,
              accessExpiresAt: accessDates?.expiresAt || null,
              appliedByAdmin,
              appliedBy: req.user?._id || null,
            },
          },
        ],
        { session }
      );
           

        const redemption = await CouponRedemption.create(
        [
          {
            couponId: updatedCoupon._id,
            userId: safeTargetUserId,
            code: updatedCoupon.code,
            planType,
            category: updatedCoupon.category || "discount_coupon",
            couponType: updatedCoupon.type,
            couponValue: updatedCoupon.value,
            entitlementId: entitlement?._id || null,
            transactionId: transaction[0]._id,
            invoiceId: null,
            metadata: {
              tournamentId,
              accessStartsAt: accessDates?.startsAt || null,
              accessExpiresAt: accessDates?.expiresAt || null,
              appliedByAdmin,
              appliedBy: req.user?._id || null,
            },
          },
        ],
        { session }
      );

      await createBillingEvent({
        eventType: "coupon.redeemed",
        aggregateType: "coupon",
        aggregateId: updatedCoupon._id,
        userId: safeTargetUserId,
        idempotencyKey: `coupon.redeemed:${updatedCoupon._id}:${safeTargetUserId}`,
        payload: {
          couponId: updatedCoupon._id,
          code: updatedCoupon.code,
          planType,
          couponType: updatedCoupon.type,
          couponValue: updatedCoupon.value,
          entitlementId: entitlement?._id || null,
          transactionId: transaction[0]._id,
          redemptionId: redemption[0]._id,
          appliedByAdmin,
          appliedBy: req.user?._id || null,
        },
        session,
      });

      responsePayload = {
        coupon: updatedCoupon,
        entitlement,
        transaction: transaction[0],
        redemption: redemption[0],
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
      paymentGateway: "coupon",
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

    await CouponRedemption.findByIdAndUpdate(responsePayload.redemption._id, {
      $set: {
        invoiceId: invoice?._id || null,
      },
    });

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
    targetUserId: req.user._id,
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

export const listTransactions = async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search = "",
    status = "",
    gateway = "",
    planType = "",
    from = "",
    to = "",
  } = req.query;

  const safePage = normalizePage(page);
  const safeLimit = normalizeLimit(limit);

  const query = {};

  if (status) {
    query.status = status;
  }

  if (gateway) {
    query.paymentGateway = gateway;
  }

  if (planType) {
    query.planType = planType;
  }

  const dateRange = normalizeDateRange({ from, to });

  if (dateRange) {
    query.createdAt = dateRange;
  }

  if (search) {
    const rawSearch = String(search).trim();
    const safeSearch = escapeRegex(rawSearch);

    query.$or = [
      { paymentId: { $regex: safeSearch, $options: "i" } },
      { orderId: { $regex: safeSearch, $options: "i" } },
      { couponUsed: { $regex: safeSearch, $options: "i" } },
      { planType: { $regex: safeSearch, $options: "i" } },
      { paymentGateway: { $regex: safeSearch, $options: "i" } },
    ];

    if (mongoose.Types.ObjectId.isValid(rawSearch)) {
      query.$or.push({ userId: new mongoose.Types.ObjectId(rawSearch) });
    }
  }

  const skip = (safePage - 1) * safeLimit;

  const [transactions, total] = await Promise.all([
    PaymentTransaction.find(query)
      .populate("userId", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    PaymentTransaction.countDocuments(query),
  ]);

  return res.json({
    success: true,
    transactions,
    filters: {
      search,
      status,
      gateway,
      planType,
      from,
      to,
    },
    pagination: buildPagination({
      page: safePage,
      limit: safeLimit,
      total,
    }),
  });
};

export const listAuditLogs = async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search = "",
    action = "",
    adminId = "",
    targetUserId = "",
    from = "",
    to = "",
  } = req.query;

  const safePage = normalizePage(page);
  const safeLimit = normalizeLimit(limit);

  const query = {};

  if (action) {
    query.action = {
      $regex: escapeRegex(String(action).trim()),
      $options: "i",
    };
  }

  if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
    query.adminId = new mongoose.Types.ObjectId(adminId);
  }

  if (targetUserId && mongoose.Types.ObjectId.isValid(targetUserId)) {
    query.targetUserId = new mongoose.Types.ObjectId(targetUserId);
  }

  const dateRange = normalizeDateRange({ from, to });

  if (dateRange) {
    query.timestamp = dateRange;
  }

  if (search) {
    const rawSearch = String(search).trim();
    const safeSearch = escapeRegex(rawSearch);

    query.$or = [
      { action: { $regex: safeSearch, $options: "i" } },
      { ip: { $regex: safeSearch, $options: "i" } },
      { userAgent: { $regex: safeSearch, $options: "i" } },
      { "details.reason": { $regex: safeSearch, $options: "i" } },
      { "details.code": { $regex: safeSearch, $options: "i" } },
    ];

    if (mongoose.Types.ObjectId.isValid(rawSearch)) {
      query.$or.push(
        { adminId: new mongoose.Types.ObjectId(rawSearch) },
        { targetUserId: new mongoose.Types.ObjectId(rawSearch) }
      );
    }
  }

  const skip = (safePage - 1) * safeLimit;

  const [logs, total] = await Promise.all([
    AdminLog.find(query)
      .populate("adminId", "name email role")
      .populate("targetUserId", "name email role")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    AdminLog.countDocuments(query),
  ]);

  return res.json({
    success: true,
    logs,
    filters: {
      search,
      action,
      adminId,
      targetUserId,
      from,
      to,
    },
    pagination: buildPagination({
      page: safePage,
      limit: safeLimit,
      total,
    }),
  });
};

export const reconcileBillingPayments = async (req, res) => {
  const dryRun = String(req.query.dryRun || "true") !== "false";
  const limit = Math.min(
  Math.max(Number(req.query.limit || 50), 1),
  500
);

  const result = await reconcilePayments({
    dryRun,
    limit,
  });

  return res.json({
    success: true,
    message: dryRun
      ? "Payment reconciliation dry-run completed"
      : "Payment reconciliation completed",
    ...result,
  });
};

export const reconcileBillingPaymentById = async (req, res) => {
  const { paymentId } = req.params;
  const dryRun = String(req.query.dryRun || "true") !== "false";

  const result = await reconcileOnePayment({
    paymentId,
    dryRun,
  });

  return res.json({
    success: true,
    message: dryRun
      ? "Single payment reconciliation dry-run completed"
      : "Single payment reconciliation completed",
    dryRun,
    result,
  });
};

export const cleanupStaleBillingPayments = async (req, res) => {
  const olderThanMinutes = Number(req.query.olderThanMinutes || 30);
  const limit = Number(req.query.limit || 100);

  const result = await expireStalePayments({
    olderThanMinutes,
    limit,
    source: "admin_manual_cleanup",
  });

  return res.json({
    success: true,
    message: "Stale payment cleanup completed",
    ...result,
  });
};

export const listInvoices = async (req, res) => {
  const { page = 1, limit = 20, invoiceType = "", status = "" } = req.query;

  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const query = {};

  if (invoiceType) query.invoiceType = invoiceType;
  if (status) query.status = status;

  const skip = (safePage - 1) * safeLimit;

  const [invoices, total] = await Promise.all([
    BillingInvoice.find(query)
      .populate("userId", "name email phone")
      .sort({ issuedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    BillingInvoice.countDocuments(query),
  ]);

  return res.json({
    success: true,
    invoices,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  });
};