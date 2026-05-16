import PlatformSettings, {
  PREMIUM_FEATURES,
} from "../models/platformSettings.js";
import hasPremiumAccess from "../utils/hasPremiumAccess.js";

export { PREMIUM_FEATURES };

export const PLAN_CONFIG = {
  single: {
    label: "Single Tournament",
    amount: 1000,
    accessType: "tournament",
    durationDays: null,
    features: Object.values(PREMIUM_FEATURES),
    version: 1,
    source: "legacy_config",
  },
  six_months: {
    label: "6 Months",
    amount: 2000,
    accessType: "unlimited",
    durationDays: 180,
    features: Object.values(PREMIUM_FEATURES),
    version: 1,
    source: "legacy_config",
  },
  one_year: {
    label: "1 Year",
    amount: 3000,
    accessType: "unlimited",
    durationDays: 365,
    features: Object.values(PREMIUM_FEATURES),
    version: 1,
    source: "legacy_config",
  },
};

const normalizeFeatures = (features) => {
  if (!Array.isArray(features) || features.length === 0) {
    return Object.values(PREMIUM_FEATURES);
  }

  return [
    ...new Set(
      features.map((item) => String(item || "").trim()).filter(Boolean)
    ),
  ];
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
      features: normalizeFeatures(dynamicPlan.features),
      version: Number(dynamicPlan.version || 1),
      source: "platform_settings",
      planUpdatedAt: dynamicPlan.updatedAt || null,
    };
  }

  const legacyPlan = PLAN_CONFIG[planType];

  if (!legacyPlan) return null;

  return {
    ...legacyPlan,
    currency: settings.defaultCurrency || "INR",
    features: normalizeFeatures(legacyPlan.features),
    version: Number(legacyPlan.version || 1),
    source: "legacy_config",
    planUpdatedAt: null,
  };
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

export const isFeatureAllowedByPlanSnapshot = (planSnapshot, feature) => {
  if (!feature) return true;

  const features = normalizeFeatures(planSnapshot?.features);

  return features.includes(feature);
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