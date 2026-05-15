import PlatformSettings from "../models/platformSettings.js";
import hasPremiumAccess from "../utils/hasPremiumAccess.js";

export const PREMIUM_FEATURES = {
  TIESHEET: "tiesheet",
  OFFICIALS: "officials",
  TEAM_PAYMENTS: "team_payments",
  TIESHEET_RECORD: "tiesheet_record",
};

export const PLAN_CONFIG = {
  single: {
    label: "Single Tournament",
    amount: 1000,
    accessType: "tournament",
    durationDays: null,
    features: Object.values(PREMIUM_FEATURES),
  },
  six_months: {
    label: "6 Months",
    amount: 2000,
    accessType: "unlimited",
    durationDays: 180,
    features: Object.values(PREMIUM_FEATURES),
  },
  one_year: {
    label: "1 Year",
    amount: 3000,
    accessType: "unlimited",
    durationDays: 365,
    features: Object.values(PREMIUM_FEATURES),
  },
};

const getPlanFromSettings = (settings, planType) => {
  if (!settings?.plans || !planType) return null;

  if (settings.plans instanceof Map) {
    return settings.plans.get(planType) || null;
  }

  return settings.plans[planType] || null;
};

export const getPlanConfig = async (planType) => {
  const settings = await PlatformSettings.getSettings();
  const dynamicPlan = getPlanFromSettings(settings, planType);

  if (dynamicPlan && dynamicPlan.enabled) {
    return {
      label: dynamicPlan.label || planType,
      amount: Number(dynamicPlan.price || 0),
      currency: dynamicPlan.currency || settings.defaultCurrency || "INR",
      accessType: dynamicPlan.accessType || "unlimited",
      durationDays:
        dynamicPlan.durationDays === null || dynamicPlan.durationDays === undefined
          ? null
          : Number(dynamicPlan.durationDays),
      features: Object.values(PREMIUM_FEATURES),
    };
  }

  return PLAN_CONFIG[planType] || null;
};

export const getLegacyPlanConfig = (planType) => PLAN_CONFIG[planType] || null;

export const addDays = (date, days) => {
  if (!days) return null;
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days));
  return d;
};

export const getAccessExpiry = async (planType, now = new Date()) => {
  const plan = await getPlanConfig(planType);
  if (!plan) return null;

  if (plan.accessType === "tournament") return null;
  if (!plan.durationDays) return null;

  return addDays(now, plan.durationDays);
};

export const getPaymentAccessFields = async (planType, now = new Date()) => {
  const plan = await getPlanConfig(planType);

  if (!plan) {
    throw new Error("Invalid payment plan");
  }

  return {
    accessType: plan.accessType,
    accessStartsAt: now,
    accessExpiresAt: await getAccessExpiry(planType, now),
  };
};

export const hasActiveAccess = async ({
  userId,
  tournamentId = null,
  feature = null,
}) => {
  const access = await hasPremiumAccess({ userId, tournamentId, feature });

  return {
    ...access,
    paymentRequired: !access.hasAccess,
    accessExpiresAt: access.expiresAt,
  };
};