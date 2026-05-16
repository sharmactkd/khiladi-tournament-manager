import mongoose from "mongoose";
import User from "../models/user.js";
import {
  findBestActiveEntitlement,
  buildAccessResultFromEntitlement,
} from "../services/accessEntitlementService.js";

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

  if (!safeUserId) {
    return buildDeniedResult({
      reason: "invalid-user",
      tournamentId: safeTournamentId,
      feature: safeFeature,
    });
  }

  const freshUser =
    user ||
    (await User.findById(safeUserId)
      .select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire")
      .lean());

  if (!freshUser) {
    return buildDeniedResult({
      reason: "user-not-found",
      tournamentId: safeTournamentId,
      feature: safeFeature,
    });
  }

  if (freshUser.isDeleted) {
    return buildDeniedResult({
      reason: "user-deleted",
      tournamentId: safeTournamentId,
      feature: safeFeature,
    });
  }

  if (freshUser.isSuspended || freshUser.blocked) {
    return buildDeniedResult({
      reason: "user-blocked",
      tournamentId: safeTournamentId,
      feature: safeFeature,
    });
  }

  const entitlement = await findBestActiveEntitlement({
    userId: safeUserId,
    tournamentId: safeTournamentId,
    feature: safeFeature,
  });

  if (!entitlement) {
    return buildDeniedResult({
      reason: "no-active-entitlement",
      tournamentId: safeTournamentId,
      feature: safeFeature,
    });
  }

  return buildAccessResultFromEntitlement({
    entitlement,
    tournamentId: safeTournamentId,
    feature: safeFeature,
  });
};

export default hasPremiumAccess;