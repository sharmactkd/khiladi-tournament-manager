import mongoose from "mongoose";
import User from "../models/user.js";
import {
  findBestActiveEntitlement,
  buildAccessResultFromEntitlement,
} from "../services/accessEntitlementService.js";
import {
  buildAccessCacheKey,
  getCachedAccess,
  setCachedAccess,
} from "../services/accessCacheService.js";

const normalizeId = (value) => {
  if (!value) return null;
  const id = String(value).trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const normalizeFeature = (feature) => String(feature || "").trim();

const buildDeniedResult = ({
  reason = "premium-access-required",
  tournamentId = null,
  feature = "",
} = {}) => ({
  hasAccess: false,
  reason,
  expiresAt: null,
  source: null,
  accessType: null,
  planType: null,
  paymentId: null,
  tournamentId,
  feature: normalizeFeature(feature),
  featureAllowed: false,
  accessPriority: null,
  entitlementId: null,
});

const hasPremiumAccess = async ({
  userId,
  user = null,
  tournamentId = null,
  feature = null,
} = {}) => {
  const safeUserId = normalizeId(userId || user?._id || user?.id);
  const safeTournamentId = normalizeId(tournamentId);
  const safeFeature = normalizeFeature(feature);

  const cacheKey = buildAccessCacheKey({
    userId: safeUserId,
    tournamentId: safeTournamentId || "",
    feature: safeFeature,
  });

  const cached = getCachedAccess(cacheKey);

  if (cached) {
    return cached;
  }

  const deny = (payload = {}) =>
    setCachedAccess(
      cacheKey,
      buildDeniedResult({
        tournamentId: safeTournamentId,
        feature: safeFeature,
        ...payload,
      })
    );

  if (!safeUserId) {
    return deny({ reason: "invalid-user" });
  }

  const freshUser =
    user ||
    (await User.findById(safeUserId)
      .select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire")
      .lean());

  if (!freshUser) {
    return deny({ reason: "user-not-found" });
  }

  if (freshUser.isDeleted) {
    return deny({ reason: "user-deleted" });
  }

  if (freshUser.isSuspended || freshUser.blocked) {
    return deny({ reason: "user-blocked" });
  }

  const entitlement = await findBestActiveEntitlement({
    userId: safeUserId,
    tournamentId: safeTournamentId,
    feature: safeFeature,
  });

  if (!entitlement) {
    return deny({ reason: "no-active-entitlement" });
  }

  const result = buildAccessResultFromEntitlement({
    entitlement,
    tournamentId: safeTournamentId,
    feature: safeFeature,
  });

  return setCachedAccess(cacheKey, result);
};

export default hasPremiumAccess;