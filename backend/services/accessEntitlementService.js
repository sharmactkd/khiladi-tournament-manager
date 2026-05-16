import mongoose from "mongoose";
import AccessEntitlement from "../models/accessEntitlement.js";

const normalizeId = (value) => {
  if (!value) return null;
  const id = String(value).trim();
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

  const finalPriority =
    priority ?? ENTITLEMENT_PRIORITY[source] ?? ENTITLEMENT_PRIORITY.system;

  const entitlement = await AccessEntitlement.create(
    [
      {
        userId: safeUserId,
        scope,
        tournamentId: safeTournamentId,
        feature: String(feature || "").trim(),
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
  const query = {
    userId: normalizeId(userId),
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

export const findBestActiveEntitlement = async ({
  userId,
  tournamentId = null,
  feature = "",
}) => {
  const safeUserId = normalizeId(userId);
  const safeTournamentId = normalizeId(tournamentId);
  const safeFeature = String(feature || "").trim();
  const now = new Date();

  if (!safeUserId) return null;

  const query = {
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

  query.$and = [{ $or: scopeConditions }];

  return AccessEntitlement.findOne(query)
    .sort({ priority: 1, expiresAt: -1, createdAt: -1 })
    .lean();
};

export const buildAccessResultFromEntitlement = ({
  entitlement,
  tournamentId = null,
  feature = "",
}) => {
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
      feature,
      featureAllowed: false,
      accessPriority: null,
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
    feature,
    featureAllowed: true,
    accessPriority: entitlement.priority,
    entitlementId: entitlement._id,
  };
};