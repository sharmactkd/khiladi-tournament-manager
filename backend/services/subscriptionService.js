import mongoose from "mongoose";
import Payment from "../models/payment.js";

export const PREMIUM_FEATURES = {
  TIESHEET: "tiesheet",
  OFFICIALS: "officials",
  TEAM_PAYMENTS: "team_payments",
  TIESHEET_RECORD: "tiesheet_record",
};

export const PLAN_CONFIG = {
  single: {
    amount: 1000,
    accessType: "tournament",
    durationMonths: null,
    features: [
      PREMIUM_FEATURES.TIESHEET,
      PREMIUM_FEATURES.OFFICIALS,
      PREMIUM_FEATURES.TEAM_PAYMENTS,
      PREMIUM_FEATURES.TIESHEET_RECORD,
    ],
  },

  six_months: {
    amount: 2000,
    accessType: "unlimited",
    durationMonths: 6,
    features: [
      PREMIUM_FEATURES.TIESHEET,
      PREMIUM_FEATURES.OFFICIALS,
      PREMIUM_FEATURES.TEAM_PAYMENTS,
      PREMIUM_FEATURES.TIESHEET_RECORD,
    ],
  },

  one_year: {
    amount: 3000,
    accessType: "unlimited",
    durationMonths: 12,
    features: [
      PREMIUM_FEATURES.TIESHEET,
      PREMIUM_FEATURES.OFFICIALS,
      PREMIUM_FEATURES.TEAM_PAYMENTS,
      PREMIUM_FEATURES.TIESHEET_RECORD,
    ],
  },
};

export const getPlanConfig = (planType) => PLAN_CONFIG[planType] || null;

export const addMonths = (date, months) => {
  if (!months) return null;

  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

export const getAccessExpiry = (planType, now = new Date()) => {
  const plan = getPlanConfig(planType);
  if (!plan) return null;

  return addMonths(now, plan.durationMonths);
};

export const getPaymentAccessFields = (planType, now = new Date()) => {
  const plan = getPlanConfig(planType);

  if (!plan) {
    throw new Error("Invalid payment plan");
  }

  return {
    accessType: plan.accessType,
    accessStartsAt: now,
    accessExpiresAt: getAccessExpiry(planType, now),
  };
};

const normalizeId = (value) => {
  if (!value) return null;
  const id = String(value).trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const isFeatureAllowedByPlan = (planType, feature) => {
  const plan = getPlanConfig(planType);
  if (!plan) return false;
  if (!feature) return true;
  return plan.features.includes(feature);
};

export const hasActiveAccess = async ({
  userId,
  tournamentId = null,
  feature = null,
}) => {
  const safeUserId = normalizeId(userId);
  const safeTournamentId = normalizeId(tournamentId);

  if (!safeUserId) {
    return {
      hasAccess: false,
      reason: "invalid-user",
    };
  }

  const now = new Date();

  const unlimitedAccess = await Payment.findOne({
    userId: safeUserId,
    status: "paid",
    accessType: "unlimited",
    accessStartsAt: { $ne: null, $lte: now },
    accessExpiresAt: { $gt: now },
  })
    .sort({ accessExpiresAt: -1 })
    .lean();

  if (
    unlimitedAccess &&
    isFeatureAllowedByPlan(unlimitedAccess.planType, feature)
  ) {
    return {
      hasAccess: true,
      accessType: "unlimited",
      planType: unlimitedAccess.planType,
      paymentId: unlimitedAccess._id,
      tournamentId: safeTournamentId,
      accessStartsAt: unlimitedAccess.accessStartsAt,
      accessExpiresAt: unlimitedAccess.accessExpiresAt,
      feature,
    };
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
      isFeatureAllowedByPlan(tournamentAccess.planType, feature)
    ) {
      return {
        hasAccess: true,
        accessType: "tournament",
        planType: tournamentAccess.planType,
        paymentId: tournamentAccess._id,
        tournamentId: tournamentAccess.tournamentId,
        accessStartsAt: tournamentAccess.accessStartsAt,
        accessExpiresAt: tournamentAccess.accessExpiresAt,
        feature,
      };
    }
  }

  return {
    hasAccess: false,
    paymentRequired: true,
    reason: "premium-access-required",
    feature,
  };
};