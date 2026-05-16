import mongoose from "mongoose";
import AccessEntitlement from "../models/accessEntitlement.js";
import PlatformSettings, {
  PREMIUM_FEATURES,
} from "../models/platformSettings.js";

const normalizeId = (value) => {
  if (!value) return null;
  const id = String(value).trim();
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
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

  return [
    ...new Set(
      features.map((item) => normalizeFeature(item)).filter(Boolean)
    ),
  ];
};

export const ENTITLEMENT_PRIORITY = {
  global: 1,
  admin: 2,
  lifetime: 3,
  coupon: 4,
  payment: 5,
  trial: 8,
  migration: 50,
  system: 90,
};

const buildDuplicateLookupQuery = ({ userId, source, sourceId }) => {
  if (!userId || !source || !sourceId) return null;

  if (source === "payment") {
    return {
      source: "payment",
      sourceId,
      status: "active",
    };
  }

  if (source === "coupon") {
    return {
      userId,
      source: "coupon",
      sourceId,
      status: "active",
    };
  }

  return null;
};

export const createAccessEntitlement = async ({
  userId,
  scope = "global",
  tournamentId = null,
  feature = "",
  source,
  sourceId = null,
  planType = "",
  accessType = "unlimited",
  startsAt = new Date(),
  expiresAt = null,
  priority = null,
  metadata = {},
  session = null,
}) => {
  const safeUserId = normalizeId(userId);
  const safeTournamentId = normalizeId(tournamentId);
  const safeSourceId = normalizeId(sourceId);

  if (!safeUserId) {
    throw new Error("Valid userId is required for access entitlement");
  }

  if (!source) {
    throw new Error("source is required for access entitlement");
  }

  const duplicateLookupQuery = buildDuplicateLookupQuery({
    userId: safeUserId,
    source,
    sourceId: safeSourceId,
  });

  if (duplicateLookupQuery) {
    const existing = await AccessEntitlement.findOne(duplicateLookupQuery).session(
      session
    );

    if (existing) {
      return existing;
    }
  }

  const finalPriority =
    priority ?? ENTITLEMENT_PRIORITY[source] ?? ENTITLEMENT_PRIORITY.system;

  try {
    const entitlement = await AccessEntitlement.create(
      [
        {
          userId: safeUserId,
          scope,
          tournamentId: safeTournamentId,
          feature: normalizeFeature(feature),
          source,
          sourceId: safeSourceId,
          planType: String(planType || "").trim(),
          accessType,
          startsAt: normalizeDate(startsAt) || new Date(),
          expiresAt: normalizeDate(expiresAt),
          status: "active",
          priority: finalPriority,
          metadata,
        },
      ],
      session ? { session } : undefined
    );

    return entitlement[0];
  } catch (error) {
    if (error?.code === 11000 && duplicateLookupQuery) {
      const existing = await AccessEntitlement.findOne(
        duplicateLookupQuery
      ).session(session);

      if (existing) {
        return existing;
      }
    }

    throw error;
  }
};

export const revokeAccessEntitlements = async ({
  userId,
  source = null,
  sourceId = null,
  tournamentId = null,
  revokedBy = null,
  reason = "",
  session = null,
}) => {
  const safeUserId = normalizeId(userId);

  if (!safeUserId) {
    throw new Error("Valid userId is required to revoke entitlements");
  }

  const query = {
    userId: safeUserId,
    status: "active",
  };

  if (source) query.source = source;
  if (sourceId) query.sourceId = normalizeId(sourceId);
  if (tournamentId) query.tournamentId = normalizeId(tournamentId);

  return AccessEntitlement.updateMany(
    query,
    {
      $set: {
        status: "revoked",
        revokedAt: new Date(),
        revokedBy: normalizeId(revokedBy),
        revokeReason: String(reason || "").trim(),
      },
    },
    session ? { session } : undefined
  );
};

const entitlementAllowsFeature = ({ entitlement, feature }) => {
  const safeFeature = normalizeFeature(feature);

  if (!safeFeature) return true;

  if (entitlement.scope === "feature") {
    return entitlement.feature === safeFeature;
  }

  const metadataFeatures = normalizeFeatureList(entitlement?.metadata?.features);
  const snapshotFeatures = normalizeFeatureList(
    entitlement?.metadata?.planSnapshot?.features
  );

  const features =
    Array.isArray(entitlement?.metadata?.features) &&
    entitlement.metadata.features.length > 0
      ? metadataFeatures
      : snapshotFeatures;

  return features.includes(safeFeature);
};

export const findBestActiveEntitlement = async ({
  userId,
  tournamentId = null,
  feature = "",
}) => {
  const safeUserId = normalizeId(userId);
  const safeTournamentId = normalizeId(tournamentId);
  const safeFeature = normalizeFeature(feature);
  const now = new Date();

  if (!safeUserId) return null;

  const baseQuery = {
    userId: safeUserId,
    status: "active",
    startsAt: { $lte: now },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  };

  const scopeConditions = [{ scope: "global" }];

  if (safeTournamentId) {
    scopeConditions.push({
      scope: "tournament",
      tournamentId: safeTournamentId,
    });
  }

  if (safeFeature) {
    scopeConditions.push({
      scope: "feature",
      feature: safeFeature,
    });
  }

  const entitlements = await AccessEntitlement.find({
    ...baseQuery,
    $and: [{ $or: scopeConditions }],
  })
    .sort({ priority: 1, expiresAt: -1, createdAt: -1 })
    .limit(20)
    .lean();

  return (
    entitlements.find((entitlement) =>
      entitlementAllowsFeature({ entitlement, feature: safeFeature })
    ) || null
  );
};

export const buildAccessResultFromEntitlement = ({
  entitlement,
  tournamentId = null,
  feature = "",
}) => {
  const safeFeature = normalizeFeature(feature);

  if (!entitlement) {
    return {
      hasAccess: false,
      reason: "premium-access-required",
      expiresAt: null,
      source: null,
      accessType: null,
      planType: null,
      paymentId: null,
      tournamentId,
      feature: safeFeature,
      featureAllowed: false,
      accessPriority: null,
      entitlementId: null,
    };
  }

  return {
    hasAccess: true,
    reason: `${entitlement.source}-entitlement`,
    expiresAt: entitlement.expiresAt || null,
    source: entitlement.source,
    accessType: entitlement.accessType,
    planType: entitlement.planType || null,
    paymentId:
      entitlement.source === "payment" ? entitlement.sourceId || null : null,
    tournamentId: entitlement.tournamentId || tournamentId || null,
    feature: safeFeature,
    featureAllowed: true,
    accessPriority: entitlement.priority,
    entitlementId: entitlement._id,
  };
};