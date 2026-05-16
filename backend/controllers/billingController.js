import mongoose from "mongoose";
import User from "../models/user.js";
import Coupon from "../models/coupon.js";
import PlatformSettings from "../models/platformSettings.js";
import PaymentTransaction from "../models/paymentTransaction.js";
import AdminLog from "../models/adminLog.js";
import Payment from "../models/payment.js";
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

  const activeEntitledUserIds = await getActiveEntitledUserIds({ now });

  const [
    totalUsers,
    activePremiumUsers,
    expiredUsers,
    trialUsers,
    lifetimeUsers,
    blockedUsers,
    couponsUsedAgg,
    revenueAgg,
    monthlyRevenueAgg,
    nonCashAccessAgg,
    monthlyNonCashAccessAgg,
    settings,
  ] = await Promise.all([
    User.countDocuments({ isDeleted: { $ne: true } }),

    activeEntitledUserIds.length
      ? User.countDocuments({
          _id: { $in: activeEntitledUserIds },
          isDeleted: { $ne: true },
        })
      : 0,

    AccessEntitlement.distinct("userId", {
      status: "active",
      expiresAt: { $ne: null, $lte: now },
    }).then((userIds) =>
      userIds.length
        ? User.countDocuments({
            _id: { $in: userIds },
            isDeleted: { $ne: true },
          })
        : 0
    ),

    countActiveEntitledUsers({ source: "trial", now }),

    countActiveEntitledUsers({ accessType: "lifetime", now }),

    User.countDocuments({ isDeleted: { $ne: true }, blocked: true }),

    Coupon.aggregate([{ $group: { _id: null, total: { $sum: "$usedCount" } } }]),

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
          createdAt: {
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          },
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
          createdAt: {
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          },
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

  return res.json({
    success: true,
    dashboard: {
      totalUsers,
      activePremiumUsers,
      expiredUsers,
      trialUsers,
      lifetimeUsers,
      blockedUsers,
      couponsUsed: couponsUsedAgg[0]?.total || 0,
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
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
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

export const grantPremium = async (req, res) => {
  const { userId } = req.params;
  const { planType = "monthly", days = 30, reason = "" } = req.body;

  const expiresAt = planType === "lifetime" ? null : addDays(new Date(), days);

  const update =
    planType === "lifetime"
      ? {
          subscriptionStatus: "lifetime",
          subscriptionType: "lifetime",
          premiumExpiresAt: null,
          lifetimeAccess: true,
          accessSource: "lifetime",
        }
      : {
          subscriptionStatus: "active",
          subscriptionType: planType,
          premiumExpiresAt: expiresAt,
          accessSource: "admin",
        };

  const user = await User.findByIdAndUpdate(userId, update, {
    new: true,
  }).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await writeAdminLog(req, "premium_granted", userId, { planType, days, reason });

  return res.json({
    success: true,
    message: "Premium access granted successfully",
    user,
  });
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

    await session.withTransaction(async () => {
      await revokeAccessEntitlements({
        userId: safeUserId,
        revokedBy: req.user._id,
        reason,
        session,
      });

      updatedUser = await User.findByIdAndUpdate(
        safeUserId,
        {
          subscriptionStatus: "none",
          subscriptionType: "none",
          premiumExpiresAt: null,
          lifetimeAccess: false,
          adminAccessOverride: false,
          accessSource: null,
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
            action: "premium_removed",
            targetUserId: safeUserId,
            details: { reason },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );
    });

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

      const newExpiry = addDays(baseDate, days);

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

      updatedUser = await User.findByIdAndUpdate(
        safeUserId,
        {
          subscriptionStatus: "active",
          subscriptionType: user.subscriptionType || "monthly",
          premiumExpiresAt: newExpiry,
          accessSource: "admin",
        },
        { new: true, session }
      ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

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
    });

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

      updatedUser = await User.findByIdAndUpdate(
        safeUserId,
        {
          subscriptionStatus: "lifetime",
          subscriptionType: "lifetime",
          premiumExpiresAt: null,
          lifetimeAccess: true,
          accessSource: "lifetime",
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
    });

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

    await session.withTransaction(async () => {
      const trialExpiresAt = addDays(new Date(), days);

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

      updatedUser = await User.findByIdAndUpdate(
        safeUserId,
        {
          subscriptionStatus: "trial",
          subscriptionType: "trial",
          trialUsed: true,
          trialExpiresAt,
          accessSource: "trial",
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
    });

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

    await session.withTransaction(async () => {
      await revokeAccessEntitlements({
        userId: safeUserId,
        source: "trial",
        revokedBy: req.user._id,
        reason,
        session,
      });

      updatedUser = await User.findByIdAndUpdate(
        safeUserId,
        {
          trialExpiresAt: null,
          subscriptionStatus: "none",
          subscriptionType: "none",
          accessSource: null,
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
            action: "trial_removed",
            targetUserId: safeUserId,
            details: { reason },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );
    });

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

      updatedUser = await User.findByIdAndUpdate(
        safeUserId,
        {
          adminAccessOverride: true,
          accessSource: "admin",
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
            action: "admin_override_enabled",
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
    });

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

    await session.withTransaction(async () => {
      await revokeAccessEntitlements({
        userId: safeUserId,
        source: "admin",
        revokedBy: req.user._id,
        reason,
        session,
      });

      updatedUser = await User.findByIdAndUpdate(
        safeUserId,
        { adminAccessOverride: false },
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
            action: "admin_override_disabled",
            targetUserId: safeUserId,
            details: { reason },
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
          },
        ],
        { session }
      );
    });

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

  const user = await User.findByIdAndUpdate(
    userId,
    {
      blocked: true,
      refreshTokens: [],
    },
    { new: true }
  ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await writeAdminLog(req, "user_blocked", userId);

  return res.json({
    success: true,
    message: "User blocked successfully",
    user,
  });
};

export const unblockUser = async (req, res) => {
  const { userId } = req.params;

  const user = await User.findByIdAndUpdate(
    userId,
    { blocked: false },
    { new: true }
  ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await writeAdminLog(req, "user_unblocked", userId);

  return res.json({
    success: true,
    message: "User unblocked successfully",
    user,
  });
};

export const forceLogoutUser = async (req, res) => {
  const { userId } = req.params;

  const user = await User.findByIdAndUpdate(
    userId,
    { refreshTokens: [] },
    { new: true }
  ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await writeAdminLog(req, "user_force_logout", userId);

  return res.json({
    success: true,
    message: "User logged out from all devices successfully",
  });
};

export const listCoupons = async (req, res) => {
  const { includeDeleted = "false" } = req.query;

  const query =
    includeDeleted === "true"
      ? {}
      : {
          deletedAt: null,
        };

  const coupons = await Coupon.find(query)
    .populate("createdBy", "name email role")
    .populate("updatedBy", "name email role")
    .populate("deletedBy", "name email role")
    .sort({ createdAt: -1 })
    .lean();

  return res.json({ success: true, coupons });
};

export const createCoupon = async (req, res) => {
const payload = {
  ...req.body,
  code: String(req.body.code || "").trim().toUpperCase(),
  category: String(req.body.category || "discount_coupon").trim(),
  createdBy: req.user._id,
};

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

  const coupon = await Coupon.create(payload);
  await writeAdminLog(req, "coupon_created", null, { couponId: coupon._id, code: coupon.code });

  return res.status(201).json({
    success: true,
    message: "Coupon created successfully",
    coupon,
  });
};

export const updateCoupon = async (req, res) => {
  const { couponId } = req.params;

  const update = {
    ...req.body,
    updatedBy: req.user._id,
  };

  if (update.code) update.code = String(update.code).trim().toUpperCase();
if (update.category) update.category = String(update.category).trim();

  const coupon = await Coupon.findOneAndUpdate(
    {
      _id: couponId,
      deletedAt: null,
    },
    update,
    {
      new: true,
      runValidators: true,
    }
  );

  if (!coupon) {
    return res.status(404).json({ success: false, message: "Coupon not found" });
  }

  await writeAdminLog(req, "coupon_updated", null, { couponId, update });

  return res.json({
    success: true,
    message: "Coupon updated successfully",
    coupon,
  });
}; 

export const disableCoupon = async (req, res) => {
  const { couponId } = req.params;

  const coupon = await Coupon.findOneAndUpdate(
    {
      _id: couponId,
      deletedAt: null,
    },
    {
      active: false,
      updatedBy: req.user._id,
    },
    { new: true }
  );

  if (!coupon) {
    return res.status(404).json({ success: false, message: "Coupon not found" });
  }

  await writeAdminLog(req, "coupon_disabled", null, { couponId });

  return res.json({
    success: true,
    message: "Coupon disabled successfully",
    coupon,
  });
};

export const deleteCoupon = async (req, res) => {
  const { couponId } = req.params;
  const { reason = "" } = req.body || {};

  const coupon = await Coupon.findOneAndUpdate(
    {
      _id: couponId,
      deletedAt: null,
    },
    {
      active: false,
      deletedAt: new Date(),
      deletedBy: req.user._id,
      deleteReason: String(reason || "").trim(),
      updatedBy: req.user._id,
    },
    { new: true }
  );

  if (!coupon) {
    return res.status(404).json({ success: false, message: "Coupon not found" });
  }

  await writeAdminLog(req, "coupon_soft_deleted", null, {
    couponId,
    code: coupon.code,
    reason,
  });

  return res.json({
    success: true,
    message: "Coupon deleted successfully",
    coupon,
  });
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
  code: String(code).trim().toUpperCase(),
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

const applyCouponCore = async ({ req, res, targetUserId, appliedByAdmin = false }) => {
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

      if (!coupon.isUserAllowed(safeTargetUserId) || !coupon.isPlanAllowed(planType)) {
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
          "usedBy.userId": { $ne: safeTargetUserId },
        },
        {
          $inc: { usedCount: 1 },
          $push: {
            usedBy: {
              userId: safeTargetUserId,
              usedAt: now,
              planType,
              category: coupon.category || "discount_coupon",
            },
          },
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
          tournamentId: accessDates.scope === "tournament" ? tournamentId : null,
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

        await User.findByIdAndUpdate(
          safeTargetUserId,
          {
            $set: {
              subscriptionStatus: planType === "lifetime" ? "lifetime" : "active",
              subscriptionType: planType,
              premiumExpiresAt:
                planType === "lifetime" || accessDates.scope === "tournament"
                  ? null
                  : accessDates.expiresAt,
              lifetimeAccess: planType === "lifetime",
              accessSource: "coupon",
              lastPaymentDate: new Date(),
            },
          },
          { session }
        );
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
    const safeSearch = String(search).trim();

    query.$or = [
      { paymentId: { $regex: safeSearch, $options: "i" } },
      { orderId: { $regex: safeSearch, $options: "i" } },
      { couponUsed: { $regex: safeSearch, $options: "i" } },
      { planType: { $regex: safeSearch, $options: "i" } },
      { paymentGateway: { $regex: safeSearch, $options: "i" } },
    ];

    if (mongoose.Types.ObjectId.isValid(safeSearch)) {
      query.$or.push({ userId: new mongoose.Types.ObjectId(safeSearch) });
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
    query.action = { $regex: String(action).trim(), $options: "i" };
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
    const safeSearch = String(search).trim();

    query.$or = [
      { action: { $regex: safeSearch, $options: "i" } },
      { ip: { $regex: safeSearch, $options: "i" } },
      { userAgent: { $regex: safeSearch, $options: "i" } },
      { "details.reason": { $regex: safeSearch, $options: "i" } },
      { "details.code": { $regex: safeSearch, $options: "i" } },
    ];

    if (mongoose.Types.ObjectId.isValid(safeSearch)) {
      query.$or.push(
        { adminId: new mongoose.Types.ObjectId(safeSearch) },
        { targetUserId: new mongoose.Types.ObjectId(safeSearch) }
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
  const limit = Number(req.query.limit || 50);

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