import mongoose from "mongoose";
import User from "../models/user.js";
import PlatformSettings from "../models/platformSettings.js";
import Coupon from "../models/coupon.js";
import Payment from "../models/payment.js";

const normalizeId = (value) => {
  if (!value) return null;
  const id = String(value).trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildResult = ({
  hasAccess = false,
  reason = "premium-access-required",
  expiresAt = null,
  source = null,
  accessType = null,
  planType = null,
  paymentId = null,
  tournamentId = null,
  feature = null,
} = {}) => ({
  hasAccess,
  reason,
  expiresAt,
  source,
  accessType,
  planType,
  paymentId,
  tournamentId,
  feature,
});

const isFeatureAllowedByLegacyPlan = (planType, feature) => {
  const legacyFeatures = {
    single: ["tiesheet", "officials", "team_payments", "tiesheet_record"],
    six_months: ["tiesheet", "officials", "team_payments", "tiesheet_record"],
    one_year: ["tiesheet", "officials", "team_payments", "tiesheet_record"],
    monthly: ["tiesheet", "officials", "team_payments", "tiesheet_record"],
    yearly: ["tiesheet", "officials", "team_payments", "tiesheet_record"],
    lifetime: ["tiesheet", "officials", "team_payments", "tiesheet_record"],
  };

  if (!feature) return true;
  return legacyFeatures[planType]?.includes(feature) || false;
};

const findCouponAccess = async ({ userId, planType, now }) => {
  const coupons = await Coupon.find({
    active: true,
    type: "full_access",
    "usedBy.userId": userId,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .sort({ updatedAt: -1 })
    .lean();

  const matchingCoupon = coupons.find((coupon) => {
    const planAllowed =
      !Array.isArray(coupon.applicablePlans) ||
      coupon.applicablePlans.length === 0 ||
      !planType ||
      coupon.applicablePlans.includes(planType);

    return planAllowed;
  });

  return matchingCoupon || null;
};

const hasPremiumAccess = async ({
  userId,
  user = null,
  tournamentId = null,
  feature = null,
  planType = null,
} = {}) => {
  const safeUserId = normalizeId(userId || user?._id || user?.id);
  const safeTournamentId = normalizeId(tournamentId);
  const now = new Date();

  if (!safeUserId) {
    return buildResult({ reason: "invalid-user" });
  }

  const [settings, freshUser] = await Promise.all([
    PlatformSettings.getSettings(),
    user
      ? Promise.resolve(user)
      : User.findById(safeUserId)
          .select(
            "-password -refreshTokens -resetPasswordToken -resetPasswordExpire"
          )
          .lean(),
  ]);

  if (!freshUser) {
    return buildResult({ reason: "user-not-found" });
  }

  if (freshUser.isDeleted) {
    return buildResult({ reason: "user-deleted" });
  }

  if (freshUser.isSuspended || freshUser.blocked) {
    return buildResult({ reason: "user-blocked" });
  }

  if (settings?.maintenanceFreeAccess) {
    return buildResult({
      hasAccess: true,
      reason: "global-free-access",
      source: "global",
      expiresAt: null,
      accessType: "global",
      tournamentId: safeTournamentId,
      feature,
    });
  }

  if (freshUser.adminAccessOverride) {
  const overrideExpiry = normalizeDate(freshUser.premiumExpiresAt);

  if (!overrideExpiry || overrideExpiry > now) {
    return buildResult({
      hasAccess: true,
      reason: "admin-override",
      source: "admin",
      expiresAt: overrideExpiry,
      accessType: "override",
      tournamentId: safeTournamentId,
      feature,
    });
  }

  return buildResult({
    hasAccess: false,
    reason: "admin-override-expired",
    source: "admin",
    expiresAt: overrideExpiry,
    accessType: "override",
    tournamentId: safeTournamentId,
    feature,
  });
}

  if (freshUser.lifetimeAccess) {
    return buildResult({
      hasAccess: true,
      reason: "lifetime-access",
      source: "lifetime",
      expiresAt: null,
      accessType: "lifetime",
      planType: "lifetime",
      tournamentId: safeTournamentId,
      feature,
    });
  }

  const couponAccess = await findCouponAccess({
    userId: safeUserId,
    planType,
    now,
  });

  if (couponAccess) {
    return buildResult({
      hasAccess: true,
      reason: "coupon-access",
      source: "coupon",
      expiresAt: normalizeDate(couponAccess.expiresAt),
      accessType: "coupon",
      planType,
      tournamentId: safeTournamentId,
      feature,
    });
  }

  const activePremiumExpiry = normalizeDate(freshUser.premiumExpiresAt);

  if (
    freshUser.subscriptionStatus === "active" &&
    activePremiumExpiry &&
    activePremiumExpiry > now
  ) {
    return buildResult({
      hasAccess: true,
      reason: "active-subscription",
      source: freshUser.accessSource || "payment",
      expiresAt: activePremiumExpiry,
      accessType: "subscription",
      planType: freshUser.subscriptionType || planType,
      tournamentId: safeTournamentId,
      feature,
    });
  }

  const unlimitedAccess = await Payment.findOne({
    userId: safeUserId,
    status: "paid",
    accessType: "unlimited",
    accessStartsAt: { $ne: null, $lte: now },
    $or: [{ accessExpiresAt: null }, { accessExpiresAt: { $gt: now } }],
  })
    .sort({ accessExpiresAt: -1, createdAt: -1 })
    .lean();

  if (
    unlimitedAccess &&
    isFeatureAllowedByLegacyPlan(unlimitedAccess.planType, feature)
  ) {
    return buildResult({
      hasAccess: true,
      reason: "active-paid-subscription",
      source: "payment",
      expiresAt: normalizeDate(unlimitedAccess.accessExpiresAt),
      accessType: "unlimited",
      planType: unlimitedAccess.planType,
      paymentId: unlimitedAccess._id,
      tournamentId: safeTournamentId,
      feature,
    });
  }

  if (safeTournamentId) {
    const tournamentAccess = await Payment.findOne({
      userId: safeUserId,
      tournamentId: safeTournamentId,
      status: "paid",
      accessType: "tournament",
      accessStartsAt: { $ne: null, $lte: now },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (
      tournamentAccess &&
      isFeatureAllowedByLegacyPlan(tournamentAccess.planType, feature)
    ) {
      return buildResult({
        hasAccess: true,
        reason: "active-tournament-access",
        source: "payment",
        expiresAt: normalizeDate(tournamentAccess.accessExpiresAt),
        accessType: "tournament",
        planType: tournamentAccess.planType,
        paymentId: tournamentAccess._id,
        tournamentId: tournamentAccess.tournamentId,
        feature,
      });
    }
  }

  const trialExpiry = normalizeDate(freshUser.trialExpiresAt);

  if (settings?.trialEnabled && trialExpiry && trialExpiry > now) {
    return buildResult({
      hasAccess: true,
      reason: "trial-access",
      source: "trial",
      expiresAt: trialExpiry,
      accessType: "trial",
      planType: "trial",
      tournamentId: safeTournamentId,
      feature,
    });
  }

  return buildResult({
    hasAccess: false,
    reason: "premium-access-required",
    source: null,
    expiresAt: null,
    tournamentId: safeTournamentId,
    feature,
  });
};

export default hasPremiumAccess;