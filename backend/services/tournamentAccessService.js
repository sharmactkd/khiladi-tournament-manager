// backend/services/tournamentAccessService.js

import mongoose from "mongoose";
import Tournament from "../models/tournament.js";
import hasPremiumAccess from "../utils/hasPremiumAccess.js";
import {
  findBestActiveEntitlement,
  buildAccessResultFromEntitlement,
} from "./accessEntitlementService.js";
import logger from "../utils/logger.js";

export const TOURNAMENT_LIFECYCLE = Object.freeze({
  UPCOMING: "upcoming",
  ONGOING: "ongoing",
  COMPLETED_GRACE: "completed_grace",
  ARCHIVED: "archived",
});

export const ACCESS_STATUS = Object.freeze({
  PUBLIC_VIEW: "public_view",
  OWNER_FREE: "owner_free",
  PREMIUM_ACTIVE: "premium_active",
  COMPLETED_GRACE: "completed_grace",
  ARCHIVED_READONLY: "archived_readonly",
});

export const MUTATION_MODES = Object.freeze({
  ENTRY: "entry",
  BASIC_CORRECTION: "basicCorrection",
  RESULT: "result",
  OFFICIAL: "official",
  PAYMENT: "payment",
  TIESHEET: "tiesheet",
  DESTRUCTIVE: "destructive",
  IMPORT: "import",
  EXPORT: "export",
});

const GRACE_DAYS = 7;
const PLAN_EXPIRY_REMINDER_DAYS = 10;

const normalizeId = (value) => {
  if (!value) return null;
  const id = String(value).trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const asDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days));
  return d;
};

const isAdminUser = (user) => ["admin", "superadmin"].includes(user?.role);

const isSameId = (a, b) => {
  const left = normalizeId(a);
  const right = normalizeId(b);
  return Boolean(left && right && left === right);
};

const getUserId = (user) => normalizeId(user?._id || user?.id || user?.userId);

export const calculateTournamentLifecycle = (tournament, now = new Date()) => {
  const dateFrom = asDate(tournament?.dateFrom);
  const dateTo = asDate(tournament?.dateTo);

  if (!dateFrom || !dateTo) {
    return {
      internalLifecycle: TOURNAMENT_LIFECYCLE.ARCHIVED,
      graceEndsAt: null,
      isUpcoming: false,
      isOngoing: false,
      isCompletedGrace: false,
      isArchived: true,
    };
  }

  const graceEndsAt = addDays(dateTo, GRACE_DAYS);

  const isUpcoming = now < dateFrom;
  const isOngoing = now >= dateFrom && now <= dateTo;
  const isCompletedGrace = now > dateTo && now <= graceEndsAt;
  const isArchived = now > graceEndsAt;

  let internalLifecycle = TOURNAMENT_LIFECYCLE.ARCHIVED;

  if (isUpcoming) internalLifecycle = TOURNAMENT_LIFECYCLE.UPCOMING;
  else if (isOngoing) internalLifecycle = TOURNAMENT_LIFECYCLE.ONGOING;
  else if (isCompletedGrace) internalLifecycle = TOURNAMENT_LIFECYCLE.COMPLETED_GRACE;

  return {
    internalLifecycle,
    graceEndsAt,
    isUpcoming,
    isOngoing,
    isCompletedGrace,
    isArchived,
  };
};

const getSnapshotAccess = (tournament) => {
  const snapshot = tournament?.premiumSnapshot;

  if (!snapshot?.hasPremiumAccess) return null;

  return {
    hasAccess: true,
    reason: "tournament-premium-snapshot",
    expiresAt: null,
    source: snapshot.source || "premium_snapshot",
    accessType: snapshot.accessType || "tournament_snapshot",
    planType: snapshot.planType || null,
    paymentId: null,
    tournamentId: tournament?._id || null,
    feature: "",
    featureAllowed: true,
    accessPriority: 0,
    entitlementId: snapshot.sourceEntitlementId || null,
    planExpiresAt: snapshot.planExpiresAt || null,
    snapshot: true,
  };
};

const shouldShowPlanExpiryReminder = (premiumAccess) => {
  if (!premiumAccess?.hasAccess) return false;

  const accessType = String(premiumAccess.accessType || "").toLowerCase();
  const planType = String(premiumAccess.planType || "").toLowerCase();

  if (accessType === "tournament") return false;
  if (planType === "single") return false;
  if (planType.includes("lifetime")) return false;
  if (premiumAccess.snapshot) return false;

  const expiresAt = asDate(
    premiumAccess.expiresAt ||
      premiumAccess.accessExpiresAt ||
      premiumAccess.planExpiresAt
  );

  if (!expiresAt) return false;

  const now = new Date();
  if (expiresAt <= now) return false;

  const diffDays = Math.ceil(
    (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return diffDays > 0 && diffDays <= PLAN_EXPIRY_REMINDER_DAYS;
};

export const getTournamentPremiumAccess = async ({
  user,
  tournament,
  feature = "",
}) => {
  if (!user || !tournament) {
    return {
      hasAccess: false,
      reason: "missing-user-or-tournament",
      expiresAt: null,
      planExpiresAt: null,
    };
  }

  if (isAdminUser(user)) {
    return {
      hasAccess: true,
      reason: "admin-bypass",
      source: "admin",
      accessType: "admin",
      planType: "admin",
      expiresAt: null,
      planExpiresAt: null,
      entitlementId: null,
    };
  }

  const snapshotAccess = getSnapshotAccess(tournament);
  if (snapshotAccess?.hasAccess) return snapshotAccess;

  const access = await hasPremiumAccess({
    userId: getUserId(user),
    tournamentId: tournament?._id,
    feature,
  });

  return {
    ...access,
    planExpiresAt: access?.expiresAt || null,
  };
};

export const calculateTournamentAccess = async ({
  tournament,
  user = null,
  feature = "",
  now = new Date(),
}) => {
  const lifecycle = calculateTournamentLifecycle(tournament, now);

  const userId = getUserId(user);
  const ownerId = normalizeId(tournament?.createdBy?._id || tournament?.createdBy);

  const admin = isAdminUser(user);
  const isOwner = Boolean(admin || isSameId(userId, ownerId));
  const isPublicVisible = tournament?.visibility !== false;

  const premium = isOwner
    ? await getTournamentPremiumAccess({ user, tournament, feature })
    : { hasAccess: false, reason: "not-owner" };

  const hasPremiumAccessValue = Boolean(admin || premium?.hasAccess);

  const canView = Boolean(isPublicVisible || isOwner);

  const isUpcomingOrOngoing =
    lifecycle.internalLifecycle === TOURNAMENT_LIFECYCLE.UPCOMING ||
    lifecycle.internalLifecycle === TOURNAMENT_LIFECYCLE.ONGOING;

  const isGrace = lifecycle.internalLifecycle === TOURNAMENT_LIFECYCLE.COMPLETED_GRACE;
  const isArchived = lifecycle.internalLifecycle === TOURNAMENT_LIFECYCLE.ARCHIVED;

  let lifecycleStatus = ACCESS_STATUS.PUBLIC_VIEW;

  if (isOwner && isArchived) lifecycleStatus = ACCESS_STATUS.ARCHIVED_READONLY;
  else if (isOwner && isGrace) lifecycleStatus = ACCESS_STATUS.COMPLETED_GRACE;
  else if (isOwner && hasPremiumAccessValue) lifecycleStatus = ACCESS_STATUS.PREMIUM_ACTIVE;
  else if (isOwner) lifecycleStatus = ACCESS_STATUS.OWNER_FREE;

  const canAccessEntry = Boolean(isOwner);
  const canAccessTeamSubmissions = Boolean(isOwner);

  const canAccessPremiumPages = Boolean(
    isOwner && (hasPremiumAccessValue || isGrace || isArchived)
  );

  const canCorrectBasicData = Boolean(isOwner && isGrace);
  const isReadOnly = Boolean(isOwner && isArchived);

  const canEdit = Boolean(
    isOwner &&
      !isArchived &&
      (isUpcomingOrOngoing || isGrace)
  );

  const canPrint = Boolean(isOwner && (hasPremiumAccessValue || isGrace || isArchived));
  const canExport = Boolean(isOwner && (hasPremiumAccessValue || isGrace || isArchived));

  return {
    lifecycleStatus,
    internalLifecycle: lifecycle.internalLifecycle,
    isOwner,
    isAdmin: admin,
    hasPremiumAccess: hasPremiumAccessValue,
    canView,
    canAccessEntry,
    canAccessTeamSubmissions,
    canAccessPremiumPages,
    canEdit,
    canCorrectBasicData,
    canPrint,
    canExport,
    isReadOnly,
    graceEndsAt: lifecycle.graceEndsAt,
    planExpiresAt: premium?.planExpiresAt || premium?.expiresAt || null,
    shouldShowPlanExpiryReminder: shouldShowPlanExpiryReminder(premium),
    premiumAccess: premium,
  };
};

export const getTournamentAccessById = async ({
  tournamentId,
  user = null,
  feature = "",
  select = "",
}) => {
  const safeTournamentId = normalizeId(tournamentId);

  if (!safeTournamentId) {
    const error = new Error("Invalid tournament ID format");
    error.statusCode = 400;
    throw error;
  }

  const tournament = await Tournament.findById(safeTournamentId).select(select);

  if (!tournament) {
    const error = new Error("Tournament not found");
    error.statusCode = 404;
    throw error;
  }

  const access = await calculateTournamentAccess({
    tournament,
    user,
    feature,
  });

  return { tournament, access };
};

export const canMutateTournament = ({ access, mode }) => {
  if (!access?.isOwner) {
    return { allowed: false, reason: "owner-access-required" };
  }

  if (access.isReadOnly || access.internalLifecycle === TOURNAMENT_LIFECYCLE.ARCHIVED) {
    return { allowed: false, reason: "tournament-archived-readonly" };
  }

  if (mode === MUTATION_MODES.EXPORT) {
    return access.canExport
      ? { allowed: true }
      : { allowed: false, reason: "export-not-allowed" };
  }

  if ([MUTATION_MODES.DESTRUCTIVE, MUTATION_MODES.IMPORT].includes(mode)) {
    if (access.internalLifecycle === TOURNAMENT_LIFECYCLE.COMPLETED_GRACE) {
      return {
        allowed: false,
        reason: "destructive-action-blocked-during-grace",
      };
    }

    return access.hasPremiumAccess
      ? { allowed: true }
      : { allowed: false, reason: "premium-access-required" };
  }

  if (mode === MUTATION_MODES.ENTRY) {
    if (
      access.internalLifecycle === TOURNAMENT_LIFECYCLE.UPCOMING ||
      access.internalLifecycle === TOURNAMENT_LIFECYCLE.ONGOING
    ) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "entry-edit-not-allowed-in-current-lifecycle",
    };
  }

  if (
    [
      MUTATION_MODES.BASIC_CORRECTION,
      MUTATION_MODES.RESULT,
      MUTATION_MODES.OFFICIAL,
      MUTATION_MODES.PAYMENT,
    ].includes(mode)
  ) {
    if (access.internalLifecycle === TOURNAMENT_LIFECYCLE.COMPLETED_GRACE) {
      return { allowed: true };
    }

    if (
      access.hasPremiumAccess &&
      [TOURNAMENT_LIFECYCLE.UPCOMING, TOURNAMENT_LIFECYCLE.ONGOING].includes(
        access.internalLifecycle
      )
    ) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "correction-not-allowed-in-current-lifecycle",
    };
  }

  if (mode === MUTATION_MODES.TIESHEET) {
    if (!access.hasPremiumAccess) {
      return { allowed: false, reason: "premium-access-required" };
    }

    if (
      [TOURNAMENT_LIFECYCLE.UPCOMING, TOURNAMENT_LIFECYCLE.ONGOING].includes(
        access.internalLifecycle
      )
    ) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "tiesheet-mutation-not-allowed-in-current-lifecycle",
    };
  }

  return { allowed: false, reason: "unknown-mutation-mode" };
};

export const buildPremiumSnapshotForTournament = async ({ userId }) => {
  const safeUserId = normalizeId(userId);

  const emptySnapshot = {
    hasPremiumAccess: false,
    sourceEntitlementId: null,
    source: "",
    planType: "",
    accessType: "",
    grantedAt: null,
    planExpiresAt: null,
    metadata: {},
  };

  if (!safeUserId) return emptySnapshot;

  try {
    const entitlement = await findBestActiveEntitlement({
      userId: safeUserId,
      tournamentId: null,
      feature: "",
    });

    if (!entitlement) return emptySnapshot;

    const access = buildAccessResultFromEntitlement({
      entitlement,
      tournamentId: null,
      feature: "",
    });

    const accessType = String(access?.accessType || entitlement.accessType || "").toLowerCase();

    if (accessType === "tournament") return emptySnapshot;

    return {
      hasPremiumAccess: true,
      sourceEntitlementId: entitlement._id,
      source: entitlement.source || "",
      planType: entitlement.planType || "",
      accessType: entitlement.accessType || "",
      grantedAt: new Date(),
      planExpiresAt: entitlement.expiresAt || null,
      metadata: {
        entitlementScope: entitlement.scope,
        entitlementPriority: entitlement.priority,
        features:
          entitlement?.metadata?.features ||
          entitlement?.metadata?.planSnapshot?.features ||
          [],
      },
    };
  } catch (error) {
    logger.error("Failed to build tournament premium snapshot", {
      userId: safeUserId,
      error: error.message,
      stack: error.stack,
    });

    return emptySnapshot;
  }
};