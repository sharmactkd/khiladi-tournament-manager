import mongoose from "mongoose";
import User from "../models/user.js";
import Coupon from "../models/coupon.js";
import PlatformSettings from "../models/platformSettings.js";
import PaymentTransaction from "../models/paymentTransaction.js";
import AdminLog from "../models/adminLog.js";
import Payment from "../models/payment.js";
import hasPremiumAccess from "../utils/hasPremiumAccess.js";

const toObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(id) : null;

const writeAdminLog = async (req, action, targetUserId = null, details = {}) => {
  try {
    await AdminLog.create({
      adminId: req.user._id,
      action,
      targetUserId,
      details,
      ip: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
  } catch {
    // Never block admin action because audit write failed.
  }
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days));
  return d;
};

export const getBillingDashboard = async (req, res) => {
  const now = new Date();

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
    settings,
  ] = await Promise.all([
    User.countDocuments({ isDeleted: { $ne: true } }),
    User.countDocuments({
      isDeleted: { $ne: true },
      subscriptionStatus: "active",
      premiumExpiresAt: { $gt: now },
    }),
    User.countDocuments({
      isDeleted: { $ne: true },
      premiumExpiresAt: { $lte: now },
      subscriptionStatus: { $in: ["active", "expired"] },
    }),
    User.countDocuments({
      isDeleted: { $ne: true },
      trialExpiresAt: { $gt: now },
    }),
    User.countDocuments({ isDeleted: { $ne: true }, lifetimeAccess: true }),
    User.countDocuments({ isDeleted: { $ne: true }, blocked: true }),
    Coupon.aggregate([{ $group: { _id: null, total: { $sum: "$usedCount" } } }]),
    PaymentTransaction.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    PaymentTransaction.aggregate([
      {
        $match: {
          status: "paid",
          createdAt: {
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
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
        totalRevenue: revenueAgg[0]?.total || 0,
        totalTransactions: revenueAgg[0]?.count || 0,
        monthlyRevenue: monthlyRevenueAgg[0]?.total || 0,
        monthlyTransactions: monthlyRevenueAgg[0]?.count || 0,
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
    query.subscriptionStatus = "active";
    query.premiumExpiresAt = { $gt: now };
  }

  if (filter === "expired") {
    query.premiumExpiresAt = { $lte: now };
  }

  if (filter === "blocked") {
    query.blocked = true;
  }

  if (filter === "trial") {
    query.trialExpiresAt = { $gt: now };
  }

  if (filter === "lifetime") {
    query.lifetimeAccess = true;
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
      return { ...user, premiumAccess: access };
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

  const user = await User.findByIdAndUpdate(
    userId,
    {
      subscriptionStatus: "none",
      subscriptionType: "none",
      premiumExpiresAt: null,
      lifetimeAccess: false,
      adminAccessOverride: false,
      accessSource: null,
    },
    { new: true }
  ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await writeAdminLog(req, "premium_removed", userId);

  return res.json({
    success: true,
    message: "Premium access removed successfully",
    user,
  });
};

export const extendPremium = async (req, res) => {
  const { userId } = req.params;
  const { days = 30, reason = "" } = req.body;

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const baseDate =
    user.premiumExpiresAt && user.premiumExpiresAt > new Date()
      ? user.premiumExpiresAt
      : new Date();

  user.subscriptionStatus = "active";
  user.premiumExpiresAt = addDays(baseDate, days);
  user.accessSource = user.accessSource || "admin";
  await user.save();

  await writeAdminLog(req, "premium_extended", userId, { days, reason });

  return res.json({
    success: true,
    message: "Premium access extended successfully",
    user,
  });
};

export const setLifetimeAccess = async (req, res) => {
  const { userId } = req.params;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      subscriptionStatus: "lifetime",
      subscriptionType: "lifetime",
      premiumExpiresAt: null,
      lifetimeAccess: true,
      accessSource: "lifetime",
    },
    { new: true }
  ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await writeAdminLog(req, "lifetime_access_enabled", userId);

  return res.json({
    success: true,
    message: "Lifetime access enabled successfully",
    user,
  });
};

export const startTrial = async (req, res) => {
  const { userId } = req.params;
  const settings = await PlatformSettings.getSettings();
  const days = Number(req.body.days || settings.defaultTrialDays || 7);

  const user = await User.findByIdAndUpdate(
    userId,
    {
      subscriptionStatus: "trial",
      subscriptionType: "trial",
      trialUsed: true,
      trialExpiresAt: addDays(new Date(), days),
      accessSource: "trial",
    },
    { new: true }
  ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await writeAdminLog(req, "trial_started", userId, { days });

  return res.json({
    success: true,
    message: "Trial started successfully",
    user,
  });
};

export const removeTrial = async (req, res) => {
  const { userId } = req.params;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      trialExpiresAt: null,
      subscriptionStatus: "none",
      subscriptionType: "none",
      accessSource: null,
    },
    { new: true }
  ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await writeAdminLog(req, "trial_removed", userId);

  return res.json({
    success: true,
    message: "Trial removed successfully",
    user,
  });
};

export const enableOverride = async (req, res) => {
  const { userId } = req.params;

  const user = await User.findByIdAndUpdate(
    userId,
    { adminAccessOverride: true, accessSource: "admin" },
    { new: true }
  ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await writeAdminLog(req, "admin_override_enabled", userId);

  return res.json({
    success: true,
    message: "Admin override enabled successfully",
    user,
  });
};

export const disableOverride = async (req, res) => {
  const { userId } = req.params;

  const user = await User.findByIdAndUpdate(
    userId,
    { adminAccessOverride: false },
    { new: true }
  ).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  await writeAdminLog(req, "admin_override_disabled", userId);

  return res.json({
    success: true,
    message: "Admin override disabled successfully",
    user,
  });
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
  const coupons = await Coupon.find({})
    .populate("createdBy", "name email role")
    .sort({ createdAt: -1 })
    .lean();

  return res.json({ success: true, coupons });
};

export const createCoupon = async (req, res) => {
  const payload = {
    ...req.body,
    code: String(req.body.code || "").trim().toUpperCase(),
    createdBy: req.user._id,
  };

  const existing = await Coupon.findOne({ code: payload.code });

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

  const coupon = await Coupon.findByIdAndUpdate(couponId, update, {
    new: true,
    runValidators: true,
  });

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

  const coupon = await Coupon.findByIdAndUpdate(
    couponId,
    { active: false, updatedBy: req.user._id },
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

  const coupon = await Coupon.findByIdAndDelete(couponId);

  if (!coupon) {
    return res.status(404).json({ success: false, message: "Coupon not found" });
  }

  await writeAdminLog(req, "coupon_deleted", null, { couponId, code: coupon.code });

  return res.json({
    success: true,
    message: "Coupon deleted successfully",
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
      type: coupon.type,
      value: coupon.value,
      expiresAt: coupon.expiresAt,
      applicablePlans: coupon.applicablePlans,
    },
  });
};

export const applyCoupon = async (req, res) => {
  const { code, planType = "monthly" } = req.body;
  const settings = await PlatformSettings.getSettings();

  if (!settings.couponSystemEnabled) {
    return res.status(403).json({
      success: false,
      message: "Coupon system is currently disabled",
    });
  }

  const normalizedCode = String(code || "").trim().toUpperCase();
  const now = new Date();

  const coupon = await Coupon.findOne({
    code: normalizedCode,
    active: true,
  });

  if (!coupon) {
    return res.status(404).json({ success: false, message: "Invalid coupon" });
  }

  if (coupon.isExpired() || !coupon.hasRemainingUses()) {
    return res.status(400).json({
      success: false,
      message: "Coupon is expired or usage limit reached",
    });
  }

  if (!coupon.isUserAllowed(req.user._id) || !coupon.isPlanAllowed(planType)) {
    return res.status(403).json({
      success: false,
      message: "Coupon is not applicable",
    });
  }

  const updatedCoupon = await Coupon.findOneAndUpdate(
    {
      _id: coupon._id,
      active: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      $expr: {
        $or: [
          { $eq: ["$maxUses", null] },
          { $lt: ["$usedCount", "$maxUses"] },
        ],
      },
      "usedBy.userId": { $ne: req.user._id },
    },
    {
      $inc: { usedCount: 1 },
      $push: {
        usedBy: {
          userId: req.user._id,
          usedAt: now,
          planType,
        },
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!updatedCoupon) {
    return res.status(409).json({
      success: false,
      message: "Coupon already used, expired, inactive, or usage limit reached",
    });
  }

  if (updatedCoupon.type === "full_access") {
    await User.findByIdAndUpdate(req.user._id, {
      subscriptionStatus: planType === "lifetime" ? "lifetime" : "active",
      subscriptionType: planType,
      premiumExpiresAt: planType === "lifetime" ? null : addDays(new Date(), 30),
      lifetimeAccess: planType === "lifetime",
      accessSource: "coupon",
      lastPaymentDate: new Date(),
    });
  }

  await PaymentTransaction.create({
    userId: req.user._id,
    amount: 0,
    currency: settings.defaultCurrency || "INR",
    paymentGateway: "coupon",
    paymentId: `coupon_${updatedCoupon.code}_${Date.now()}`,
    planType,
    status: "paid",
    couponUsed: updatedCoupon.code,
    metadata: {
      couponId: updatedCoupon._id,
      couponType: updatedCoupon.type,
      couponValue: updatedCoupon.value,
    },
  });

  return res.json({
    success: true,
    message: "Coupon applied successfully",
    coupon: {
      code: updatedCoupon.code,
      type: updatedCoupon.type,
      value: updatedCoupon.value,
    },
  });
};

export const listTransactions = async (req, res) => {
  const transactions = await PaymentTransaction.find({})
    .populate("userId", "name email phone")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  return res.json({ success: true, transactions });
};

export const listAuditLogs = async (req, res) => {
  const logs = await AdminLog.find({})
    .populate("adminId", "name email role")
    .populate("targetUserId", "name email role")
    .sort({ timestamp: -1 })
    .limit(500)
    .lean();

  return res.json({ success: true, logs });
};