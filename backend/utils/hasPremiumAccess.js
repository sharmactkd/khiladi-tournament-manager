import mongoose from "mongoose";
import User from "../models/user.js";
import PlatformSettings, {
  PREMIUM_FEATURES,
} from "../models/platformSettings.js";
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

const normalizeFeature = (feature) => String(feature || "").trim();

const normalizeFeatureList = (features) => {
  if (!Array.isArray(features) || features.length === 0) {
    return Object.values(PREMIUM_FEATURES);
  }

  return [...new Set(features.map((item) => normalizeFeature(item)).filter(Boolean))];
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
  featureAllowed = null,
  accessPriority = null,
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
  featureAllowed,
  accessPriority,
});

const isFeatureAllowedByPayment = (payment, feature) => {
  const safeFeature = normalizeFeature(feature);

  if (!safeFeature) return true;

  const features = normalizeFeatureList(payment?.planSnapshot?.features);

  return features.includes(safeFeature);
};

const findCouponAccess = async ({ userId, planType, now }) => {
 const coupons = await Coupon.find({
  active: true,
  deletedAt: null,
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
  const safeFeature = normalizeFeature(feature);
  const now = new Date();

  if (!safeUserId) {
    return buildResult({ reason: "invalid-user", feature: safeFeature });
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
    return buildResult({ reason: "user-not-found", feature: safeFeature });
  }

  if (freshUser.isDeleted) {
    return buildResult({ reason: "user-deleted", feature: safeFeature });
  }

  if (freshUser.isSuspended || freshUser.blocked) {
    return buildResult({ reason: "user-blocked", feature: safeFeature });
  }

  if (settings?.maintenanceFreeAccess) {
    return buildResult({
      hasAccess: true,
      reason: "global-free-access",
      source: "global",
      expiresAt: null,
      accessType: "global",
      tournamentId: safeTournamentId,
      feature: safeFeature,
      featureAllowed: true,
      accessPriority: 1,
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
        feature: safeFeature,
        featureAllowed: true,
        accessPriority: 2,
      });
    }

    return buildResult({
      hasAccess: false,
      reason: "admin-override-expired",
      source: "admin",
      expiresAt: overrideExpiry,
      accessType: "override",
      tournamentId: safeTournamentId,
      feature: safeFeature,
      featureAllowed: false,
      accessPriority: 2,
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
      feature: safeFeature,
      featureAllowed: true,
      accessPriority: 3,
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
      feature: safeFeature,
      featureAllowed: true,
      accessPriority: 4,
    });
  }

  const activePremiumExpiry = normalizeDate(freshUser.premiumExpiresAt);

  if (
    freshUser.subscriptionStatus === "active" &&
    activePremiumExpiry &&
    activePremiumExpiry > now
  ) {
    const userPlanType = freshUser.subscriptionType || planType;

    const paidSubscription = await Payment.findOne({
      userId: safeUserId,
      status: "paid",
      accessType: "unlimited",
      planType: userPlanType,
      accessStartsAt: { $ne: null, $lte: now },
      $or: [{ accessExpiresAt: null }, { accessExpiresAt: { $gt: now } }],
    })
      .sort({ accessExpiresAt: -1, createdAt: -1 })
      .lean();

    if (!paidSubscription || isFeatureAllowedByPayment(paidSubscription, safeFeature)) {
      return buildResult({
        hasAccess: true,
        reason: "active-subscription",
        source: freshUser.accessSource || "payment",
        expiresAt: activePremiumExpiry,
        accessType: "subscription",
        planType: userPlanType,
        paymentId: paidSubscription?._id || null,
        tournamentId: safeTournamentId,
        feature: safeFeature,
        featureAllowed: true,
        accessPriority: 5,
      });
    }
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

  if (unlimitedAccess && isFeatureAllowedByPayment(unlimitedAccess, safeFeature)) {
    return buildResult({
      hasAccess: true,
      reason: "active-paid-subscription",
      source: "payment",
      expiresAt: normalizeDate(unlimitedAccess.accessExpiresAt),
      accessType: "unlimited",
      planType: unlimitedAccess.planType,
      paymentId: unlimitedAccess._id,
      tournamentId: safeTournamentId,
      feature: safeFeature,
      featureAllowed: true,
      accessPriority: 6,
    });
  }

  if (safeTournamentId) {
    const tournamentAccess = await Payment.findOne({
      userId: safeUserId,
      tournamentId: safeTournamentId,
      status: "paid",
      accessType: "tournament",
      accessStartsAt: { $ne: null, $lte: now },
      $or: [
        { accessLifecycle: "single_tournament_lifetime" },
        { accessExpiresAt: null },
        { accessExpiresAt: { $gt: now } },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    if (tournamentAccess && isFeatureAllowedByPayment(tournamentAccess, safeFeature)) {
      return buildResult({
        hasAccess: true,
        reason: "active-tournament-access",
        source: "payment",
        expiresAt: normalizeDate(tournamentAccess.accessExpiresAt),
        accessType: "tournament",
        planType: tournamentAccess.planType,
        paymentId: tournamentAccess._id,
        tournamentId: tournamentAccess.tournamentId,
        feature: safeFeature,
        featureAllowed: true,
        accessPriority: 7,
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
      feature: safeFeature,
      featureAllowed: true,
      accessPriority: 8,
    });
  }

  return buildResult({
    hasAccess: false,
    reason: "premium-access-required",
    source: null,
    expiresAt: null,
    tournamentId: safeTournamentId,
    feature: safeFeature,
    featureAllowed: false,
    accessPriority: null,
  });
};

export default hasPremiumAccess;